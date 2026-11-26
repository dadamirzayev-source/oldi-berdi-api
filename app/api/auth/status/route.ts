import { isPinSet } from "@/lib/auth";
import { sql } from "@/lib/db";
import { jsonError } from "@/lib/entries";
import { emailForRole, emailHint, normalizeEmail, ROLE_EMAILS } from "@/lib/roles";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/status?pair_code=&email=
 * Role is derived from email only (no client role picker).
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const pairCode = (url.searchParams.get("pair_code") ?? "").trim().toUpperCase();
    const email = normalizeEmail(url.searchParams.get("email") ?? "");
    if (!pairCode || !email) return jsonError("pair_code va email majburiy");

    const pair = await sql("select 1 from pairs where pair_code = $1", [pairCode]);
    if (pair.length === 0) return jsonError("Juftlik topilmadi", 404);

    let role: "A" | "B" | null = null;
    if (email === ROLE_EMAILS.A) role = "A";
    else if (email === ROLE_EMAILS.B) role = "B";
    if (!role) return jsonError("Bu email ruxsat etilmagan", 403);

    const pinSet = await isPinSet(pairCode, role);
    return Response.json({
      ok: true,
      pair_code: pairCode,
      role,
      email: emailForRole(role),
      email_hint: emailHint(role),
      pin_set: pinSet,
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "status failed", 500);
  }
}
