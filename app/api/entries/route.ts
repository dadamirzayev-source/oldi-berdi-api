import { sql } from "@/lib/db";
import { EntryRow, jsonError, rowToEntry } from "@/lib/entries";

export const dynamic = "force-dynamic";

type IncomingEntry = {
  id?: string;
  type?: string;
  createdBy?: string;
  status?: string;
  goodsName?: string | null;
  price?: number | null;
  quantity?: number | null;
  amount?: number | null;
  currency?: string;
  note?: string | null;
  createdAt?: number;
  confirmedAt?: number | null;
  confirmedBy?: string | null;
  updatedAt?: number;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      pair_code?: string;
      role?: string;
      entry?: IncomingEntry;
    };
    const pairCode = (body.pair_code ?? "").trim().toUpperCase();
    const role = (body.role ?? "").trim().toUpperCase();
    const entry = body.entry;
    if (!pairCode || !role || !entry?.id || !entry.type || !entry.currency) {
      return jsonError("pair_code, role va entry majburiy");
    }
    if (role !== "A" && role !== "B") return jsonError("role A yoki B bo‘lishi kerak");

    const pair = await sql("select 1 from pairs where pair_code = $1", [pairCode]);
    if (pair.length === 0) return jsonError("Juftlik topilmadi", 404);

    const now = Date.now();
    const createdBy = (entry.createdBy ?? role).toUpperCase();
    const createdAt = entry.createdAt ?? now;
    const updatedAt = now;

    await sql(
      `insert into entries (
        id, pair_code, type, created_by, status, goods_name, price, quantity, amount,
        currency, note, created_at, confirmed_at, confirmed_by, updated_at
      ) values (
        $1,$2,$3,$4,'PENDING',$5,$6,$7,$8,$9,$10,$11,null,null,$12
      )
      on conflict (id) do update set
        type = excluded.type,
        goods_name = excluded.goods_name,
        price = excluded.price,
        quantity = excluded.quantity,
        amount = excluded.amount,
        currency = excluded.currency,
        note = excluded.note,
        updated_at = excluded.updated_at
      where entries.status = 'PENDING'`,
      [
        entry.id,
        pairCode,
        entry.type,
        createdBy,
        entry.goodsName ?? null,
        entry.price ?? null,
        entry.quantity ?? null,
        entry.amount ?? null,
        entry.currency,
        entry.note ?? null,
        createdAt,
        updatedAt,
      ],
    );

    const rows = await sql<EntryRow>("select * from entries where id = $1", [entry.id]);
    if (rows.length === 0) return jsonError("Yozuv saqlanmadi", 500);
    return Response.json({ ok: true, entry: rowToEntry(rows[0]) });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "create failed", 500);
  }
}
