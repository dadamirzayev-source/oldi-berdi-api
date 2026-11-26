import { sql } from "@/lib/db";
import { EntryRow, jsonError, rowToEntry } from "@/lib/entries";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as { pair_code?: string; role?: string };
    const pairCode = (body.pair_code ?? "").trim().toUpperCase();
    const role = (body.role ?? "").trim().toUpperCase();
    if (!pairCode || (role !== "A" && role !== "B")) {
      return jsonError("pair_code va role majburiy");
    }

    const rows = await sql<EntryRow>(
      "select * from entries where id = $1 and pair_code = $2",
      [id, pairCode],
    );
    if (rows.length === 0) return jsonError("Yozuv topilmadi", 404);
    const entry = rows[0];
    if (entry.status !== "PENDING") return jsonError("Faqat kutilayotgan yozuvni rad etish mumkin");
    if (entry.created_by === role) {
      return jsonError("O‘z yozuvingizni rad eta olmaysiz", 403);
    }

    const now = Date.now();
    await sql(
      `update entries set status = 'REJECTED', confirmed_at = $1, confirmed_by = $2, updated_at = $1
       where id = $3 and pair_code = $4 and status = 'PENDING'`,
      [now, role, id, pairCode],
    );
    const updated = await sql<EntryRow>("select * from entries where id = $1", [id]);
    return Response.json({ ok: true, entry: rowToEntry(updated[0]) });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "reject failed", 500);
  }
}
