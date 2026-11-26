import { checkPairCreateKey, ensureDefaultPins } from "@/lib/auth";
import { sql } from "@/lib/db";
import { genPairCode, jsonError } from "@/lib/entries";
import { clientKey, takeToken } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

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
        return jsonError("Juftlik topilmadi", 404);
      }
      // Join: backfill provisional pins only if a role has none yet.
      const pins = await ensureDefaultPins(existing[0].pair_code);
      return Response.json({
        ok: true,
        pair_code: existing[0].pair_code,
        joined: true,
        pin_set_a: pins.pin_set_a,
        pin_set_b: pins.pin_set_b,
        must_change_a: pins.must_change_a,
        must_change_b: pins.must_change_b,
        seeded: pins.seeded,
      });
    }

    // Create requires PAIR_CREATE_KEY (header x-pair-create-key or Bearer).
    if (!checkPairCreateKey(req)) {
      return jsonError(
        "Juftlik yaratish uchun avtorizatsiya kerak (PAIR_CREATE_KEY)",
        401,
      );
    }

    const retryCreate = takeToken(clientKey(req, "pair-create"), 5, 60 * 60_000);
    if (retryCreate != null) {
      return jsonError("Juda ko‘p juftlik yaratish — keyinroq urinib ko‘ring", 429);
    }

    for (let i = 0; i < 8; i++) {
      const code = genPairCode();
      try {
        await sql("insert into pairs (pair_code) values ($1)", [code]);
        const pins = await ensureDefaultPins(code);
        return Response.json({
          ok: true,
          pair_code: code,
          created: true,
          pin_set_a: pins.pin_set_a,
          pin_set_b: pins.pin_set_b,
          must_change_a: pins.must_change_a,
          must_change_b: pins.must_change_b,
          seeded: pins.seeded,
          note: "Provisional PINs require change-pin before sync",
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
