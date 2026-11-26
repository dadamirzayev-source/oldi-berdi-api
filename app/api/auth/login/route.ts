import { createSession, validatePin, verifyPin } from "@/lib/auth";
import { sql } from "@/lib/db";
import { jsonError } from "@/lib/entries";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/login
 * Body: { pair_code, pin }
 * Role is inferred by matching the PIN to role_pins (must be unique per role).
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

    const rows = await sql<{ role: string; salt: string; pin_hash: string }>(
      "select role, salt, pin_hash from role_pins where pair_code = $1",
      [pairCode],
    );
    if (rows.length === 0) {
      return jsonError("PIN hali o‘rnatilmagan — birinchi marta PIN qo‘ying", 404);
    }

    const matches = rows.filter(
      (row) =>
        (row.role === "A" || row.role === "B") &&
        verifyPin(pin, row.salt, row.pin_hash),
    );
    if (matches.length === 0) return jsonError("PIN noto‘g‘ri", 401);
    if (matches.length > 1) {
      return jsonError("PIN ikki rolga mos keldi — har xil PIN qo‘ying", 409);
    }

    const role = matches[0].role as "A" | "B";
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
