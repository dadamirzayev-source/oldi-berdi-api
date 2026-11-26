import { PAIR_LOOKUP_DENIED } from "@/lib/auth";
import { sql } from "@/lib/db";
import { jsonError } from "@/lib/entries";
import { clientKey, takeToken } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/status?pair_code=
 * Reports pin flags only — does not seed credentials.
 * Unknown pairs get the same denial as auth failures (no enumeration).
 */
export async function GET(req: Request) {
  try {
    const retry = await takeToken(clientKey(req, "auth-status"), 60, 60_000);
    if (retry != null) {
      return jsonError("Juda ko‘p urinish — biroz kuting", 429);
    }

    const url = new URL(req.url);
    const pairCode = (url.searchParams.get("pair_code") ?? "").trim().toUpperCase();
    if (!pairCode) return jsonError("pair_code majburiy");

    const pair = await sql("select 1 from pairs where pair_code = $1", [pairCode]);
    if (pair.length === 0) return jsonError(PAIR_LOOKUP_DENIED, 401);

    const rows = await sql<{ role: string; must_change: boolean }>(
      "select role, must_change from role_pins where pair_code = $1",
      [pairCode],
    );
    const pinSetA = rows.some((r) => r.role === "A");
    const pinSetB = rows.some((r) => r.role === "B");
    const mustA = rows.some((r) => r.role === "A" && r.must_change);
    const mustB = rows.some((r) => r.role === "B" && r.must_change);

    return Response.json({
      ok: true,
      pair_code: pairCode,
      pin_set_a: pinSetA,
      pin_set_b: pinSetB,
      must_change_a: mustA,
      must_change_b: mustB,
      any_pin_set: pinSetA || pinSetB,
      both_pin_set: pinSetA && pinSetB,
    });
  } catch (e) {
    console.error("status failed", e);
    return jsonError("status failed", 500);
  }
}
