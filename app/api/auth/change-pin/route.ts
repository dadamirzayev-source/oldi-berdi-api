import { sql } from "@/lib/db";
import {
  hashPin,
  newSalt,
  pinUsedByOtherRole,
  requireSession,
  validatePin,
  verifyPin,
} from "@/lib/auth";
import { jsonError } from "@/lib/entries";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/change-pin
 * Faqat o‘z rolining PIN’ini o‘zgartirish (Bearer session).
 * Body: { old_pin, new_pin }
 * New PIN must not match the other role (login infers role from PIN).
 */
export async function POST(req: Request) {
  try {
    const auth = await requireSession(req);
    if ("error" in auth) return auth.error;
    const { session } = auth;

    const body = (await req.json()) as { old_pin?: string; new_pin?: string };
    const oldPin = (body.old_pin ?? "").trim();
    const newPin = (body.new_pin ?? "").trim();
    const errOld = validatePin(oldPin);
    if (errOld) return jsonError("Eski PIN: " + errOld);
    const errNew = validatePin(newPin);
    if (errNew) return jsonError("Yangi PIN: " + errNew);

    const rows = await sql<{ salt: string; pin_hash: string }>(
      "select salt, pin_hash from role_pins where pair_code = $1 and role = $2",
      [session.pair_code, session.role],
    );
    if (rows.length === 0) return jsonError("PIN topilmadi", 404);
    if (!verifyPin(oldPin, rows[0].salt, rows[0].pin_hash)) {
      return jsonError("Eski PIN noto‘g‘ri", 401);
    }

    if (await pinUsedByOtherRole(session.pair_code, newPin, session.role)) {
      return jsonError("Bu PIN boshqa rol uchun band — boshqa PIN tanlang", 409);
    }

    const salt = newSalt();
    const pinHash = hashPin(newPin, salt);
    await sql(
      `update role_pins set salt = $1, pin_hash = $2, updated_at = $3
       where pair_code = $4 and role = $5`,
      [salt, pinHash, Date.now(), session.pair_code, session.role],
    );

    return Response.json({ ok: true, role: session.role });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "change-pin failed", 500);
  }
}
