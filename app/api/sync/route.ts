import { sql } from "@/lib/db";
import { EntryRow, jsonError, rowToEntry } from "@/lib/entries";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const pairCode = (url.searchParams.get("pair_code") ?? "").trim().toUpperCase();
    const role = (url.searchParams.get("role") ?? "").trim().toUpperCase();
    const since = Number(url.searchParams.get("since") ?? "0") || 0;
    if (!pairCode || (role !== "A" && role !== "B")) {
      return jsonError("pair_code va role majburiy");
    }

    const pair = await sql("select 1 from pairs where pair_code = $1", [pairCode]);
    if (pair.length === 0) return jsonError("Juftlik topilmadi", 404);

    const rows = await sql<EntryRow>(
      `select * from entries
       where pair_code = $1 and updated_at > $2
       order by updated_at asc`,
      [pairCode, since],
    );

    const pending = rows.filter((r) => r.status === "PENDING").map(rowToEntry);
    const confirmed = rows.filter((r) => r.status === "CONFIRMED").map(rowToEntry);
    const rejected = rows.filter((r) => r.status === "REJECTED").map(rowToEntry);
    const cursor = rows.reduce((max, r) => Math.max(max, Number(r.updated_at)), since);

    return Response.json({ ok: true, pending, confirmed, rejected, cursor });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "sync failed", 500);
  }
}
