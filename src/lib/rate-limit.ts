import { sql } from "@/lib/db";

/**
 * Cluster-wide rate limits stored in Postgres/PGlite (shared across instances).
 * Client identity prefers platform-set headers over spoofable X-Forwarded-For.
 */

export function clientKey(req: Request, extra = ""): string {
  const realIp =
    req.headers.get("x-real-ip")?.trim() ||
    req.headers.get("cf-connecting-ip")?.trim() ||
    // Rightmost XFF hop is typically appended by the trusted proxy.
    req.headers
      .get("x-forwarded-for")
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .pop() ||
    "unknown";
  return extra ? `${realIp}:${extra}` : realIp;
}

/** Returns null if allowed; otherwise milliseconds until retry. */
export async function takeToken(
  key: string,
  limit: number,
  windowMs: number,
): Promise<number | null> {
  const now = Date.now();
  const rows = await sql<{ hit_count: number; reset_at: number | string }>(
    "select hit_count, reset_at from rate_limits where bucket_key = $1",
    [key],
  );
  const cur = rows[0];
  if (!cur || Number(cur.reset_at) <= now) {
    await sql(
      `insert into rate_limits (bucket_key, hit_count, reset_at)
       values ($1, 1, $2)
       on conflict (bucket_key) do update set
         hit_count = 1,
         reset_at = excluded.reset_at`,
      [key, now + windowMs],
    );
    return null;
  }
  const updated = await sql<{ hit_count: number; reset_at: number | string }>(
    `update rate_limits
     set hit_count = hit_count + 1
     where bucket_key = $1 and hit_count < $2 and reset_at > $3
     returning hit_count, reset_at`,
    [key, limit, now],
  );
  if (updated.length === 0) {
    return Math.max(0, Number(cur.reset_at) - now);
  }
  return null;
}

export async function clearBucket(key: string): Promise<void> {
  await sql("delete from rate_limits where bucket_key = $1", [key]);
}
