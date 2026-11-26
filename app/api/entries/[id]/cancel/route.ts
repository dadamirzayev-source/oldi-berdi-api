import { requireSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { EntryRow, jsonError, rowToEntry } from "@/lib/entries";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/entries/[id]/cancel
 * Creator cancels own PENDING entry → REJECTED (visible on sync for the other party).
 * Counterpart of reject (which only the other role may call).
 */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const auth = await requireSession(req);
    if ("error" in auth) return auth.error;
    const { session } = auth;
    const { id } = await ctx.params;

    const rows = await sql<EntryRow>(
      "select * from entries where id = $1 and pair_code = $2",
      [id, session.pair_code],
    );
    if (rows.length === 0) return jsonError("Yozuv topilmadi", 404);
    const entry = rows[0];
    if (entry.status !== "PENDING") {
      return jsonError("Faqat kutilayotgan yozuvni bekor qilish mumkin");
    }
    if (entry.created_by !== session.role) {
      return jsonError("Faqat o‘zingiz yaratgan yozuvni bekor qila olasiz", 403);
    }

    const now = Date.now();
    await sql(
      `update entries set status = 'REJECTED', confirmed_at = $1, confirmed_by = $2, updated_at = $1
       where id = $3 and pair_code = $4 and status = 'PENDING'`,
      [now, session.role, id, session.pair_code],
    );
    const updated = await sql<EntryRow>(
      "select * from entries where id = $1 and pair_code = $2",
      [id, session.pair_code],
    );
    if (updated.length === 0) return jsonError("Yozuv topilmadi", 404);
    return Response.json({ ok: true, entry: rowToEntry(updated[0]) });
  } catch (e) {
    console.error("cancel failed", e);
    return jsonError("cancel failed", 500);
  }
}
