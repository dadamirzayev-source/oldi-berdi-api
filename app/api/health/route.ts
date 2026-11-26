import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await sql("select 1 as ok");
    return Response.json({
      ok: true,
      service: "oldi-berdi-api",
      storage: process.env.DATABASE_URL ? "postgres" : "pglite",
      time: Date.now(),
    });
  } catch (e) {
    console.error("health error", e);
    return Response.json(
      { ok: false, error: "service unavailable" },
      { status: 500 },
    );
  }
}
