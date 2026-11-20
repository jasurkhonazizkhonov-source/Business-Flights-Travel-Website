import { test, expect } from "@playwright/test";
import { standaloneBuildPresent, startStandalone, type StandaloneServer } from "./support/standalone-server";

// GET /api/visitor-hint on the PRODUCTION (standalone) build: what the server tells the visitor's own browser so the forms can suggest a phone country
// code and a departure airport (src/app/api/visitor-hint/route.ts, src/lib/visitor-hint.ts). It is derived only from the proxy in front of the app that
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

  test("a visitor near Frankfurt gets Germany and the Frankfurt airport - nothing else", async () => {
    const r = await hint(server, FRANKFURT_HEADERS);
    expect(r.status).toBe(200);
    expect(JSON.parse(r.text)).toEqual({ countryCode: "DE", airport: { iata: "FRA", city: "Frankfurt am Main", name: "Frankfurt Main Airport", country: "Germany" } });
    // The response carries no IP address, no city of the visitor's network, no coordinates.
    expect(r.text).not.toMatch(/203\.0\.113|50\.11|8\.68|latitude|longitude|"ip"/i);
  });

  test("the answer follows the visitor's position: Munich, Würzburg (no airport of its own), and a visitor in the United States", async () => {
    const munich = JSON.parse((await hint(server, { "CF-IPCountry": "DE", "CF-IPLatitude": "48.1371", "CF-IPLongitude": "11.5754" })).text);
    expect(munich.airport.iata).toBe("MUC");
    const wuerzburg = JSON.parse((await hint(server, { "CF-IPCountry": "DE", "CF-IPLatitude": "49.7913", "CF-IPLongitude": "9.9534" })).text);
    expect(wuerzburg.countryCode).toBe("DE");
    expect(["NUE", "FRA"]).toContain(wuerzburg.airport.iata); // a major airport by distance, never one of the small fields next door
    const sf = JSON.parse((await hint(server, { "CF-IPCountry": "US", "CF-IPLatitude": "37.7749", "CF-IPLongitude": "-122.4194" })).text);
    expect(sf.countryCode).toBe("US");
    expect(["SFO", "OAK"]).toContain(sf.airport.iata);
  });

  test("a country without a position gives the country only; no usable data gives an empty answer", async () => {
    expect(JSON.parse((await hint(server, { "CF-IPCountry": "GB" })).text)).toEqual({ countryCode: "GB" });
    expect(JSON.parse((await hint(server, { "CF-IPCountry": "XX" })).text)).toEqual({});
    expect(JSON.parse((await hint(server, { "CF-IPCountry": "T1" })).text)).toEqual({});
    expect(JSON.parse((await hint(server, {})).text)).toEqual({});
    // A position in the middle of an ocean, far from any major airport: the country still, but no airport.
    expect(JSON.parse((await hint(server, { "CF-IPCountry": "PF", "CF-IPLatitude": "-30", "CF-IPLongitude": "-130" })).text)).toEqual({ countryCode: "PF" });
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
