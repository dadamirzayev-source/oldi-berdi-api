import { isPinSet, normalizeRole } from "@/lib/auth";
import { sql } from "@/lib/db";
import { jsonError } from "@/lib/entries";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/status?pair_code=&role=
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const pairCode = (url.searchParams.get("pair_code") ?? "").trim().toUpperCase();
    const role = normalizeRole(url.searchParams.get("role"));
    if (!pairCode || !role) return jsonError("pair_code va role majburiy");

    const pair = await sql("select 1 from pairs where pair_code = $1", [pairCode]);
    if (pair.length === 0) return jsonError("Juftlik topilmadi", 404);

    return Response.json({
      ok: true,
      pair_code: pairCode,
      role,
      pin_set: await isPinSet(pairCode, role),
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "status failed", 500);
  }
}
