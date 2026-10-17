import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import Module from "node:module";
import path from "node:path";
import { rateLimitClientKey, UNRESOLVED_CLIENT } from "../src/lib/rate-limit-client";

// The public forms (flight request, contact message, newsletter) rate-limit per client. The client used to be the FIRST value of
// X-Forwarded-For, which any visitor can choose (Cloudflare keeps a client-supplied value first), so rotating it defeated the limit.
// The key now comes from the same trusted-proxy resolution that records a lead's IP (src/lib/client-ip.ts): with
// TRUSTED_PROXY=cloudflare only CF-Connecting-IP is read. A request whose trusted client IP is missing or invalid is not
// assumed to be anyone in particular: it falls into ONE fixed bucket that no header value can influence.
const root = path.resolve(__dirname, "..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");
const H = (o: Record<string, string>) => new Headers(o);

const KEYS = ["VERCEL", "TRUSTED_PROXY"] as const;
const saved: Partial<Record<(typeof KEYS)[number], string | undefined>> = {};
test.beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
test.afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});
const cloudflare = () => {
  process.env.TRUSTED_PROXY = "cloudflare";
};

test.describe("rateLimitClientKey: the bucket is chosen by the trusted proxy path, never by a client-supplied header", () => {
  test("Cloudflare: a constant CF-Connecting-IP yields ONE key however the forged forwarding headers are rotated", () => {
    cloudflare();
    const keys = new Set<string>();
    for (let i = 0; i < 300; i++) {
      keys.add(
        rateLimitClientKey(
          H({
            "cf-connecting-ip": "198.51.100.10",
            "x-forwarded-for": `203.0.113.${i % 250}, 10.0.0.${i % 250}`,
            "x-real-ip": `192.0.2.${i % 250}`,
            forwarded: `for=192.0.2.${i % 250}`,
            "x-vercel-forwarded-for": `198.18.0.${i % 250}`,
          }),
        ),
      );
    }
    expect([...keys]).toEqual(["198.51.100.10"]);
  });

  test("Cloudflare: different trusted IPs get different keys; equivalent spellings of one address share a key", () => {
    cloudflare();
    expect(rateLimitClientKey(H({ "cf-connecting-ip": "198.51.100.10" }))).not.toBe(rateLimitClientKey(H({ "cf-connecting-ip": "198.51.100.11" })));
    // IPv6 spellings, an IPv4-mapped form and a port suffix collapse to one canonical key, so spelling cannot mint extra buckets
    const v6 = ["2607:F8B0:4005:080A:0000:0000:0000:200E", "2607:f8b0:4005:80a::200e", "[2607:f8b0:4005:80a::200e]:443"];
    expect(new Set(v6.map((v) => rateLimitClientKey(H({ "cf-connecting-ip": v })))).size).toBe(1);
    expect(rateLimitClientKey(H({ "cf-connecting-ip": "::ffff:198.51.100.10" }))).toBe("198.51.100.10");
    expect(rateLimitClientKey(H({ "cf-connecting-ip": "198.51.100.10:51820" }))).toBe("198.51.100.10");
  });

  test("Cloudflare: a missing, empty, malformed, private or multi-value trusted header falls into the single fixed bucket - whatever else the request carries", () => {
    cloudflare();
    const bad: Array<string | undefined> = [undefined, "", "   ", "not-an-ip", "999.1.1.1", "198.51.100.10, 198.51.100.11", "10.0.0.1", "127.0.0.1", "192.168.1.5", "::1", "fe80::1", "unresolved", "198.51.100.10;x=1"];
    for (const value of bad) {
      for (const forged of ["203.0.113.1", "203.0.113.2, 10.0.0.9", "attacker-chosen-bucket"]) {
        const headers: Record<string, string> = { "x-forwarded-for": forged, "x-real-ip": "192.0.2.77" };
        if (value !== undefined) headers["cf-connecting-ip"] = value;
        expect(rateLimitClientKey(H(headers)), `cf-connecting-ip=${JSON.stringify(value)} xff=${forged}`).toBe(UNRESOLVED_CLIENT);
      }
    }
  });

  test("no trusted proxy configured (local dev, unknown host): nothing is believed, every request shares the fixed bucket", () => {
    for (const mode of [undefined, "none"]) {
      if (mode) process.env.TRUSTED_PROXY = mode;
      else delete process.env.TRUSTED_PROXY;
      expect(rateLimitClientKey(H({ "x-forwarded-for": "203.0.113.9", "cf-connecting-ip": "198.51.100.10", "x-real-ip": "192.0.2.1" }))).toBe(UNRESOLVED_CLIENT);
      expect(rateLimitClientKey(H({}))).toBe(UNRESOLVED_CLIENT);
    }
  });

  test("Vercel keeps working: the platform's own header is used, and headers Vercel does not sanitise are ignored", () => {
    process.env.TRUSTED_PROXY = "vercel";
    expect(rateLimitClientKey(H({ "x-vercel-forwarded-for": "198.51.100.20", "x-forwarded-for": "203.0.113.9" }))).toBe("198.51.100.20");
    expect(rateLimitClientKey(H({ "cf-connecting-ip": "198.51.100.21", forwarded: "for=198.51.100.22" }))).toBe(UNRESOLVED_CLIENT);
  });

  test("a key is always either a valid IP address or the fixed constant - never any text taken from a header", () => {
    cloudflare();
    const hostile = ["a".repeat(500), "../../etc/passwd", "'; DROP TABLE x;--", "\u0000\u0001", "flight-request:198.51.100.10", "198.51.100.10\n198.51.100.11"];
    for (const v of hostile) {
      for (const name of ["x-forwarded-for", "cf-connecting-ip", "x-real-ip"]) {
        let key: string;
        try {
          key = rateLimitClientKey(H({ [name]: v }));
        } catch {
          continue; // the Headers constructor itself refuses some control characters: nothing reaches the key
        }
        expect(key === UNRESOLVED_CLIENT || /^[0-9a-f.:]+$/.test(key), `${name}=${JSON.stringify(v)} -> ${key}`).toBe(true);
        expect(key).not.toContain("flight-request");
      }
    }
  });
});

