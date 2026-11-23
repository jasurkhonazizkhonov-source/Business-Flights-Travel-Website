import { test, expect } from "@playwright/test";
import { standaloneBuildPresent, startStandalone, type StandaloneServer } from "./support/standalone-server";

// GET /api/visitor-hint on the PRODUCTION (standalone) build: what the server tells the visitor's own browser so the forms can suggest a phone country
// code (src/app/api/visitor-hint/route.ts, src/lib/visitor-hint.ts). It is derived only from the proxy in front of the app that
// the operator declared trusted; it contains no IP address, no city and no coordinates; and it must never be cached or shared between visitors.
//
// Needs `NEXT_OUTPUT=standalone npm run build` first; otherwise skipped (never "passed"). Every server is started by this spec.

test.describe.configure({ mode: "serial" });

const FRANKFURT_HEADERS = { "CF-IPCountry": "DE", "CF-IPLatitude": "50.1109", "CF-IPLongitude": "8.6821", "CF-IPCity": "Frankfurt am Main", "CF-Connecting-IP": "203.0.113.55" };

async function hint(server: StandaloneServer, headers: Record<string, string> = {}) {
  const response = await fetch(`${server.origin}/api/visitor-hint`, { headers });
  return { status: response.status, headers: response.headers, text: await response.text() };
}

