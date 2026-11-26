import { createSession, validatePinFormat, verifyPin } from "@/lib/auth";
import { sql } from "@/lib/db";
import { jsonError } from "@/lib/entries";
import { clearBucket, clientKey, takeToken } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const FAIL_MSG = "Kirish rad etildi";

/**
 * POST /api/auth/login
 * Body: { pair_code, pin }
 * Unknown pair vs wrong PIN share the same error (no enumeration).
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      pair_code?: string;
      pin?: string;
    };
    const pairCode = (body.pair_code ?? "").trim().toUpperCase();
    const pin = (body.pin ?? "").trim();
    if (!pairCode) return jsonError("pair_code majburiy");
    const pinErr = validatePinFormat(pin);
    if (pinErr) return jsonError(pinErr);

    // Tight limits: per IP+pair and per IP (DB-backed, shared).
    const pairKey = clientKey(req, `login:${pairCode || "none"}`);
    const ipKey = clientKey(req, "login-ip");
    const retryPair = await takeToken(pairKey, 5, 30 * 60_000);
    if (retryPair != null) {
      return jsonError("Juda ko‘p urinish — biroz kuting", 429);
    }
    const retryIp = await takeToken(ipKey, 20, 60 * 60_000);
    if (retryIp != null) {
      return jsonError("Juda ko‘p urinish — biroz kuting", 429);
    }

    const pair = await sql("select 1 from pairs where pair_code = $1", [pairCode]);
    if (pair.length === 0) {
      return jsonError(FAIL_MSG, 401);
    }

    const rows = await sql<{
      role: string;
      salt: string;
      pin_hash: string;
      must_change: boolean;
    }>(
      "select role, salt, pin_hash, must_change from role_pins where pair_code = $1",
      [pairCode],
    );
    if (rows.length === 0) {
      return jsonError(FAIL_MSG, 401);
    }

    const matches = rows.filter(
      (row) =>
        (row.role === "A" || row.role === "B") &&
        verifyPin(pin, row.salt, row.pin_hash),
    );
    if (matches.length === 0) {
      return jsonError(FAIL_MSG, 401);
    }
    if (matches.length > 1) {
      return jsonError("PIN ikki rolga mos keldi — har xil PIN qo‘ying", 409);
    }

    await clearBucket(pairKey);

    const role = matches[0].role as "A" | "B";
    const session = await createSession(pairCode, role);
    return Response.json({
      ok: true,
      pair_code: pairCode,
      role,
      token: session.token,
      expires_at: session.expires_at,
      must_change_pin: session.must_change_pin,
    });
  } catch (e) {
    console.error("login failed", e);
    return jsonError("login failed", 500);
  }
}
