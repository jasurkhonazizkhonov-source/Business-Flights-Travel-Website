// A sliding-window counter per key, in this process's memory. No framework or server-only imports, so it is unit-testable; src/lib/rate-limit.ts wraps one
// shared instance for the application.
//
// What it is and is not: a deterrent for a single-instance deployment (the VPS runs one website container). It is per process and resets on a restart;
// several instances would each keep their own count (see docs/SECURITY_REVIEW_AND_REMAINING_LIMITATIONS.md for the exposure and what to do about it).
// `check` runs synchronously, so concurrent requests in one process cannot interleave between the count and the update.
//
// Memory is bounded: expired entries are swept at most once per `sweepEveryMs` (not on every call), and if live keys still exceed `maxKeys` the
// oldest-inserted ones are dropped. Dropping a key forgets that client's recent attempts, so an attacker able to present more than `maxKeys` distinct
// client keys within one window could reset someone else's count; that is the deliberate alternative to unbounded growth.

export interface SlidingWindowOptions {
  windowMs: number;
  /** Hard cap on distinct keys held at once. */
  maxKeys: number;
  /** Minimum time between sweeps of expired keys. */
  sweepEveryMs?: number;
}

export interface SlidingWindowLimiter {
  check(key: string, limit: number, now?: number): { allowed: boolean; remaining: number };
  size(): number;
}

export function createSlidingWindowLimiter(options: SlidingWindowOptions): SlidingWindowLimiter {
  const { windowMs, maxKeys } = options;
  const sweepEveryMs = options.sweepEveryMs ?? 60_000;
  const buckets = new Map<string, number[]>();
  let lastSweep = 0;

  function sweep(now: number) {
    lastSweep = now;
    for (const [k, v] of buckets) {
      const fresh = v.filter((t) => now - t < windowMs);
      if (fresh.length === 0) buckets.delete(k);
      else if (fresh.length !== v.length) buckets.set(k, fresh);
    }
  }

  return {
    check(key, limit, now = Date.now()) {
      const timestamps = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
      if (timestamps.length >= limit) {
        buckets.set(key, timestamps);
        return { allowed: false, remaining: 0 };
      }
      timestamps.push(now);
      buckets.set(key, timestamps);

      if (now - lastSweep >= sweepEveryMs) sweep(now);
      if (buckets.size > maxKeys) {
        sweep(now);
        // Still too many live keys: forget the oldest-inserted ones (Map iteration order), down to 90% of the cap so that the next calls are not
        // each paying for another pass (an attacker presenting a flood of distinct keys must not turn every request into an O(n) scan).
        const target = Math.floor(maxKeys * 0.9);
        for (const k of buckets.keys()) {
          if (buckets.size <= target) break;
          if (k !== key) buckets.delete(k);
        }
      }
      return { allowed: true, remaining: limit - timestamps.length };
    },
    size: () => buckets.size,
  };
}