test.describe("behind Cloudflare (TRUSTED_PROXY=cloudflare)", () => {
  test.skip(!standaloneBuildPresent(), "needs a standalone build (NEXT_OUTPUT=standalone npm run build)");
  test.setTimeout(120_000);
  let server: StandaloneServer;
  test.beforeAll(async () => {
    server = await startStandalone({ label: "visitor-hint cloudflare", port: 3250, env: { TRUSTED_PROXY: "cloudflare" } });
  });
  test.afterAll(async () => {
    await server?.stop();
  });
  test.beforeEach(() => server.assertAlive());

  test("a visitor near Frankfurt gets Germany - and nothing else: no airport, no city, no position, no address", async () => {
    const r = await hint(server, FRANKFURT_HEADERS);
    expect(r.status).toBe(200);
    expect(JSON.parse(r.text)).toEqual({ countryCode: "DE" });
    // The departure airport is suggested only from the device's own position (if the visitor allows it), never from the network: the response carries
    // no airport, no IP address, no city of the visitor's network and no coordinates, whatever position the platform supplied.
    expect(r.text).not.toMatch(/203\.0\.113|50\.11|8\.68|latitude|longitude|"ip"|airport|iata|Frankfurt/i);
  });

  test("a position supplied by the platform never changes the answer: Munich, a visitor in the United States, the middle of an ocean", async () => {
    for (const [country, lat, lon] of [["DE", "48.1371", "11.5754"], ["US", "37.7749", "-122.4194"], ["PF", "-30", "-130"]] as const) {
      const body = JSON.parse((await hint(server, { "CF-IPCountry": country, "CF-IPLatitude": lat, "CF-IPLongitude": lon })).text);
      expect(body, country).toEqual({ countryCode: country });
    }
  });

  test("a country without a position gives the country only; no usable data gives an empty answer", async () => {
    expect(JSON.parse((await hint(server, { "CF-IPCountry": "GB" })).text)).toEqual({ countryCode: "GB" });
    expect(JSON.parse((await hint(server, { "CF-IPCountry": "XX" })).text)).toEqual({});
    expect(JSON.parse((await hint(server, { "CF-IPCountry": "T1" })).text)).toEqual({});
    expect(JSON.parse((await hint(server, {})).text)).toEqual({});
  });

  test("junk values are ignored, not echoed", async () => {
    const r = await hint(server, { "CF-IPCountry": "<script>", "CF-IPLatitude": "abc", "CF-IPLongitude": "999" });
    expect(JSON.parse(r.text)).toEqual({});
    expect(r.text).not.toContain("script");
  });

  test("it can never be cached or shared between visitors", async () => {
    const r = await hint(server, FRANKFURT_HEADERS);
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(r.headers.get("x-robots-tag")).toBe("noindex");
    expect(r.headers.get("content-type")).toMatch(/application\/json/);
    // Two different visitors in a row get their own answers (nothing is remembered by the server).
    expect(JSON.parse((await hint(server, { "CF-IPCountry": "JP", "CF-IPLatitude": "35.69", "CF-IPLongitude": "139.70" })).text).countryCode).toBe("JP");
    expect(JSON.parse((await hint(server, { "CF-IPCountry": "FR", "CF-IPLatitude": "48.85", "CF-IPLongitude": "2.35" })).text).countryCode).toBe("FR");
  });

  test("only GET exists, and the visitor's IP is not logged", async () => {
    const post = await fetch(`${server.origin}/api/visitor-hint`, { method: "POST", headers: FRANKFURT_HEADERS });
    expect(post.status).toBe(405);
    await hint(server, FRANKFURT_HEADERS);
    expect(server.logs()).not.toMatch(/203\.0\.113\.55/);
  });

  test("the security headers on the route allow the page itself to ask for the device's location, and nothing else", async () => {
    const page = await fetch(`${server.origin}/flights`);
    const policy = page.headers.get("permissions-policy") ?? "";
    expect(policy).toContain("geolocation=(self)");
    for (const feature of ["camera=()", "microphone=()", "payment=()", "usb=()"]) expect(policy).toContain(feature);
    expect(page.headers.get("content-security-policy")).toContain("connect-src 'self'");
  });

  test("a client that hammers the route is answered with 429 and an empty, uncacheable body; other clients (and unidentified ones) are unaffected", async () => {
    const as = (ip: string) => ({ ...FRANKFURT_HEADERS, "CF-Connecting-IP": ip });
    // 120 answers are allowed per client per 10 minutes (the count is per client, not per route call from anyone).
    const statuses: number[] = [];
    for (let i = 0; i < 125; i++) statuses.push((await hint(server, as("203.0.113.77"))).status);
    expect(statuses.slice(0, 120).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(120)).toEqual([429, 429, 429, 429, 429]);
    const blocked = await hint(server, as("203.0.113.77"));
    expect(blocked.status).toBe(429);
    expect(blocked.text).toBe("{}");
    expect(blocked.headers.get("cache-control")).toBe("private, no-store");
    expect(blocked.headers.get("retry-after")).toBe("600");
    expect(blocked.text).not.toMatch(/203\.0\.113|DE|FRA/);
    // Another client is untouched; so is a request with no identifiable client (it has nothing to hint at, and no shared bucket to exhaust).
    expect((await hint(server, as("203.0.113.78"))).status).toBe(200);
    for (let i = 0; i < 130; i++) expect((await hint(server, { "CF-IPCountry": "DE" })).status).toBe(200);
    // One IPv6 /64 is one client: a second address in the same /64 is already over the allowance, a different /64 is not.
    for (let i = 0; i < 120; i++) await hint(server, as(`2607:f8b0:4005:1::${(i + 1).toString(16)}`));
    expect((await hint(server, as("2607:f8b0:4005:1:ffff::9"))).status).toBe(429);
    expect((await hint(server, as("2607:f8b0:4005:2::1"))).status).toBe(200);
    expect(server.logs()).not.toMatch(/203\.0\.113\.7|2607:f8b0/);
  });
});

test.describe("with no trusted proxy (a direct or unknown front end)", () => {
  test.skip(!standaloneBuildPresent(), "needs a standalone build (NEXT_OUTPUT=standalone npm run build)");
  test.setTimeout(120_000);
  let server: StandaloneServer;
  test.beforeAll(async () => {
    server = await startStandalone({ label: "visitor-hint untrusted", port: 3251, env: {} });
  });
  test.afterAll(async () => {
    await server?.stop();
  });
  test.beforeEach(() => server.assertAlive());

  test("Cloudflare-looking headers sent straight to the server are NOT believed: anyone could have written them", async () => {
    const r = await hint(server, FRANKFURT_HEADERS);
    expect(r.status).toBe(200);
    expect(JSON.parse(r.text)).toEqual({});
    expect(r.headers.get("cache-control")).toBe("private, no-store");
  });

  test("an explicit TRUSTED_PROXY of another kind does not make the Cloudflare headers trusted either", async () => {
    const other = await startStandalone({ label: "visitor-hint nginx", port: 3252, env: { TRUSTED_PROXY: "nginx" } });
    try {
      expect(JSON.parse((await hint(other, FRANKFURT_HEADERS)).text)).toEqual({});
    } finally {
      await other.stop();
    }
  });
});
