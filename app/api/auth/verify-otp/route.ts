import {
  consumeOtp,
  createOtpTicket,
  isPinSet,
} from "@/lib/auth";
import { sql } from "@/lib/db";
import { jsonError } from "@/lib/entries";
import { emailMatchesRole, normalizeEmail, ROLE_EMAILS } from "@/lib/roles";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/verify-otp
 * Body: { pair_code, email, otp }
 * Returns otp_ticket for set_pin or reset_pin.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      pair_code?: string;
      email?: string;
      otp?: string;
    };
    const pairCode = (body.pair_code ?? "").trim().toUpperCase();
    const email = normalizeEmail(body.email ?? "");
    const otp = (body.otp ?? "").trim();
    if (!pairCode || !email || !otp) {
      return jsonError("pair_code, email va otp majburiy");
    }

    const pair = await sql("select 1 from pairs where pair_code = $1", [pairCode]);
    if (pair.length === 0) return jsonError("Juftlik topilmadi", 404);

    let role: "A" | "B" | null = null;
    if (email === ROLE_EMAILS.A) role = "A";
    else if (email === ROLE_EMAILS.B) role = "B";
    if (!role || !emailMatchesRole(role, email)) {
      return jsonError("Bu email ruxsat etilmagan", 403);
    }

    const ok = await consumeOtp({ pairCode, role, email, code: otp });
    if (!ok) return jsonError("Kod noto‘g‘ri yoki muddati o‘tgan", 401);

    const pinSet = await isPinSet(pairCode, role);
    const purpose = pinSet ? "reset_pin" : "set_pin";
    const ticket = await createOtpTicket({ pairCode, role, email, purpose });

    return Response.json({
      ok: true,
      pair_code: pairCode,
      role,
      email,
      pin_set: pinSet,
      purpose,
      otp_ticket: ticket.token,
      expires_at: ticket.expires_at,
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "verify-otp failed", 500);
  }
}
