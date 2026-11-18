/**
 * Fixed-window limiter keyed by e.g. `login:<ip>`.
 * In-memory: good enough per instance; on multi-instance deploys swap for Redis/Upstash (see README limitations).
 */
export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return {
    check(key: string): { ok: boolean; retryAfterSec: number } {
      const t = now();
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= t) {
        hits.set(key, { count: 1, resetAt: t + windowMs });
        if (hits.size > 10_000) for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k);
        return { ok: true, retryAfterSec: 0 };
      }
      entry.count += 1;
      if (entry.count > limit) return { ok: false, retryAfterSec: Math.ceil((entry.resetAt - t) / 1000) };
      return { ok: true, retryAfterSec: 0 };
    },
  };
}

export const authLimiter = createRateLimiter(10, 60_000);
export const conciergeLimiter = createRateLimiter(8, 60_000); // signed-in users
export const anonConciergeLimiter = createRateLimiter(4, 60_000); // per IP
