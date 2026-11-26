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

const OTP_TTL_MS = 10 * 60 * 1000;
const TICKET_TTL_MS = 15 * 60 * 1000;

export function hashOtp(code: string): string {
  return createHash("sha256").update(`otp:${code.trim()}`).digest("hex");
}

export function generateOtpCode(): string {
  // 6-digit, avoid leading ambiguity
  const n = randomBytes(3).readUIntBE(0, 3) % 1_000_000;
  return n.toString().padStart(6, "0");
}

export async function storeOtp(args: {
  pairCode: string;
  role: "A" | "B";
  email: string;
  code: string;
}): Promise<void> {
  const id = newSessionToken();
  const now = Date.now();
  // Invalidate previous unused OTPs for this role/email
  await sql(
    `update email_otps set consumed_at = $1
     where pair_code = $2 and role = $3 and email = $4 and consumed_at is null`,
    [now, args.pairCode, args.role, args.email],
  );
  await sql(
    `insert into email_otps
      (id, pair_code, role, email, code_hash, expires_at, consumed_at, created_at)
     values ($1,$2,$3,$4,$5,$6,null,$7)`,
    [
      id,
      args.pairCode,
      args.role,
      args.email,
      hashOtp(args.code),
      now + OTP_TTL_MS,
      now,
    ],
  );
}

export async function consumeOtp(args: {
  pairCode: string;
  role: "A" | "B";
  email: string;
  code: string;
}): Promise<boolean> {
  const now = Date.now();
  const rows = await sql<{ id: string; code_hash: string; expires_at: number | string }>(
    `select id, code_hash, expires_at from email_otps
     where pair_code = $1 and role = $2 and email = $3 and consumed_at is null
     order by created_at desc limit 1`,
    [args.pairCode, args.role, args.email],
  );
  if (rows.length === 0) return false;
  const row = rows[0];
  if (Number(row.expires_at) < now) return false;
  const expected = Buffer.from(row.code_hash, "hex");
  const actual = Buffer.from(hashOtp(args.code), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return false;
  }
  await sql("update email_otps set consumed_at = $1 where id = $2", [now, row.id]);
  return true;
}

export async function createOtpTicket(args: {
  pairCode: string;
  role: "A" | "B";
  email: string;
  purpose: "set_pin" | "reset_pin";
}): Promise<{ token: string; expires_at: number }> {
  const token = newSessionToken();
  const now = Date.now();
  const expires = now + TICKET_TTL_MS;
  await sql(
    `insert into otp_tickets
      (token, pair_code, role, email, purpose, expires_at, created_at)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [token, args.pairCode, args.role, args.email, args.purpose, expires, now],
  );
  return { token, expires_at: expires };
}

export async function consumeOtpTicket(
  token: string,
  purpose?: "set_pin" | "reset_pin",
): Promise<{
  pair_code: string;
  role: "A" | "B";
  email: string;
  purpose: "set_pin" | "reset_pin";
} | null> {
  const rows = await sql<{
    pair_code: string;
    role: string;
    email: string;
    purpose: string;
    expires_at: number | string;
  }>("select pair_code, role, email, purpose, expires_at from otp_tickets where token = $1", [
    token,
  ]);
  if (rows.length === 0) return null;
  const row = rows[0];
  if (purpose && row.purpose !== purpose) return null;
  if (row.purpose !== "set_pin" && row.purpose !== "reset_pin") return null;
  if (Number(row.expires_at) < Date.now()) {
    await sql("delete from otp_tickets where token = $1", [token]);
    return null;
  }
  const role = normalizeRole(row.role);
  if (!role) return null;
  await sql("delete from otp_tickets where token = $1", [token]);
  return {
    pair_code: row.pair_code,
    role,
    email: row.email,
    purpose: row.purpose,
  };
}
