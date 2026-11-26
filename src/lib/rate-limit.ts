/**
 * Simple in-memory rate limiter (per process). Fine for single-instance
 * Cursor Apps / local; resets on restart.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function clientKey(req: Request, extra = ""): string {
  const xf = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip =
    xf ||
    req.headers.get("cf-connecting-ip")?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "unknown";
  return extra ? `${ip}:${extra}` : ip;
}

/** Returns null if allowed; otherwise milliseconds until retry. */
export function takeToken(
  key: string,
  limit: number,
  windowMs: number,
): number | null {
  const now = Date.now();
  const cur = buckets.get(key);
  if (!cur || cur.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  if (cur.count >= limit) {
    return Math.max(0, cur.resetAt - now);
  }
  cur.count += 1;
  return null;
}

export function clearBucket(key: string): void {
  buckets.delete(key);
}
