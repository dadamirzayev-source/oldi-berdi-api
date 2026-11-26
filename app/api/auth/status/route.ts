import { ensureDefaultPins } from "@/lib/auth";
import { sql } from "@/lib/db";
import { jsonError } from "@/lib/entries";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/status?pair_code=
 * Backfills default PINs (A=123456, B=654321) when missing.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const pairCode = (url.searchParams.get("pair_code") ?? "").trim().toUpperCase();
    if (!pairCode) return jsonError("pair_code majburiy");

    const pair = await sql("select 1 from pairs where pair_code = $1", [pairCode]);
    if (pair.length === 0) return jsonError("Juftlik topilmadi", 404);

    const pins = await ensureDefaultPins(pairCode);
    return Response.json({
      ok: true,
      pair_code: pairCode,
      pin_set_a: pins.pin_set_a,
      pin_set_b: pins.pin_set_b,
      any_pin_set: true,
      both_pin_set: true,
      seeded: pins.seeded,
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "status failed", 500);
  }
}
