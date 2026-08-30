import "server-only";

// Basic in-memory sliding-window limiter. Good enough as an abuse-deterrent
// for a single-instance/low-traffic deployment; it resets on redeploy and
// isn't shared across serverless instances. If this app ever runs on
// multiple instances behind a load balancer, swap this for a shared store
// (e.g. Redis) — the call sites won't need to change.
const buckets = new Map<string, number[]>();

const WINDOW_MS = 10 * 60 * 1000;

export function checkRateLimit(key: string, limit: number): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const timestamps = (buckets.get(key) ?? []).filter((t) => now - t < WINDOW_MS);

  if (timestamps.length >= limit) {
    buckets.set(key, timestamps);
    return { allowed: false, remaining: 0 };
  }

  timestamps.push(now);
  buckets.set(key, timestamps);

  // Opportunistic cleanup so the map doesn't grow unbounded over a long
  // process lifetime.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      const fresh = v.filter((t) => now - t < WINDOW_MS);
      if (fresh.length === 0) buckets.delete(k);
      else buckets.set(k, fresh);
    }
  }

  return { allowed: true, remaining: limit - timestamps.length };
}
