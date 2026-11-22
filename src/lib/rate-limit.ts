import "server-only";
import { createSlidingWindowLimiter, type SlidingWindowLimiter } from "@/lib/sliding-window";

// The public actions' limiter: an in-memory sliding window (src/lib/sliding-window.ts), 10 minutes wide, shared by every route of THIS process.
// It is a deterrent for the single-container VPS deployment: it is per process, it resets on a restart and it is not shared if more than one
// instance ever runs. For that case, or for an attack from many addresses, the real control belongs at the edge (a Cloudflare rate-limiting rule
// on the form and API paths); see docs/SECURITY_REVIEW_AND_REMAINING_LIMITATIONS.md for the exposure and the exact rule.
//
// The instance lives on globalThis so that route bundles which each load this module still share ONE set of counters inside the process.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_KEYS = 50_000;

const holder = globalThis as typeof globalThis & { __bftRateLimiter?: SlidingWindowLimiter };
const limiter = (holder.__bftRateLimiter ??= createSlidingWindowLimiter({ windowMs: WINDOW_MS, maxKeys: MAX_KEYS }));

export function checkRateLimit(key: string, limit: number): { allowed: boolean; remaining: number } {
  return limiter.check(key, limit);
}
