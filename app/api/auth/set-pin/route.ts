import {
  PAIR_LOOKUP_DENIED,
  createSession,
  hashPin,
  isPinSet,
  newSalt,
  normalizeRole,
  validatePin,
  verifyPin,
} from "@/lib/auth";
import { sql } from "@/lib/db";
import { jsonError } from "@/lib/entries";
import { clientKey, takeToken } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/set-pin
 * Body: { pair_code, role, pin }
 * First-run only for that role.
 */
export async function POST(req: Request) {
  try {
    const retry = takeToken(clientKey(req, "set-pin"), 10, 15 * 60_000);
    if (retry != null) {
      return jsonError("Juda ko‘p urinish — biroz kuting", 429);
    }

    const body = (await req.json()) as {
      pair_code?: string;
      role?: string;
      pin?: string;
    };
    const pairCode = (body.pair_code ?? "").trim().toUpperCase();
    const role = normalizeRole(body.role);
    const pin = (body.pin ?? "").trim();
    if (!pairCode || !role) return jsonError("pair_code va role majburiy");
    const pinErr = validatePin(pin);
    if (pinErr) return jsonError(pinErr);

    const pair = await sql("select 1 from pairs where pair_code = $1", [pairCode]);
    if (pair.length === 0) return jsonError(PAIR_LOOKUP_DENIED, 401);

    if (await isPinSet(pairCode, role)) {
      return jsonError("PIN allaqachon bor — login qiling", 409);
    }

    const otherRole = role === "A" ? "B" : "A";
    const other = await sql<{ salt: string; pin_hash: string }>(
      "select salt, pin_hash from role_pins where pair_code = $1 and role = $2",
      [pairCode, otherRole],
    );
    if (other[0] && verifyPin(pin, other[0].salt, other[0].pin_hash)) {
      return jsonError("Bu PIN boshqa rolga tegishli — boshqa PIN tanlang", 409);
    }

    const salt = newSalt();
    const pinHash = hashPin(pin, salt);
    const now = Date.now();
    await sql(
      `insert into role_pins (pair_code, role, salt, pin_hash, updated_at, must_change)
       values ($1, $2, $3, $4, $5, false)`,
      [pairCode, role, salt, pinHash, now],
    );

    const session = await createSession(pairCode, role);
    return Response.json({
      ok: true,
      created: true,
      pair_code: pairCode,
      role,
      token: session.token,
      expires_at: session.expires_at,
      must_change_pin: false,
      pin_set_a: role === "A" || (await isPinSet(pairCode, "A")),
      pin_set_b: role === "B" || (await isPinSet(pairCode, "B")),
    });
  } catch (e) {
    console.error("set-pin failed", e);
    return jsonError("set-pin failed", 500);
  }
}
