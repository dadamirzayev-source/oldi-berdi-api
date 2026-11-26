import {
  createHash,
  randomBytes,
  randomInt,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { sql } from "@/lib/db";
import { jsonError } from "@/lib/entries";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

/** Uniform message for unknown / unauthorized pair lookups (no enumeration). */
export const PAIR_LOOKUP_DENIED = "So‘rov rad etildi";

export type Session = {
  token: string;
  pair_code: string;
  role: "A" | "B";
  expires_at: number;
  must_change_pin: boolean;
};

export function normalizeRole(role: string | undefined | null): "A" | "B" | null {
  const r = (role ?? "").trim().toUpperCase();
  return r === "A" || r === "B" ? r : null;
}

export function hashPin(pin: string, saltHex: string): string {
  const salt = Buffer.from(saltHex, "hex");
  const derived = scryptSync(pin, salt, 32, { N: 16384, r: 8, p: 1 });
  return derived.toString("hex");
}

export function newSalt(): string {
  return randomBytes(16).toString("hex");
}

export function verifyPin(pin: string, saltHex: string, hashHex: string): boolean {
  try {
    const a = Buffer.from(hashPin(pin, saltHex), "hex");
    const b = Buffer.from(hashHex, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function newSessionToken(): string {
  return createHash("sha256")
    .update(randomBytes(32))
    .digest("hex");
}

export async function isPinSet(pairCode: string, role: "A" | "B"): Promise<boolean> {
  const rows = await sql(
    "select 1 from role_pins where pair_code = $1 and role = $2",
    [pairCode, role],
  );
  return rows.length > 0;
}

/** Cryptographically random 6-digit PIN (may include leading zeros). */
export function randomPin(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Reject trivial / repeated / straight sequences — no fixed credentials in source. */
export function isWeakPin(pin: string): boolean {
  const p = pin.trim();
  if (!/^\d{6,12}$/.test(p)) return true;
  if (/^(\d)\1+$/.test(p)) return true; // 000000, 111111, …
  // paired repeats e.g. 112233 / 121212
  if (/^(\d{2})\1+$/.test(p) || /^(\d{3})\1+$/.test(p)) return true;
  let asc = true;
  let desc = true;
  for (let i = 1; i < p.length; i++) {
    const a = Number(p[i - 1]);
    const b = Number(p[i]);
    if (b !== (a + 1) % 10) asc = false;
    if (b !== (a + 9) % 10) desc = false;
  }
  if (asc || desc) return true;
  return false;
}

/**
 * Seed both roles with random provisional PINs when missing.
 * Returns plaintext PINs only for roles just seeded (show once to create-key holder).
 */
export async function seedRandomPins(pairCode: string): Promise<{
  pin_set_a: boolean;
  pin_set_b: boolean;
  must_change_a: boolean;
  must_change_b: boolean;
  seeded: ("A" | "B")[];
  provisional_pins: Partial<Record<"A" | "B", string>>;
}> {
  const seeded: ("A" | "B")[] = [];
  const provisional_pins: Partial<Record<"A" | "B", string>> = {};
  const now = Date.now();
  for (const role of ["A", "B"] as const) {
    if (await isPinSet(pairCode, role)) continue;
    let pin = randomPin();
    while (isWeakPin(pin)) pin = randomPin();
    const salt = newSalt();
    const pinHash = hashPin(pin, salt);
    await sql(
      `insert into role_pins (pair_code, role, salt, pin_hash, updated_at, must_change)
       values ($1, $2, $3, $4, $5, true)`,
      [pairCode, role, salt, pinHash, now],
    );
    seeded.push(role);
    provisional_pins[role] = pin;
  }
  const flags = await sql<{ role: string; must_change: boolean }>(
    "select role, must_change from role_pins where pair_code = $1",
    [pairCode],
  );
  const byRole = Object.fromEntries(
    flags.map((r) => [r.role, Boolean(r.must_change)]),
  ) as Record<string, boolean>;
  return {
    pin_set_a: flags.some((r) => r.role === "A"),
    pin_set_b: flags.some((r) => r.role === "B"),
    must_change_a: Boolean(byRole.A),
    must_change_b: Boolean(byRole.B),
    seeded,
    provisional_pins,
  };
}

export async function pinStatus(pairCode: string): Promise<{
  pin_set_a: boolean;
  pin_set_b: boolean;
  must_change_a: boolean;
  must_change_b: boolean;
}> {
  const flags = await sql<{ role: string; must_change: boolean }>(
    "select role, must_change from role_pins where pair_code = $1",
    [pairCode],
  );
  const byRole = Object.fromEntries(
    flags.map((r) => [r.role, Boolean(r.must_change)]),
  ) as Record<string, boolean>;
  return {
    pin_set_a: flags.some((r) => r.role === "A"),
    pin_set_b: flags.some((r) => r.role === "B"),
    must_change_a: Boolean(byRole.A),
    must_change_b: Boolean(byRole.B),
  };
}

export async function createSession(pairCode: string, role: "A" | "B"): Promise<Session> {
  const token = newSessionToken();
  const now = Date.now();
  const expires = now + SESSION_TTL_MS;
  await sql(
    `insert into sessions (token, pair_code, role, expires_at, created_at)
     values ($1, $2, $3, $4, $5)`,
    [token, pairCode, role, expires, now],
  );
  const pinRows = await sql<{ must_change: boolean }>(
    "select must_change from role_pins where pair_code = $1 and role = $2",
    [pairCode, role],
  );
  return {
    token,
    pair_code: pairCode,
    role,
    expires_at: expires,
    must_change_pin: Boolean(pinRows[0]?.must_change),
  };
}

export async function invalidateSessions(
  pairCode: string,
  role: "A" | "B",
  exceptToken?: string,
): Promise<void> {
  if (exceptToken) {
    await sql(
      "delete from sessions where pair_code = $1 and role = $2 and token <> $3",
      [pairCode, role, exceptToken],
    );
  } else {
    await sql("delete from sessions where pair_code = $1 and role = $2", [
      pairCode,
      role,
    ]);
  }
}

export async function requireSession(
  req: Request,
  opts: { allowMustChange?: boolean } = {},
): Promise<{ session: Session } | { error: Response }> {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim() ?? "";
  if (!token) {
    return { error: jsonError("Avtorizatsiya kerak (Bearer token)", 401) };
  }
  const rows = await sql<{
    token: string;
    pair_code: string;
    role: string;
    expires_at: number | string;
  }>("select token, pair_code, role, expires_at from sessions where token = $1", [token]);
  if (rows.length === 0) {
    return { error: jsonError("Sessiya topilmadi — qayta kiring", 401) };
  }
  const row = rows[0];
  const expires = Number(row.expires_at);
  if (expires < Date.now()) {
    await sql("delete from sessions where token = $1", [token]);
    return { error: jsonError("Sessiya muddati tugagan — qayta kiring", 401) };
  }
  const role = normalizeRole(row.role);
  if (!role) return { error: jsonError("Noto‘g‘ri sessiya", 401) };

  const pinRows = await sql<{ must_change: boolean }>(
    "select must_change from role_pins where pair_code = $1 and role = $2",
    [row.pair_code, role],
  );
  const mustChange = Boolean(pinRows[0]?.must_change);
  if (mustChange && !opts.allowMustChange) {
    return {
      error: jsonError("Avval PIN’ni o‘zgartiring (change-pin)", 403),
    };
  }

  return {
    session: {
      token: row.token,
      pair_code: row.pair_code,
      role,
      expires_at: expires,
      must_change_pin: mustChange,
    },
  };
}

export function validatePinFormat(pin: string): string | null {
  const p = pin.trim();
  if (!/^\d{6,12}$/.test(p)) {
    return "PIN faqat 6–12 raqam bo‘lishi kerak";
  }
  return null;
}

/** Format + reject weak patterns (for new PINs only). */
export function validatePin(pin: string): string | null {
  const formatErr = validatePinFormat(pin);
  if (formatErr) return formatErr;
  if (isWeakPin(pin.trim())) {
    return "Bu PIN juda oddiy — boshqasini tanlang";
  }
  return null;
}

/** Timing-safe compare of create-key header to env secret. */
export function checkPairCreateKey(req: Request): boolean {
  const expected = process.env.PAIR_CREATE_KEY?.trim() ?? "";
  if (!expected) return false;
  const provided =
    req.headers.get("x-pair-create-key")?.trim() ||
    (() => {
      const auth = req.headers.get("authorization") ?? "";
      const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
      return m?.[1]?.trim() ?? "";
    })();
  if (!provided) return false;
  try {
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
