import { test, expect } from "@playwright/test";

// The response headers every page carries (next.config.ts) and the things the site must NOT do: set a cookie, advertise its framework, or bind
// every subdomain to HTTPS-only/preload without anyone having decided that. Checked on a spread of pages, the 404 page and a redirect.

const PAGES = ["/", "/flights", "/contact", "/destinations", "/destinations/europe", "/destinations/europe/germany/munich", "/blog", "/blog/business-class-vs-first-class", "/privacy-policy", "/cookie-policy", "/terms-of-service"];

test.describe("security headers", () => {
  for (const path of PAGES) {
    test(`${path}: CSP, framing, sniffing, referrer, permissions and HSTS`, async ({ request }) => {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status()).toBe(200);
      const h = res.headers();
      const csp = h["content-security-policy"] ?? "";
      for (const directive of ["default-src 'self'", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'", "img-src 'self' data:", "font-src 'self' data:", "script-src-attr 'none'"]) {
        expect(csp, directive).toContain(directive);
      }
      // No third-party origin is allowed anywhere in the policy (the site loads nothing from another host).
      expect(csp).not.toMatch(/https?:\/\//);
      expect(csp).not.toContain("*");
      expect(h["x-frame-options"]).toBe("DENY");
      expect(h["x-content-type-options"]).toBe("nosniff");
      expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      // Only geolocation is granted, and only to this site's own pages; everything else stays denied (and so is every frame, since framing is refused).
      const policy = h["permissions-policy"] ?? "";
      expect(policy).toContain("geolocation=(self)");
      for (const denied of ["camera=()", "microphone=()", "payment=()", "usb=()"]) expect(policy, denied).toContain(denied);
      expect(policy).not.toMatch(/geolocation=\((\*|"https?:)/);
      // HSTS for this host for two years; `includeSubDomains` and `preload` are not sent until the owner decides to bind the whole domain / join the preload list.
      expect(h["strict-transport-security"]).toBe("max-age=63072000");
      // No framework banner and no cookie of the site's own.
      expect(h["x-powered-by"]).toBeUndefined();
      expect(h["set-cookie"]).toBeUndefined();
    });
  }

  test("the 404 page carries the protective headers and sets no cookie", async ({ request }) => {
    const res = await request.get("/no-such-page-xyz", { maxRedirects: 0 });
    expect(res.status()).toBe(404);
    const h = res.headers();
    expect(h["content-security-policy"]).toContain("default-src 'self'");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["strict-transport-security"]).toBe("max-age=63072000");
    expect(h["set-cookie"]).toBeUndefined();
  });

  test("a permanent redirect points at the right place, sets no cookie and advertises nothing", async ({ request }) => {
    // Known framework behaviour, recorded rather than hidden: Next.js answers a redirects() rule before it applies headers(), so a 308 carries
    // none of the protective headers. It has no body to frame, sniff or inject into, and HSTS is learned from the 200 responses that follow.
    const res = await request.get("/terms", { maxRedirects: 0 });
    expect(res.status()).toBe(308);
    expect(res.headers()["location"]).toBe("/terms-of-service");
    expect(res.headers()["set-cookie"]).toBeUndefined();
    expect(res.headers()["x-powered-by"]).toBeUndefined();
  });

  test("the visitor hint is never cacheable and sets no cookie; the health probe says nothing about the application", async ({ request }) => {
    const hint = await request.get("/api/visitor-hint");
    expect(hint.headers()["cache-control"]).toBe("private, no-store");
    expect(hint.headers()["set-cookie"]).toBeUndefined();
    const health = await request.get("/api/health");
    expect(health.status()).toBe(200);
    expect(health.headers()["x-robots-tag"] ?? "").toMatch(/noindex/i);
    expect(await health.text()).not.toMatch(/version|stack|database|crm|secret|node_modules/i);
  });

  test("only the documented methods exist on the route handlers (no accidental write endpoints)", async ({ request }) => {
    for (const path of ["/api/visitor-hint", "/api/health"]) {
      for (const method of ["POST", "PUT", "DELETE", "PATCH"] as const) {
        const res = await request.fetch(path, { method, maxRedirects: 0 });
        expect(res.status(), `${method} ${path}`).toBe(405);
      }
    }
  });

  test("no response sets CORS headers (the site is not an API for other origins)", async ({ request }) => {
    for (const path of ["/", "/api/visitor-hint", "/api/health"]) {
      const res = await request.get(path, { headers: { origin: "https://evil.example" } });
      expect(res.headers()["access-control-allow-origin"], path).toBeUndefined();
    }
  });
});