test.describe("rateLimitClientKey: the fallback is announced (value-free, throttled), never silent", () => {
  test("an unresolved request logs the reason category at most once per interval and never a header value; a resolved one logs nothing", () => {
    cloudflare();
    const warn = console.warn;
    const lines: string[] = [];
    console.warn = (...a: unknown[]) => void lines.push(a.map(String).join(" "));
    try {
      const base = Date.now() + 365 * 24 * 3600 * 1000; // far ahead of any earlier call in this worker, so the throttle starts open
      const secret = "198.51.100.250-SECRET-HEADER-VALUE";
      expect(rateLimitClientKey(H({ "cf-connecting-ip": secret }), base)).toBe(UNRESOLVED_CLIENT);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatch(/no trusted client IP \(invalid\)/);
      expect(lines[0]).toContain(UNRESOLVED_CLIENT);
      expect(lines[0]).not.toContain("SECRET");
      expect(lines[0]).not.toContain("198.51.100");
      // within the interval: silent; after it: once more, with the new reason category
      rateLimitClientKey(H({}), base + 60_000);
      rateLimitClientKey(H({}), base + 4 * 60_000);
      expect(lines).toHaveLength(1);
      rateLimitClientKey(H({}), base + 5 * 60_000 + 1);
      expect(lines).toHaveLength(2);
      expect(lines[1]).toMatch(/\(no_header\)/);
      // a resolved request never logs
      rateLimitClientKey(H({ "cf-connecting-ip": "198.51.100.10" }), base + 99 * 60_000);
      expect(lines).toHaveLength(2);
    } finally {
      console.warn = warn;
    }
  });
});

