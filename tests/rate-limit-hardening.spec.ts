import { test, expect } from "@playwright/test";
import { createSlidingWindowLimiter } from "../src/lib/sliding-window";
import { ipv6Bucket, rateLimitClientKey, UNRESOLVED_CLIENT } from "../src/lib/rate-limit-client";

// The in-process limiter behind the public forms and the visitor hint: its window semantics, that concurrent callers cannot slip past it, that its memory
// is bounded, and that one IPv6 /64 is one client. (The limits on the real actions are checked over HTTP in rate-limit-actions-e2e.spec.ts.)

test.describe("sliding window", () => {
  const WINDOW = 10 * 60 * 1000;

  test("allows `limit` calls inside the window, refuses the next, and forgives them once they age out", () => {
    const l = createSlidingWindowLimiter({ windowMs: WINDOW, maxKeys: 100 });
    const t0 = 1_000_000;
    for (let i = 0; i < 8; i++) expect(l.check("a", 8, t0 + i).allowed).toBe(true);
    expect(l.check("a", 8, t0 + 10)).toEqual({ allowed: false, remaining: 0 });
    expect(l.check("b", 8, t0 + 10).allowed).toBe(true); // another key has its own allowance
    expect(l.check("a", 8, t0 + WINDOW - 1).allowed).toBe(false); // the first call is still inside the window
    expect(l.check("a", 8, t0 + WINDOW + 8).allowed).toBe(true); // all eight have aged out
  });

  test("a refused call does not extend the lock-out (it is not recorded)", () => {
    const l = createSlidingWindowLimiter({ windowMs: WINDOW, maxKeys: 100 });
    const t0 = 5_000_000;
    for (let i = 0; i < 3; i++) l.check("k", 3, t0);
    for (let i = 0; i < 50; i++) expect(l.check("k", 3, t0 + 1000 + i).allowed).toBe(false);
    expect(l.check("k", 3, t0 + WINDOW + 1).allowed).toBe(true);
  });

  test("a burst of concurrent callers never gets more than the limit through (the check-and-update is one synchronous step)", async () => {
    const l = createSlidingWindowLimiter({ windowMs: WINDOW, maxKeys: 100 });
    const results = await Promise.all(Array.from({ length: 500 }, () => Promise.resolve().then(() => l.check("burst", 8))));
    expect(results.filter((r) => r.allowed)).toHaveLength(8);
    expect(results.filter((r) => !r.allowed)).toHaveLength(492);
  });

  test("memory is bounded: a flood of distinct keys cannot grow it past the cap", () => {
    const l = createSlidingWindowLimiter({ windowMs: WINDOW, maxKeys: 1000 });
    const t0 = 9_000_000;
    for (let i = 0; i < 20_000; i++) l.check(`ip-${i}`, 8, t0 + i);
    expect(l.size()).toBeLessThanOrEqual(1000);
    // The key being checked is never the one dropped: the caller that just flooded still counts against its own bucket.
    const flooder = createSlidingWindowLimiter({ windowMs: WINDOW, maxKeys: 10 });
    for (let i = 0; i < 100; i++) flooder.check(`x-${i}`, 8, t0);
    for (let i = 0; i < 8; i++) flooder.check("me", 8, t0 + 1);
    expect(flooder.check("me", 8, t0 + 2).allowed).toBe(false);
  });

  test("a flood of distinct keys does not turn every request into a full scan (sweeps are amortised)", () => {
    const l = createSlidingWindowLimiter({ windowMs: WINDOW, maxKeys: 20_000 });
    const t0 = 20_000_000;
    const start = performance.now();
    for (let i = 0; i < 60_000; i++) l.check(`ip-${i}`, 8, t0 + (i % 1000));
    const elapsed = performance.now() - start;
    expect(l.size()).toBeLessThanOrEqual(20_000);
    // 60,000 calls with the table at its cap: with a scan per call this takes minutes; amortised it is well under a few seconds even on a slow machine.
    expect(elapsed).toBeLessThan(5000);
  });

  test("expired keys are swept, not kept forever", () => {
    const l = createSlidingWindowLimiter({ windowMs: WINDOW, maxKeys: 1000, sweepEveryMs: 1000 });
    const t0 = 50_000_000;
    for (let i = 0; i < 200; i++) l.check(`old-${i}`, 8, t0);
    expect(l.size()).toBe(200);
    l.check("new", 8, t0 + WINDOW + 5000);
    expect(l.size()).toBe(1);
  });
});

