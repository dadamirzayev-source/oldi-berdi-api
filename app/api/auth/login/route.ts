import {
  createSession,
  isPinSet,
  normalizeRole,
  validatePin,
  verifyPin,
} from "@/lib/auth";
import { sql } from "@/lib/db";
import { jsonError } from "@/lib/entries";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/login
 * Body: { pair_code, role, pin }
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

    if (!(await isPinSet(pairCode, role))) {
      return jsonError("PIN hali o‘rnatilmagan — birinchi marta PIN qo‘ying", 404);
    }

    const rows = await sql<{ salt: string; pin_hash: string }>(
      "select salt, pin_hash from role_pins where pair_code = $1 and role = $2",
      [pairCode, role],
    );
    const row = rows[0];
    if (!row || !verifyPin(pin, row.salt, row.pin_hash)) {
      return jsonError("PIN noto‘g‘ri", 401);
    }

    const session = await createSession(pairCode, role);
    return Response.json({
      ok: true,
      pair_code: pairCode,
      role,
      token: session.token,
      expires_at: session.expires_at,
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "login failed", 500);
  }
}
