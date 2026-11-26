import { randomBytes, scryptSync } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import pg from "pg";

const url = process.env.DATABASE_URL?.trim() ?? "";
const files = (await readdir("migrations").catch(() => []))
  .filter((f) => f.endsWith(".sql"))
  .sort();
if (url === "" || files.length === 0) {
  console.log("migrate: nothing to do");
  process.exit(0);
}

function hashPin(pin, saltHex) {
  const salt = Buffer.from(saltHex, "hex");
  return scryptSync(pin, salt, 32, { N: 16384, r: 8, p: 1 }).toString("hex");
}

function pinOk(pin) {
  if (!/^\d{8,12}$/.test(pin)) return false;
  if (/^(\d)\1+$/.test(pin)) return false;
  if (/^(\d{2})\1+$/.test(pin) || /^(\d{3})\1+$/.test(pin)) return false;
  let asc = true;
  let desc = true;
  for (let i = 1; i < pin.length; i++) {
    const a = Number(pin[i - 1]);
    const b = Number(pin[i]);
    if (b !== (a + 1) % 10) asc = false;
    if (b !== (a + 9) % 10) desc = false;
  }
  return !(asc || desc);
}

/**
 * Operator-only seed: when OPERATOR_PIN_A + OPERATOR_PIN_B are set as Cursor
 * secrets on publish, reset the baked (or OPERATOR_PAIR_CODE) pair hashes.
 * Plaintext never lands in git — only env at build time.
 */
async function applyOperatorPins(client) {
  const pinA = process.env.OPERATOR_PIN_A?.trim() ?? "";
  const pinB = process.env.OPERATOR_PIN_B?.trim() ?? "";
  if (!pinA && !pinB) {
    return;
  }
  if (!pinA || !pinB) {
    console.log("migrate: OPERATOR_PIN_A/B both required — skipped");
    return;
  }
  if (!pinOk(pinA) || !pinOk(pinB) || pinA === pinB) {
    console.log("migrate: OPERATOR_PIN_A/B invalid — skipped");
    return;
  }
  const pairCode = (process.env.OPERATOR_PAIR_CODE?.trim() || "MNEQ9TZK").toUpperCase();
  const now = Date.now();
  await client.query("insert into pairs (pair_code) values ($1) on conflict do nothing", [
    pairCode,
  ]);
  for (const [role, pin] of [
    ["A", pinA],
    ["B", pinB],
  ]) {
    const salt = randomBytes(16).toString("hex");
    const pinHash = hashPin(pin, salt);
    await client.query("delete from role_pins where pair_code = $1 and role = $2", [
      pairCode,
      role,
    ]);
    await client.query(
      `insert into role_pins (pair_code, role, salt, pin_hash, updated_at, must_change)
       values ($1, $2, $3, $4, $5, true)`,
      [pairCode, role, salt, pinHash, now],
    );
    await client.query("delete from sessions where pair_code = $1 and role = $2", [
      pairCode,
      role,
    ]);
  }
  await client.query(
    `insert into bootstrap_state (id, done, pair_code, completed_at) values (1, true, $1, $2)
     on conflict (id) do update set done = true, pair_code = $1, completed_at = $2`,
    [pairCode, now],
  );
  // Do not log plaintext PINs.
  console.log(`migrate: operator pins applied for pair ${pairCode}`);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL_UNPOOLED?.trim() || url,
});
await client.connect();
try {
  await client.query("set lock_timeout = '60s'");
  await client.query("select pg_advisory_lock(7272741)");
  await client.query(
    "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  const done = new Set(
    (await client.query("select name from schema_migrations")).rows.map((r) => r.name),
  );
  for (const file of files.filter((f) => !done.has(f))) {
    await client.query("begin");
    try {
      await client.query(await readFile(`migrations/${file}`, "utf8"));
      await client.query("insert into schema_migrations (name) values ($1)", [file]);
      await client.query("commit");
      console.log(`migrate: applied ${file}`);
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
  await applyOperatorPins(client);
} finally {
  await client.end();
}