test.describe("IPv6 clients are limited by /64", () => {
  const saved = process.env.TRUSTED_PROXY;
  test.beforeEach(() => {
    process.env.TRUSTED_PROXY = "cloudflare";
  });
  test.afterEach(() => {
    if (saved === undefined) delete process.env.TRUSTED_PROXY;
    else process.env.TRUSTED_PROXY = saved;
  });
  const key = (ip: string) => rateLimitClientKey(new Headers({ "cf-connecting-ip": ip }));

  test("the bucket is the first four groups, however the address is spelled or compressed", () => {
    expect(ipv6Bucket("2607:f8b0:4005:80a::200e")).toBe("2607:f8b0:4005:80a::/64");
    expect(ipv6Bucket("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(ipv6Bucket("2001:db8:1:2:3:4:5:6")).toBe("2001:db8:1:2::/64");
    expect(ipv6Bucket("::2")).toBe("0:0:0:0::/64");
    expect(key("2607:F8B0:4005:0:0:0:0:1")).toBe(key("2607:f8b0:4005::ffff:1:2:3"));
  });

  test("addresses in one /64 share a bucket; a neighbouring /64 and IPv4 do not", () => {
    const keys = new Set(Array.from({ length: 500 }, (_, i) => key(`2607:f8b0:4005:1:${i.toString(16)}:${(i * 7).toString(16)}::${(i + 1).toString(16)}`)));
    expect(keys.size).toBe(1);
    expect(key("2607:f8b0:4005:2::1")).not.toBe(key("2607:f8b0:4005:1::1"));
    expect(key("198.51.100.10")).toBe("198.51.100.10"); // IPv4 is unchanged
    expect(key("::ffff:198.51.100.10")).toBe("198.51.100.10");
  });

  test("a bucket key can never be mistaken for an address or for the unresolved bucket", () => {
    const b = key("2607:f8b0:4005::1");
    expect(b).not.toBe(UNRESOLVED_CLIENT);
    expect(b.endsWith("/64")).toBe(true);
    expect(() => new URL(`http://[${b}]/`)).toThrow();
  });
});

test.describe("the rate-limit store cannot be used against itself", () => {
  test("a flood of distinct keys does not evict (and so does not reset) a client that is already being limited", () => {
    const limiter = createSlidingWindowLimiter({ windowMs: 600_000, maxKeys: 1_000 });
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) expect(limiter.check("heavy-client", 5, now + i).allowed).toBe(true);
    expect(limiter.check("heavy-client", 5, now + 10).allowed).toBe(false); // at its limit
    for (let i = 0; i < 5_000; i++) limiter.check(`flood-${i}`, 5, now + 100 + i); // five times the cap, one hit each
    expect(limiter.size()).toBeLessThanOrEqual(1_000);
    expect(limiter.check("heavy-client", 5, now + 6_000).allowed, "the limited client is still limited after the flood").toBe(false);
  });

  test("among keys with equal hits the least recently seen goes first, so recent legitimate clients survive an overflow", () => {
    const limiter = createSlidingWindowLimiter({ windowMs: 600_000, maxKeys: 100 });
    const now = 1_000_000;
    limiter.check("old-visitor", 5, now);
    for (let i = 0; i < 100; i++) limiter.check(`newer-${i}`, 5, now + 1 + i);
    expect(limiter.size()).toBeLessThanOrEqual(100);
    limiter.check("recent", 5, now + 1_000);
    // the oldest single-hit key was the one given up; the newest keys remain counted
    expect(limiter.check("newer-99", 1, now + 2_000).allowed).toBe(false); // still holds its one hit (limit 1)
  });
});
