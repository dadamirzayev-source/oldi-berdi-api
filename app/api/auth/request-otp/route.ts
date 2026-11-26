import { generateOtpCode, storeOtp } from "@/lib/auth";
import { sql } from "@/lib/db";
import { jsonError } from "@/lib/entries";
import { sendOtpEmail } from "@/lib/mail";
import { emailMatchesRole, normalizeEmail, ROLE_EMAILS } from "@/lib/roles";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/request-otp
 * Body: { pair_code, email }
 * Role inferred from email. Wrong email → 403.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { pair_code?: string; email?: string };
    const pairCode = (body.pair_code ?? "").trim().toUpperCase();
    const email = normalizeEmail(body.email ?? "");
    if (!pairCode || !email) return jsonError("pair_code va email majburiy");

    const pair = await sql("select 1 from pairs where pair_code = $1", [pairCode]);
    if (pair.length === 0) return jsonError("Juftlik topilmadi", 404);

    let role: "A" | "B" | null = null;
    if (email === ROLE_EMAILS.A) role = "A";
    else if (email === ROLE_EMAILS.B) role = "B";
    if (!role || !emailMatchesRole(role, email)) {
      return jsonError("Bu email ruxsat etilmagan", 403);
    }

    const code = generateOtpCode();
    await storeOtp({ pairCode, role, email, code });

    const mail = await sendOtpEmail({
      to: email,
      roleLabel: role === "A" ? "Olimjon" : "Azizbek",
      code,
    });

    const payload: Record<string, unknown> = {
      ok: true,
      pair_code: pairCode,
      role,
      email,
      sent: mail.sent,
      provider: mail.provider,
    };
    // Interim tunnel without RESEND_API_KEY: expose code for on-device testing only.
    if (!mail.sent) {
      payload.dev_otp = code;
      payload.hint =
        "RESEND_API_KEY yo‘q — kod vaqtincha javobda (dev). Production’da email yuboriladi.";
    }
    return Response.json(payload);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "request-otp failed", 500);
  }
}
