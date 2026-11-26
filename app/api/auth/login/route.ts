import {
  createSession,
  findRoleByPin,
  pinStatus,
  validatePin,
} from "@/lib/auth";
import { sql } from "@/lib/db";
import { jsonError } from "@/lib/entries";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/login
 * Body: { pair_code, pin }
 * Role inferred by matching PIN against role_pins for the pair.
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
    const pinErr = validatePin(pin);
    if (pinErr) return jsonError(pinErr);

    const pair = await sql("select 1 from pairs where pair_code = $1", [pairCode]);
    if (pair.length === 0) return jsonError("Juftlik topilmadi", 404);

    const status = await pinStatus(pairCode);
    if (!status.A && !status.B) {
      return jsonError("PIN hali o‘rnatilmagan — avval set-pin qiling", 404);
    }

    const matched = await findRoleByPin(pairCode, pin);
    if (!matched) return jsonError("PIN noto‘g‘ri", 401);
    if ("ambiguous" in matched) {
      return jsonError("PIN bir nechta rolga mos — PIN’larni farqlang", 409);
    }

    const session = await createSession(pairCode, matched.role);
    return Response.json({
      ok: true,
      pair_code: pairCode,
      role: matched.role,
      token: session.token,
      expires_at: session.expires_at,
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "login failed", 500);
  }
}
