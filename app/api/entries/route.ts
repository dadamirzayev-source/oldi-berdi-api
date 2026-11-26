import { requireSession } from "@/lib/auth";
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
    const auth = await requireSession(req);
    if ("error" in auth) return auth.error;
    const { session } = auth;

    const body = (await req.json()) as { entry?: IncomingEntry };
    const entry = body.entry;
    if (!entry?.id || !entry.type || !entry.currency) {
      return jsonError("entry majburiy");
    }

    const MAX_ENTRIES_PER_PAIR = 5_000;
    const countRows = await sql<{ n: number | string }>(
      "select count(*) as n from entries where pair_code = $1",
      [session.pair_code],
    );
    const existing = await sql<{ id: string }>(
      "select id from entries where pair_code = $1 and id = $2",
      [session.pair_code, entry.id],
    );
    if (existing.length === 0 && Number(countRows[0]?.n ?? 0) >= MAX_ENTRIES_PER_PAIR) {
      return jsonError("Juftlik uchun yozuvlar limiti to‘ldi", 429);
    }

    const now = Date.now();
    const createdBy = session.role;
    const createdAt = entry.createdAt ?? now;
    const updatedAt = now;

    await sql(
      `insert into entries (
        id, pair_code, type, created_by, status, goods_name, price, quantity, amount,
        currency, note, created_at, confirmed_at, confirmed_by, updated_at
      ) values (
        $1,$2,$3,$4,'PENDING',$5,$6,$7,$8,$9,$10,$11,null,null,$12
      )
      on conflict (pair_code, id) do update set
        type = excluded.type,
        goods_name = excluded.goods_name,
        price = excluded.price,
        quantity = excluded.quantity,
        amount = excluded.amount,
        currency = excluded.currency,
        note = excluded.note,
        updated_at = excluded.updated_at
      where entries.status = 'PENDING'
        and entries.created_by = $4
        and entries.pair_code = $2`,
      [
        entry.id,
        session.pair_code,
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

    const rows = await sql<EntryRow>(
      "select * from entries where id = $1 and pair_code = $2",
      [entry.id, session.pair_code],
    );
    if (rows.length === 0) return jsonError("Yozuv saqlanmadi", 409);
    return Response.json({ ok: true, entry: rowToEntry(rows[0]) });
  } catch (e) {
    console.error("create failed", e);
    return jsonError("create failed", 500);
  }
}
