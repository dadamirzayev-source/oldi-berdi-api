/**
 * Send OTP email via Resend when RESEND_API_KEY is set
 * (process env or Next-loaded `.env` / `.env.local` — never commit the key).
 * Optional RESEND_FROM_EMAIL; defaults to Resend onboarding sender.
 */

function resendApiKey(): string {
  return process.env.RESEND_API_KEY?.trim() ?? "";
}

function resendFrom(): string {
  return (
    process.env.RESEND_FROM_EMAIL?.trim() ||
    "Oldi-berdi <onboarding@resend.dev>"
  );
}

/** On-screen / API `dev_otp` only in local Next dev without a key. */
export function allowDevOtpLeak(): boolean {
  return process.env.NODE_ENV === "development" && resendApiKey() === "";
}

export async function sendOtpEmail(args: {
  to: string;
  roleLabel: string;
  code: string;
}): Promise<{ sent: boolean; provider: string; error?: string }> {
  const apiKey = resendApiKey();
  const from = resendFrom();

  if (!apiKey) {
    if (allowDevOtpLeak()) {
      console.warn(
        `[oldi-berdi] RESEND_API_KEY unset — OTP for ${args.to}: ${args.code}`,
      );
    } else {
      console.error(
        "[oldi-berdi] RESEND_API_KEY unset — cannot send OTP (production)",
      );
    }
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
