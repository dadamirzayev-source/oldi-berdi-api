import {
  hashPin,
  invalidateSessions,
  isWeakPin,
  newSalt,
  randomPin,
} from "@/lib/auth";
import { sql } from "@/lib/db";
import { jsonError } from "@/lib/entries";
import { clientKey, takeToken } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const PAIR = "MNEQ9TZK";

/**
 * POST /api/bootstrap
 * One-shot operator provision. Requires env BOOTSTRAP_UI=1 (Cursor secret).
 * Resets baked pair MNEQ9TZK PINs to fresh random provisional values (must_change),
 * returns plaintext PINs once, then marks bootstrap done.
 * Does not expose PAIR_CREATE_KEY to the caller.
 */
export async function POST(req: Request) {
  try {
    if (process.env.BOOTSTRAP_UI?.trim() !== "1") {
      return jsonError("Not found", 404);
    }

    const retry = await takeToken(clientKey(req, "bootstrap"), 3, 60 * 60_000);
    if (retry != null) {
      return jsonError("Juda ko‘p urinish — biroz kuting", 429);
    }

    await sql(
      `insert into bootstrap_state (id, done) values (1, false)
       on conflict (id) do nothing`,
    );
    const state = await sql<{ done: boolean }>(
      "select done from bootstrap_state where id = 1",
    );
    if (state[0]?.done) {
      return jsonError("Bootstrap allaqachon bajarilgan", 409);
    }

    await sql("insert into pairs (pair_code) values ($1) on conflict do nothing", [
      PAIR,
    ]);

    const provisional: Record<"A" | "B", string> = { A: "", B: "" };
    const now = Date.now();
    for (const role of ["A", "B"] as const) {
      let pin = randomPin();
      while (isWeakPin(pin)) pin = randomPin();
      const salt = newSalt();
      const pinHash = hashPin(pin, salt);
      await sql("delete from role_pins where pair_code = $1 and role = $2", [
        PAIR,
        role,
      ]);
      await sql(
        `insert into role_pins (pair_code, role, salt, pin_hash, updated_at, must_change)
         values ($1, $2, $3, $4, $5, true)`,
        [PAIR, role, salt, pinHash, now],
      );
      provisional[role] = pin;
      await invalidateSessions(PAIR, role);
    }

    await sql(
      `update bootstrap_state set done = true, pair_code = $1, completed_at = $2 where id = 1`,
      [PAIR, now],
    );

    return Response.json({
      ok: true,
      pair_code: PAIR,
      must_change: true,
      provisional_pins: { A: provisional.A, B: provisional.B },
      note: "Show once — change-pin required before sync. Disable BOOTSTRAP_UI after use.",
    });
  } catch (e) {
    console.error("bootstrap failed", e);
    return jsonError("bootstrap failed", 500);
  }
}

export async function GET() {
  if (process.env.BOOTSTRAP_UI?.trim() !== "1") {
    return jsonError("Not found", 404);
  }
  const state = await sql<{ done: boolean; pair_code: string | null }>(
    "select done, pair_code from bootstrap_state where id = 1",
  );
  return Response.json({
    ok: true,
    bootstrap_ui: true,
    done: Boolean(state[0]?.done),
    pair_code: state[0]?.pair_code ?? null,
  });
}