test.describe("the REAL limiter with the new key: the existing limit still applies to a spoofing client", () => {
  // src/lib/rate-limit.ts is "server-only"; outside Next that import throws, so for this test only it is satisfied with an empty module.
  type Limiter = (key: string, limit: number) => { allowed: boolean; remaining: number };
  let checkRateLimit: Limiter;
  test.beforeAll(() => {
    const M = Module as unknown as { _load: (request: string, ...rest: unknown[]) => unknown };
    const original = M._load;
    M._load = function (request: string, ...rest: unknown[]) {
      return request === "server-only" ? {} : original.call(this, request, ...rest);
    };
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      checkRateLimit = (require("../src/lib/rate-limit") as { checkRateLimit: Limiter }).checkRateLimit;
    } finally {
      M._load = original;
    }
  });

  // The three public actions, with the prefix and threshold each one uses (asserted against the sources in the next describe).
  const ACTIONS: Array<[string, string, number]> = [
    ["submitFlightRequest", "flight-request", 8],
    ["submitContactMessage", "contact-message", 8],
    ["subscribeToNewsletter", "newsletter", 6],
  ];

  for (const [name, prefix, limit] of ACTIONS) {
    test(`${name}: with the trusted IP constant and X-Forwarded-For rotated every time, request ${limit + 1} is refused; another trusted IP is not`, () => {
      cloudflare();
      const uniq = `${prefix}-${Math.random().toString(36).slice(2)}`; // isolate this test's buckets from any other test in the process
      const asRequest = (cfIp: string | undefined, i: number) => {
        const h: Record<string, string> = { "x-forwarded-for": `203.0.113.${i % 250}, 198.18.${i % 250}.1` };
        if (cfIp) h["cf-connecting-ip"] = cfIp;
        return checkRateLimit(`${uniq}:${rateLimitClientKey(H(h))}`, limit).allowed;
      };
      const results = Array.from({ length: limit + 3 }, (_, i) => asRequest("198.51.100.10", i));
      expect(results.slice(0, limit)).toEqual(Array(limit).fill(true));
      expect(results.slice(limit)).toEqual([false, false, false]);
      // a genuinely different visitor has their own bucket
      expect(asRequest("198.51.100.11", 0)).toBe(true);
      // ... and rotating the forged header never frees the blocked visitor
      for (let i = 100; i < 140; i++) expect(asRequest("198.51.100.10", i)).toBe(false);
    });

    test(`${name}: requests with no usable trusted IP share ONE bucket with the same threshold (rotating headers cannot create more)`, () => {
      cloudflare();
      const uniq = `${prefix}-${Math.random().toString(36).slice(2)}`;
      const values: Array<string | undefined> = [undefined, "not-an-ip", "10.0.0.1", "", "198.51.100.1, 198.51.100.2", undefined, "999.9.9.9", undefined, "::1", "x"];
      const outcomes = Array.from({ length: limit + 4 }, (_, i) => {
        const h: Record<string, string> = { "x-forwarded-for": `203.0.113.${i}` };
        const v = values[i % values.length];
        if (v !== undefined) h["cf-connecting-ip"] = v;
        return checkRateLimit(`${uniq}:${rateLimitClientKey(H(h))}`, limit).allowed;
      });
      expect(outcomes.filter(Boolean)).toHaveLength(limit); // exactly the threshold in total, across every malformed variant
    });
  }
});

test.describe("the three public actions use the helper and keep their thresholds (structural)", () => {
  const ACTIONS: Array<[string, string, string, number]> = [
    ["src/server/actions/submit-flight-request.ts", "flight-request", "flight", 8],
    ["src/server/actions/submit-contact-message.ts", "contact-message", "contact", 8],
    ["src/server/actions/subscribe-newsletter.ts", "newsletter", "newsletter", 6],
  ];
  for (const [file, prefix, , limit] of ACTIONS) {
    test(`${file}: key from rateLimitClientKey(headerList), prefix "${prefix}", threshold ${limit}, no X-Forwarded-For read`, () => {
      const code = read(file).split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
      expect(code).toContain('import { rateLimitClientKey } from "@/lib/rate-limit-client";');
      expect(code).toContain("const ip = rateLimitClientKey(headerList);");
      expect(code).toContain(`checkRateLimit(\`${prefix}:\${ip}\`, ${limit})`);
      expect(code).not.toMatch(/x-forwarded-for/i);
      expect(code).not.toMatch(/\|\|\s*"unknown"/);
    });
  }

  test("no other module keys a rate limit on a client-supplied header", () => {
    const hits = ["src/lib/rate-limit.ts", "src/server/actions/submit-flight-request.ts", "src/server/actions/submit-contact-message.ts", "src/server/actions/subscribe-newsletter.ts"]
      .filter((f) => /checkRateLimit\([^)]*headers?\./i.test(read(f)) || /x-forwarded-for/i.test(read(f).split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")));
    expect(hits).toEqual([]);
  });

  test("the helper module is not server-only (so it is testable) and imports nothing but the trusted-proxy resolver", () => {
    const src = read("src/lib/rate-limit-client.ts");
    expect(src).not.toContain('"server-only"');
    expect([...src.matchAll(/^import .* from "(.+)";/gm)].map((m) => m[1])).toEqual(["@/lib/client-ip"]);
  });
});
