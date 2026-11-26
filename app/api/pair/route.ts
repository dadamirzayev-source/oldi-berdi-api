import {
  PAIR_LOOKUP_DENIED,
  checkPairCreateKey,
  pinStatus,
  seedRandomPins,
} from "@/lib/auth";
import { sql } from "@/lib/db";
import { genPairCode, jsonError } from "@/lib/entries";
import { clientKey, takeToken } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

async function pairCount(): Promise<number> {
  const rows = await sql<{ n: string | number }>("select count(*)::int as n from pairs");
  return Number(rows[0]?.n ?? 0);
}

export async function POST(req: Request) {
  try {
    const retryJoin = takeToken(clientKey(req, "pair-join"), 30, 60_000);
    if (retryJoin != null) {
      return jsonError("Juda ko‘p urinish — biroz kuting", 429);
    }

    const body = (await req.json().catch(() => ({}))) as { pair_code?: string };
    const requested = (body.pair_code ?? "").trim().toUpperCase();

    if (requested) {
      const existing = await sql<{ pair_code: string }>(
        "select pair_code from pairs where pair_code = $1",
        [requested],
      );
      if (existing.length === 0) {
        return jsonError(PAIR_LOOKUP_DENIED, 401);
      }
      // Join: never seed credentials (create-key holder gets provisional PINs once).
      const pins = await pinStatus(existing[0].pair_code);
      return Response.json({
        ok: true,
        pair_code: existing[0].pair_code,
        joined: true,
        ...pins,
      });
    }

    // First pair only: allow bootstrap when DB has zero pairs (no create-key).
    // Any later create still requires PAIR_CREATE_KEY.
    const empty = (await pairCount()) === 0;
    if (!empty && !checkPairCreateKey(req)) {
      return jsonError(
        "Juftlik yaratish uchun avtorizatsiya kerak (PAIR_CREATE_KEY)",
        401,
      );
    }

    const retryCreate = takeToken(clientKey(req, "pair-create"), 5, 60 * 60_000);
    if (retryCreate != null) {
      return jsonError("Juda ko‘p juftlik yaratish — keyinroq urinib ko‘ring", 429);
    }

    // Re-check emptiness for bootstrap path (race with another create).
    if (empty && (await pairCount()) !== 0 && !checkPairCreateKey(req)) {
      return jsonError(
        "Juftlik yaratish uchun avtorizatsiya kerak (PAIR_CREATE_KEY)",
        401,
      );
    }

    for (let i = 0; i < 8; i++) {
      const code = genPairCode();
      try {
        await sql("insert into pairs (pair_code) values ($1)", [code]);
        const pins = await seedRandomPins(code);
        return Response.json({
          ok: true,
          pair_code: code,
          created: true,
          bootstrap: empty,
          pin_set_a: pins.pin_set_a,
          pin_set_b: pins.pin_set_b,
          must_change_a: pins.must_change_a,
          must_change_b: pins.must_change_b,
          seeded: pins.seeded,
          provisional_pins: pins.provisional_pins,
          note: "Provisional PINs shown once; change-pin required before sync",
        });
      } catch {
        // collision — retry
      }
    }
    return jsonError("Juftlik yaratilmadi", 500);
  } catch (e) {
    console.error("pair failed", e);
    return jsonError("pair failed", 500);
  }
}
