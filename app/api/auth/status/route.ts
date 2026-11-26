import { pinStatus } from "@/lib/auth";
import { sql } from "@/lib/db";
import { jsonError } from "@/lib/entries";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/status?pair_code=
 * Returns which roles already have a PIN (no email).
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const pairCode = (url.searchParams.get("pair_code") ?? "").trim().toUpperCase();
    if (!pairCode) return jsonError("pair_code majburiy");

    const pair = await sql("select 1 from pairs where pair_code = $1", [pairCode]);
    if (pair.length === 0) return jsonError("Juftlik topilmadi", 404);

    const pins = await pinStatus(pairCode);
    return Response.json({
      ok: true,
      pair_code: pairCode,
      pin_set: pins,
      roles: {
        A: { label: "Olimjon", pin_set: pins.A },
        B: { label: "Azizbek", pin_set: pins.B },
      },
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "status failed", 500);
  }
}
