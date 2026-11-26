import { ensureDefaultPins } from "@/lib/auth";
import { sql } from "@/lib/db";
import { genPairCode, jsonError } from "@/lib/entries";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
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
      const pins = await ensureDefaultPins(existing[0].pair_code);
      return Response.json({
        ok: true,
        pair_code: existing[0].pair_code,
        joined: true,
        pin_set_a: pins.pin_set_a,
        pin_set_b: pins.pin_set_b,
        seeded: pins.seeded,
      });
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
          seeded: pins.seeded,
        });
      } catch {
        // collision — retry
      }
    }
    return jsonError("Juftlik yaratilmadi", 500);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "pair failed", 500);
  }
}
