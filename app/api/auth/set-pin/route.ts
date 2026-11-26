import {
  createSession,
  hashPin,
  isPinSet,
  newSalt,
  normalizeRole,
  validatePin,
} from "@/lib/auth";
import { sql } from "@/lib/db";
import { jsonError } from "@/lib/entries";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/set-pin
 * Body: { pair_code, role, pin }
 * First-run only (when that role has no PIN yet).
 */
export async function POST(req: Request) {
  try {
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
    if (pair.length === 0) return jsonError("Juftlik topilmadi", 404);

    if (await isPinSet(pairCode, role)) {
      return jsonError("PIN allaqachon bor — login qiling", 409);
    }

    const salt = newSalt();
    const pinHash = hashPin(pin, salt);
    const now = Date.now();
    await sql(
      `insert into role_pins (pair_code, role, salt, pin_hash, updated_at)
       values ($1, $2, $3, $4, $5)`,
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
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "set-pin failed", 500);
  }
}
