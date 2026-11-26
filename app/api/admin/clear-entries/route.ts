import { checkPairCreateKey } from "@/lib/auth";
import { sql } from "@/lib/db";
import { jsonError } from "@/lib/entries";
import { clientKey, takeToken } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const BAKED_PAIR = "MNEQ9TZK";

/**
 * POST /api/admin/clear-entries
 * Operator-only (PAIR_CREATE_KEY). Deletes all entries for a pair.
 * Does not touch pairs, role_pins, sessions, or bootstrap_state.
 */
export async function POST(req: Request) {
  try {
    if (!checkPairCreateKey(req)) {
      return jsonError("Clear-entries uchun avtorizatsiya kerak (PAIR_CREATE_KEY)", 401);
    }

    const retry = await takeToken(clientKey(req, "clear-entries"), 10, 60 * 60_000);
    if (retry != null) {
      return jsonError("Juda ko‘p urinish — biroz kuting", 429);
    }

    const body = (await req.json().catch(() => ({}))) as { pair_code?: string };
    const pairCode = (body.pair_code ?? BAKED_PAIR).trim().toUpperCase() || BAKED_PAIR;

    const deleted = await sql<{ id: string }>(
      "delete from entries where pair_code = $1 returning id",
      [pairCode],
    );
    const remaining = await sql<{ n: string }>(
      "select count(*)::text as n from entries where pair_code = $1",
      [pairCode],
    );

    return Response.json({
      ok: true,
      pair_code: pairCode,
      deleted: deleted.length,
      remaining: Number(remaining[0]?.n ?? 0),
      note: "Auth/pair/PINs unchanged. Clients should sync (since=0) to wipe local cache.",
    });
  } catch (e) {
    console.error("clear-entries failed", e);
    return jsonError("clear-entries failed", 500);
  }
}

/** GET: entry counts for a pair (PAIR_CREATE_KEY). */
export async function GET(req: Request) {
  try {
    if (!checkPairCreateKey(req)) {
      return jsonError("Clear-entries uchun avtorizatsiya kerak (PAIR_CREATE_KEY)", 401);
    }
    const url = new URL(req.url);
    const pairCode =
      (url.searchParams.get("pair_code") ?? BAKED_PAIR).trim().toUpperCase() || BAKED_PAIR;
    const rows = await sql<{ status: string; n: string }>(
      `select status, count(*)::text as n from entries where pair_code = $1 group by status`,
      [pairCode],
    );
    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const r of rows) {
      const n = Number(r.n);
      byStatus[r.status] = n;
      total += n;
    }
    return Response.json({ ok: true, pair_code: pairCode, total, by_status: byStatus });
  } catch (e) {
    console.error("clear-entries status failed", e);
    return jsonError("clear-entries status failed", 500);
  }
}
