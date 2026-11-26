import { isPinSet } from "@/lib/auth";
import { sql } from "@/lib/db";
import { jsonError } from "@/lib/entries";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/status?pair_code=
 * Reports which roles have a PIN (no client role picker for login).
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const pairCode = (url.searchParams.get("pair_code") ?? "").trim().toUpperCase();
    if (!pairCode) return jsonError("pair_code majburiy");

    const pair = await sql("select 1 from pairs where pair_code = $1", [pairCode]);
    if (pair.length === 0) return jsonError("Juftlik topilmadi", 404);

    const pinA = await isPinSet(pairCode, "A");
    const pinB = await isPinSet(pairCode, "B");
    return Response.json({
      ok: true,
      pair_code: pairCode,
      pin_set_a: pinA,
      pin_set_b: pinB,
      any_pin_set: pinA || pinB,
      both_pin_set: pinA && pinB,
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "status failed", 500);
  }
}
