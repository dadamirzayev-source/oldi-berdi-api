/**
 * Send OTP email via Resend when RESEND_API_KEY is set.
 * Without a key (interim tunnel): returns the code so the client can show a
 * temporary on-screen hint — production must set RESEND_API_KEY.
 */
export async function sendOtpEmail(args: {
  to: string;
  roleLabel: string;
  code: string;
}): Promise<{ sent: boolean; provider: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim() ?? "";
  const from =
    process.env.RESEND_FROM_EMAIL?.trim() || "Oldi-berdi <onboarding@resend.dev>";

  if (!apiKey) {
    console.warn(
      `[oldi-berdi] RESEND_API_KEY unset — OTP for ${args.to}: ${args.code}`,
    );
    return { sent: false, provider: "dev-console", error: "RESEND_API_KEY unset" };
  }

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [args.to],
        subject: `Oldi-berdi kod: ${args.code}`,
        text:
          `${args.roleLabel} uchun tasdiqlash kodi: ${args.code}\n\n` +
          `Kod 10 daqiqa amal qiladi. Agar so‘ramagan bo‘lsangiz, e’tibor bermang.`,
      }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      console.error("[oldi-berdi] Resend error", resp.status, body);
      return { sent: false, provider: "resend", error: `Resend ${resp.status}` };
    }
    return { sent: true, provider: "resend" };
  } catch (e) {
    console.error("[oldi-berdi] Resend failed", e);
    return {
      sent: false,
      provider: "resend",
      error: e instanceof Error ? e.message : "send failed",
    };
  }
}
