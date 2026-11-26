import {
  checkPairCreateKey,
  hashPin,
  invalidateSessions,
  isWeakPin,
  newSalt,
  randomPin,
  validatePin,
} from "@/lib/auth";
import { sql } from "@/lib/db";
import { jsonError } from "@/lib/entries";
import { clientKey, takeToken } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const BAKED_PAIR = "MNEQ9TZK";

/**
 * POST /api/bootstrap
 * Operator-only: requires PAIR_CREATE_KEY (header x-pair-create-key or Bearer).
 * Resets baked pair MNEQ9TZK (or body.pair_code) provisional PINs and returns
 * plaintext once. Optional body.pin_a / pin_b to set chosen values (8–12 digits).
 */
export async function POST(req: Request) {
  try {
    if (!checkPairCreateKey(req)) {
      return jsonError("Bootstrap uchun avtorizatsiya kerak (PAIR_CREATE_KEY)", 401);
    }

    const retry = await takeToken(clientKey(req, "bootstrap"), 5, 60 * 60_000);
    if (retry != null) {
      return jsonError("Juda ko‘p urinish — biroz kuting", 429);
    }

    const body = (await req.json().catch(() => ({}))) as {
      pair_code?: string;
      pin_a?: string;
      pin_b?: string;
    };
    const pairCode = (body.pair_code ?? BAKED_PAIR).trim().toUpperCase() || BAKED_PAIR;

    let pinA = (body.pin_a ?? "").trim();
    let pinB = (body.pin_b ?? "").trim();
    if (pinA || pinB) {
      if (!pinA || !pinB) {
        return jsonError("pin_a va pin_b ikkalasi ham kerak");
      }
      const errA = validatePin(pinA);
      if (errA) return jsonError(`A: ${errA}`);
      const errB = validatePin(pinB);
      if (errB) return jsonError(`B: ${errB}`);
      if (pinA === pinB) {
        return jsonError("A va B PIN bir xil bo‘lmasligi kerak");
      }
    } else {
      pinA = randomPin();
      while (isWeakPin(pinA)) pinA = randomPin();
      pinB = randomPin();
      while (isWeakPin(pinB) || pinB === pinA) pinB = randomPin();
    }

    await sql("insert into pairs (pair_code) values ($1) on conflict do nothing", [
      pairCode,
    ]);

    const now = Date.now();
    const provisional: Record<"A" | "B", string> = { A: pinA, B: pinB };
    for (const role of ["A", "B"] as const) {
      const pin = provisional[role];
      const salt = newSalt();
      const pinHash = hashPin(pin, salt);
      await sql("delete from role_pins where pair_code = $1 and role = $2", [
        pairCode,
        role,
      ]);
      await sql(
        `insert into role_pins (pair_code, role, salt, pin_hash, updated_at, must_change)
         values ($1, $2, $3, $4, $5, true)`,
        [pairCode, role, salt, pinHash, now],
      );
      await invalidateSessions(pairCode, role);
    }

    await sql(
      `insert into bootstrap_state (id, done, pair_code, completed_at) values (1, true, $1, $2)
       on conflict (id) do update set done = true, pair_code = $1, completed_at = $2`,
      [pairCode, now],
    );

    return Response.json({
      ok: true,
      pair_code: pairCode,
      must_change: true,
      provisional_pins: { A: provisional.A, B: provisional.B },
      note: "Show once to create-key holder — change-pin required before sync.",
    });
  } catch (e) {
    console.error("bootstrap failed", e);
    return jsonError("bootstrap failed", 500);
  }
}

export async function GET(req: Request) {
  if (!checkPairCreateKey(req)) {
    return jsonError("Bootstrap uchun avtorizatsiya kerak (PAIR_CREATE_KEY)", 401);
  }
  const state = await sql<{ done: boolean; pair_code: string | null }>(
    "select done, pair_code from bootstrap_state where id = 1",
  );
  return Response.json({
    ok: true,
    done: Boolean(state[0]?.done),
    pair_code: state[0]?.pair_code ?? null,
  });
}
