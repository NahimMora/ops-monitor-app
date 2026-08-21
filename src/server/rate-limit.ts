/**
 * In-process sliding-window rate limiter. Deliberately not Redis-backed
 * (single Node process on Hostinger, see docs/ARCHITECTURE.md "no Redis
 * without a strong demonstrated reason") — resets on deploy, which is an
 * acceptable trade-off for a single-admin login endpoint.
 */

interface Bucket {
  count: number;
  windowStartMs: number;
}

const buckets = new Map<string, Bucket>();

export function checkRateLimit(
  key: string,
  opts: { maxAttempts: number; windowSeconds: number }
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const windowMs = opts.windowSeconds * 1000;
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStartMs > windowMs) {
    buckets.set(key, { count: 1, windowStartMs: now });
    return { allowed: true, remaining: opts.maxAttempts - 1 };
  }

  if (bucket.count >= opts.maxAttempts) {
    return { allowed: false, remaining: 0 };
  }

  bucket.count += 1;
  return { allowed: true, remaining: opts.maxAttempts - bucket.count };
}

/** Test/utility helper — not used in production code paths. */
export function _resetRateLimitsForTests() {
  buckets.clear();
}
