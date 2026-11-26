import { requireSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { EntryRow, jsonError, rowToEntry } from "@/lib/entries";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = await requireSession(req);
    if ("error" in auth) return auth.error;
    const { session } = auth;

    const url = new URL(req.url);
    const since = Number(url.searchParams.get("since") ?? "0") || 0;

    const rows = await sql<EntryRow>(
      `select * from entries
       where pair_code = $1 and updated_at > $2
       order by updated_at asc`,
      [session.pair_code, since],
    );

    // Full sync (since=0): return all for this pair
    const all =
      since === 0
        ? await sql<EntryRow>(
            `select * from entries where pair_code = $1 order by updated_at asc`,
            [session.pair_code],
          )
        : rows;

    const pending = all.filter((r) => r.status === "PENDING").map(rowToEntry);
    const confirmed = all.filter((r) => r.status === "CONFIRMED").map(rowToEntry);
    const rejected = all.filter((r) => r.status === "REJECTED").map(rowToEntry);
    const cursor = all.reduce((max, r) => Math.max(max, Number(r.updated_at)), since);

    return Response.json({
      ok: true,
      role: session.role,
      pair_code: session.pair_code,
      pending,
      confirmed,
      rejected,
      cursor,
    });
  } catch (e) {
    console.error("sync failed", e);
    return jsonError("sync failed", 500);
  }
}
