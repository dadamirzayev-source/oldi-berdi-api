import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { sql } from "@/lib/db";
import { jsonError } from "@/lib/entries";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export type Session = {
  token: string;
  pair_code: string;
  role: "A" | "B";
  expires_at: number;
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

/** Which roles already have a PIN for this pair. */
export async function pinStatus(pairCode: string): Promise<{ A: boolean; B: boolean }> {
  const rows = await sql<{ role: string }>(
    "select role from role_pins where pair_code = $1",
    [pairCode],
  );
  const set = new Set(rows.map((r) => r.role.toUpperCase()));
  return { A: set.has("A"), B: set.has("B") };
}

/**
 * Resolve role by matching PIN against all role_pins for the pair.
 * Returns null if no match; { ambiguous: true } if both roles share the PIN.
 */
export async function findRoleByPin(
  pairCode: string,
  pin: string,
): Promise<{ role: "A" | "B" } | { ambiguous: true } | null> {
  const rows = await sql<{ role: string; salt: string; pin_hash: string }>(
    "select role, salt, pin_hash from role_pins where pair_code = $1",
    [pairCode],
  );
  const matches: ("A" | "B")[] = [];
  for (const row of rows) {
    const role = normalizeRole(row.role);
    if (!role) continue;
    if (verifyPin(pin, row.salt, row.pin_hash)) matches.push(role);
  }
  if (matches.length === 0) return null;
  if (matches.length > 1) return { ambiguous: true };
  return { role: matches[0] };
}

/** True if another role in this pair already uses this PIN. */
export async function pinUsedByOtherRole(
  pairCode: string,
  pin: string,
  exceptRole: "A" | "B",
): Promise<boolean> {
  const rows = await sql<{ role: string; salt: string; pin_hash: string }>(
    "select role, salt, pin_hash from role_pins where pair_code = $1 and role <> $2",
    [pairCode, exceptRole],
  );
  for (const row of rows) {
    if (verifyPin(pin, row.salt, row.pin_hash)) return true;
  }
  return false;
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
  return { token, pair_code: pairCode, role, expires_at: expires };
}

export async function requireSession(
  req: Request,
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
  return {
    session: {
      token: row.token,
      pair_code: row.pair_code,
      role,
      expires_at: expires,
    },
  };
}

export function validatePin(pin: string): string | null {
  const p = pin.trim();
  if (p.length < 4 || p.length > 32) return "PIN kamida 4, ko‘pi bilan 32 belgi";
  return null;
}
