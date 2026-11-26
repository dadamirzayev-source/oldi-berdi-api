export type EntryRow = {
  id: string;
  pair_code: string;
  type: string;
  created_by: string;
  status: string;
  goods_name: string | null;
  price: number | null;
  quantity: number | null;
  amount: number | null;
  currency: string;
  note: string | null;
  created_at: number | string;
  confirmed_at: number | string | null;
  confirmed_by: string | null;
  updated_at: number | string;
};

export function rowToEntry(row: EntryRow) {
  return {
    id: row.id,
    type: row.type,
    createdBy: row.created_by,
    status: row.status,
    goodsName: row.goods_name,
    price: row.price == null ? null : Number(row.price),
    quantity: row.quantity == null ? null : Number(row.quantity),
    amount: row.amount == null ? null : Number(row.amount),
    currency: row.currency,
    note: row.note,
    createdAt: Number(row.created_at),
    confirmedAt: row.confirmed_at == null ? null : Number(row.confirmed_at),
    confirmedBy: row.confirmed_by,
    updatedAt: Number(row.updated_at),
  };
}

export function genPairCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export function jsonError(error: string, status = 400) {
  return Response.json({ ok: false, error }, { status });
}
