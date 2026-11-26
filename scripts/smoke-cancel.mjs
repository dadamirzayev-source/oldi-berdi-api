/**
 * Local smoke for creator cancel + other-party reject sync.
 *
 * Requires env (no credential defaults — publish security review):
 *   PAIR_CREATE_KEY, SMOKE_PIN_A, SMOKE_PIN_B
 * Optional: SMOKE_BASE (default http://127.0.0.1:3456)
 *
 * Usage: --bootstrap | --set-pins | --run
 * (--set-pins needs the Next/PGlite process stopped so the on-disk DB can be updated)
 */
import { scryptSync, randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile, readFile, mkdir } from "node:fs/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:3456";
const STATE = join(root, ".data", "smoke-pair.json");

function requireEnv(name) {
  const v = process.env[name]?.trim() ?? "";
  if (!v) {
    throw new Error(`${name} env is required (no defaults in this script)`);
  }
  return v;
}

function hashPin(pin, saltHex) {
  const salt = Buffer.from(saltHex, "hex");
  return scryptSync(pin, salt, 32, { N: 16384, r: 8, p: 1 }).toString("hex");
}

async function json(method, path, { body, token, headers } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

export async function setPinsOffline(pairCode, pinA, pinB) {
  const dataDir = join(root, ".data", "pglite");
  await mkdir(dataDir, { recursive: true });
  const db = new PGlite(dataDir);
  await db.waitReady;
  const now = Date.now();
  for (const [role, pin] of [
    ["A", pinA],
    ["B", pinB],
  ]) {
    const salt = randomBytes(16).toString("hex");
    const pinHash = hashPin(pin, salt);
    await db.query(
      `update role_pins set salt = $1, pin_hash = $2, updated_at = $3, must_change = false
       where pair_code = $4 and role = $5`,
      [salt, pinHash, now, pairCode, role],
    );
    const check = await db.query(
      "select role from role_pins where pair_code = $1 and role = $2",
      [pairCode, role],
    );
    if (check.rows.length === 0) {
      throw new Error(`role_pins missing for ${pairCode}/${role}`);
    }
  }
  await db.close();
}

async function bootstrap() {
  const createKey = requireEnv("PAIR_CREATE_KEY");
  const created = await json("POST", "/api/pair", {
    body: {},
    headers: { "x-pair-create-key": createKey },
  });
  if (!created.data.ok) throw new Error("pair create failed: " + JSON.stringify(created));
  const pair = created.data.pair_code;
  await mkdir(join(root, ".data"), { recursive: true });
  await writeFile(STATE, JSON.stringify({ pair_code: pair }, null, 2));
  console.log("BOOTSTRAP_PAIR", pair);
  console.log("Stop Next, run --set-pins with SMOKE_PIN_A/B, restart, then --run");
}

async function setPinsCmd() {
  const pinA = requireEnv("SMOKE_PIN_A");
  const pinB = requireEnv("SMOKE_PIN_B");
  const state = JSON.parse(await readFile(STATE, "utf8"));
  await setPinsOffline(state.pair_code, pinA, pinB);
  console.log("PINS_SET", state.pair_code);
}

async function run() {
  const pinA = requireEnv("SMOKE_PIN_A");
  const pinB = requireEnv("SMOKE_PIN_B");
  const state = JSON.parse(await readFile(STATE, "utf8"));
  const pair = state.pair_code;

  const loginA = await json("POST", "/api/auth/login", {
    body: { pair_code: pair, pin: pinA },
  });
  const loginB = await json("POST", "/api/auth/login", {
    body: { pair_code: pair, pin: pinB },
  });
  if (!loginA.data.ok || !loginB.data.ok) {
    throw new Error("login failed: " + JSON.stringify({ loginA, loginB }));
  }
  const tokenA = loginA.data.token;
  const tokenB = loginB.data.token;
  console.log("roles", loginA.data.role, loginB.data.role);

  const id = `smoke-cancel-${Date.now()}`;
  const createdEntry = await json("POST", "/api/entries", {
    token: tokenA,
    body: {
      entry: {
        id,
        type: "MONEY",
        currency: "UZS",
        amount: 1000,
        note: "cancel smoke",
        createdAt: Date.now(),
      },
    },
  });
  if (!createdEntry.data.ok) throw new Error("create failed: " + JSON.stringify(createdEntry));
  console.log("created", createdEntry.data.entry.status);

  const syncB1 = await json("GET", "/api/sync?since=0", { token: tokenB });
  const pendingBefore = (syncB1.data.pending || []).filter((e) => e.id === id);
  console.log("B pending before cancel", pendingBefore.length);

  const rejectSelf = await json("POST", `/api/entries/${id}/reject`, { token: tokenA });
  console.log("reject-as-creator", rejectSelf.status, rejectSelf.data.error || rejectSelf.data.ok);

  const cancel = await json("POST", `/api/entries/${id}/cancel`, { token: tokenA });
  if (!cancel.data.ok) throw new Error("cancel failed: " + JSON.stringify(cancel));
  console.log("cancelled", cancel.data.entry.status, "by", cancel.data.entry.confirmedBy);

  const id2 = `smoke-cancel-b-${Date.now()}`;
  await json("POST", "/api/entries", {
    token: tokenA,
    body: {
      entry: {
        id: id2,
        type: "MONEY",
        currency: "UZS",
        amount: 500,
        note: "other cancel deny",
        createdAt: Date.now(),
      },
    },
  });
  const cancelOther = await json("POST", `/api/entries/${id2}/cancel`, { token: tokenB });
  console.log("cancel-as-other", cancelOther.status, cancelOther.data.error || cancelOther.data.ok);

  const syncB2 = await json("GET", "/api/sync?since=0", { token: tokenB });
  const pendingAfter = (syncB2.data.pending || []).filter((e) => e.id === id);
  const rejectedAfter = (syncB2.data.rejected || []).filter((e) => e.id === id);
  console.log("B pending after cancel", pendingAfter.length);
  console.log("B rejected after cancel", rejectedAfter.length, rejectedAfter[0]?.status);

  const rejectOther = await json("POST", `/api/entries/${id2}/reject`, { token: tokenB });
  if (!rejectOther.data.ok) throw new Error("reject other failed: " + JSON.stringify(rejectOther));
  const syncA = await json("GET", "/api/sync?since=0", { token: tokenA });
  const pendingId2 = (syncA.data.pending || []).filter((e) => e.id === id2);
  const rejectedId2 = (syncA.data.rejected || []).filter((e) => e.id === id2);
  console.log("A after B reject: pending", pendingId2.length, "rejected", rejectedId2.length);

  if (pendingBefore.length !== 1) throw new Error("expected pending before");
  if (pendingAfter.length !== 0) throw new Error("BUG: cancelled still pending for B");
  if (rejectedAfter.length !== 1) throw new Error("expected rejected after cancel");
  if (pendingId2.length !== 0 || rejectedId2.length !== 1) {
    throw new Error("reject-by-other sync broken");
  }
  console.log("SMOKE_OK");
}

const arg = process.argv[2] || "--help";
const fn =
  arg === "--bootstrap"
    ? bootstrap
    : arg === "--set-pins"
      ? setPinsCmd
      : arg === "--run"
        ? run
        : null;
if (!fn) {
  console.log("Usage: --bootstrap | --set-pins | --run");
  console.log("Required env: PAIR_CREATE_KEY (bootstrap), SMOKE_PIN_A, SMOKE_PIN_B (set-pins/run)");
  process.exit(1);
}
fn().catch((e) => {
  console.error(e);
  process.exit(1);
});
