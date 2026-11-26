import {
  consumeOtpTicket,
  createSession,
  hashPin,
  isPinSet,
  newSalt,
  validatePin,
} from "@/lib/auth";
import { sql } from "@/lib/db";
import { jsonError } from "@/lib/entries";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/set-pin
 * Body: { otp_ticket, pin }
 * Requires verified email OTP ticket (set_pin or reset_pin).
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { otp_ticket?: string; pin?: string };
    const ticket = (body.otp_ticket ?? "").trim();
    const pin = (body.pin ?? "").trim();
    if (!ticket) return jsonError("otp_ticket majburiy — avval email OTP");
    const pinErr = validatePin(pin);
    if (pinErr) return jsonError(pinErr);

    const claimed = await consumeOtpTicket(ticket);
    if (!claimed) {
      return jsonError("OTP ticket yaroqsiz — qayta kod oling", 401);
    }

    const { pair_code: pairCode, role, purpose } = claimed;
    const already = await isPinSet(pairCode, role);
    if (purpose === "set_pin" && already) {
      return jsonError("PIN allaqachon bor — login yoki reset", 409);
    }
    if (purpose === "reset_pin" && !already) {
      // Allow creating via reset ticket if somehow missing
    }

    const salt = newSalt();
    const pinHash = hashPin(pin, salt);
    const now = Date.now();
    if (already) {
      await sql(
        `update role_pins set salt = $1, pin_hash = $2, updated_at = $3
         where pair_code = $4 and role = $5`,
        [salt, pinHash, now, pairCode, role],
      );
      await sql("delete from sessions where pair_code = $1 and role = $2", [
        pairCode,
        role,
      ]);
    } else {
      await sql(
        `insert into role_pins (pair_code, role, salt, pin_hash, updated_at)
         values ($1, $2, $3, $4, $5)`,
        [pairCode, role, salt, pinHash, now],
      );
    }

    const session = await createSession(pairCode, role);
    return Response.json({
      ok: true,
      created: !already,
      reset: purpose === "reset_pin",
      pair_code: pairCode,
      role,
      token: session.token,
      expires_at: session.expires_at,
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "set-pin failed", 500);
  }
}
