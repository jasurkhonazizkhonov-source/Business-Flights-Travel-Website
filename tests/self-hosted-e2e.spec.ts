import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { standaloneBuildPresent, startStandalone, type StandaloneServer } from "./support/standalone-server";
import { startStubCrm, type StubCrm } from "./support/stub-crm";

// The SELF-HOSTED runtime, end to end, without Docker: the standalone server is copied into a container-like layout (no .env, no source),
// started with the settings compose.yaml gives it (TRUSTED_PROXY=cloudflare and the CRM's URL / key - and NO database setting of any kind),
// and driven through a real browser with Cloudflare-style headers. The CRM is a LOCAL stand-in that enforces the CRM's published contract
// (tests/support/stub-crm.ts), so this proves what the website sends to the CRM and what the visitor sees - not the CRM itself.
//
// Needs `NEXT_OUTPUT=standalone npm run build` first. Skipped, never "passed", without it. It cannot prove the Docker image or the Docker network.
const PORT = 3231;
const KEY = "sentinel-api-key-" + "0123456789abcdef".repeat(3);
const INGEST = "sentinel-ingest-" + "fedcba9876543210".repeat(3);
const COMPANY = "test-company";

test.describe.configure({ mode: "serial" });
test.describe("self-hosted runtime (standalone server, CRM API, Cloudflare headers)", () => {
  test.skip(!standaloneBuildPresent(), "needs a standalone build (NEXT_OUTPUT=standalone npm run build)");
  test.setTimeout(180_000);

  let crm: StubCrm;
  let server: StandaloneServer;

  test.beforeAll(async () => {
    crm = await startStubCrm({ apiKey: KEY, companyId: COMPANY, ingestSecret: INGEST });
    // The tests below POST real forms. They may only talk to a server THIS test started, positively identified (tests/support/standalone-server.ts).
    server = await startStandalone({
      label: "self-hosted e2e",
      port: PORT,
      withStaticAssets: true,
      env: { TRUSTED_PROXY: "cloudflare", CRM_API_URL: crm.url, CRM_API_KEY: KEY, CRM_COMPANY_ID: COMPANY, LEAD_INGEST_SECRET: INGEST },
    });
  });
  test.beforeEach(() => {
    server.assertAlive();
    crm.reset();
  });
  test.afterAll(async () => {
    await server?.stop();
    await crm?.close();
  });

  const rawGet = (host: string, urlPath: string) =>
    new Promise<{ status: number; location?: string }>((resolve, reject) => {
      const req = http.request({ host: "127.0.0.1", port: PORT, path: urlPath, method: "GET", headers: { Host: host } }, (res) => {
        res.resume();
        resolve({ status: res.statusCode ?? 0, location: res.headers.location });
      });
      req.on("error", reject);
      req.end();
    });

  test("container-like layout: no .env present, no source, no database module; the health probe works without calling the CRM", async () => {
    expect(readdirSync(server.layout).filter((f) => f.startsWith(".env"))).toEqual([]);
    expect(existsSync(path.join(server.layout, "src"))).toBe(false);
    expect(existsSync(path.join(server.layout, "node_modules", "@prisma"))).toBe(false);
    expect(existsSync(path.join(server.layout, "node_modules", "pg"))).toBe(false);
    const code = execFileSync(process.execPath, ["scripts/healthcheck.mjs"], { cwd: server.layout, env: { ...process.env, PORT: String(PORT) }, encoding: "utf8" });
    expect(code).toBe(""); // exits 0 silently
    const r = await fetch(`http://127.0.0.1:${PORT}/api/health`);
    expect(await r.json()).toEqual({ status: "ok" });
    expect(r.headers.get("cache-control")).toMatch(/no-store/);
    expect(crm.requests).toHaveLength(0); // liveness never depends on the CRM
  });

  test("canonical host: the apex redirects to www (308, path and query kept); www, the internal name and look-alikes do not redirect", async () => {
    const apex = await rawGet("businessflights.travel", "/destinations/europe?utm_source=x&a=1");
    expect(apex.status).toBe(308);
    expect(apex.location).toBe("https://www.businessflights.travel/destinations/europe?utm_source=x&a=1");
    expect(new URL((await rawGet("businessflights.travel", "/")).location as string).href).toBe("https://www.businessflights.travel/"); // "/" and "" are the same URL
    for (const host of ["www.businessflights.travel", "bft-web:3000", "127.0.0.1:" + PORT, "xbusinessflights.travel", "businessflightsXtravel", "businessflights.travel.evil.example", "evil-businessflights.travel"]) {
      const r = await rawGet(host, "/");
      expect(r.status, host).toBe(200);
      expect(r.location, host).toBeUndefined();
    }
    // The www page declares itself canonical, so there is no loop: www -> 200 with canonical www.
    const html = await (await fetch(`http://127.0.0.1:${PORT}/`, { headers: { Host: "www.businessflights.travel" } })).text();
    expect(html).toContain('rel="canonical" href="https://www.businessflights.travel"');
  });

  async function fillFlightForm(page: Page, email: string, phone: string) {
    await page.goto(`http://127.0.0.1:${PORT}/flights`);
    await page.getByRole("button", { name: "One Way", exact: true }).click();
    const from = page.getByPlaceholder("City or airport code").first();
    await from.click();
    await from.fill("JFK");
    await page.getByRole("option").filter({ hasText: "JFK" }).first().click();
    const to = page.getByPlaceholder("City or airport code").nth(1);
    await to.click();
    await to.fill("CDG");
    await page.getByRole("option").filter({ hasText: "CDG" }).first().click();
    await page.getByText("Select date").first().click();
    await page.getByRole("grid").first().locator("button:not([disabled])").last().click();
    const form = page.locator("form").first();
    await form.getByLabel("First Name", { exact: true }).fill("Selfhosted");
    await form.getByLabel("Last Name", { exact: true }).fill("Tester");
    await form.getByLabel("Email Address", { exact: true }).fill(email);
    await page.locator("#phone").fill(phone); // the country selector defaults to "International", which needs the + prefix
    await page.waitForTimeout(3000); // the form's anti-bot minimum fill time (2.5 s)
  }
  const submit = (page: Page) => page.getByRole("button", { name: "Get a Free Flight Quote" }).click();
  async function submitFlightRequest(page: Page, email: string, phone: string) {
    await fillFlightForm(page, email, phone);
    await submit(page);
    try {
      await expect(page.getByText("Thank you for your request")).toBeVisible({ timeout: 30_000 });
    } catch (e) {
      throw new Error(`${(e as Error).message}\n--- server log (credentials are never logged) ---\n${server.logs().slice(-2500)}`);
    }
  }
  const flightCalls = () => crm.requests.filter((r) => r.path === "/api/v1/website/flight-inquiries");

  test("a real submission behind Cloudflare headers: the CRM gets the lead; IP and location come from CF headers, never from a forged X-Forwarded-For; the browser never sees the key", async ({ browser }) => {
    const context = await browser.newContext({
      extraHTTPHeaders: {
        "CF-Connecting-IP": "198.51.100.77",
        "CF-IPCountry": "AU",
        "CF-IPCity": "Sydney",
        "CF-Region": "New South Wales",
        "CF-Region-Code": "NSW",
        "X-Forwarded-For": "8.8.8.8",
        "X-Real-IP": "8.8.4.4",
        "X-Vercel-Forwarded-For": "9.9.9.9",
      },
    });
    const page = await context.newPage();
    const browserRequests: Array<{ url: string; auth: string | undefined }> = [];
    page.on("request", (r) => browserRequests.push({ url: r.url(), auth: r.headers()["authorization"] }));
    await submitFlightRequest(page, "cf-headers@example.com", "+14155550123");
    await context.close();

    expect(flightCalls()).toHaveLength(1);
    const r = flightCalls()[0];
    expect(r.status).toBe(201);
    expect(r.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(r.headers["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/); // the form's submission key
    expect(r.json).toMatchObject({ firstName: "Selfhosted", lastName: "Tester", email: "cf-headers@example.com", phone: "+14155550123", tripType: "ONE_WAY", departureAirportIata: "JFK", arrivalAirportIata: "CDG" });
    expect(r.visitor).toMatchObject({ state: "verified", ip: "198.51.100.77", country: "AU", city: "Sydney", region: "NSW" });
    expect(JSON.stringify(r)).not.toMatch(/8\.8\.8\.8|8\.8\.4\.4|9\.9\.9\.9/);
    // The browser only ever talked to the website: it never contacted the CRM and never carried a credential.
    for (const b of browserRequests) {
      expect(b.url, b.url).not.toContain(new URL(crm.url).host);
      expect(b.auth, b.url).toBeUndefined();
    }
    expect(JSON.stringify(browserRequests)).not.toContain(KEY);
  });

  test("with ONLY forged forwarding headers (no CF-Connecting-IP) the lead still goes to the CRM, with no IP in the visitor context", async ({ browser }) => {
    const context = await browser.newContext({ extraHTTPHeaders: { "X-Forwarded-For": "8.8.8.8", "X-Real-IP": "8.8.4.4", Forwarded: "for=1.1.1.1", "CF-IPCountry": "AU" } });
    const page = await context.newPage();
    await submitFlightRequest(page, "forged@example.com", "+14155552671");
    await context.close();
    expect(flightCalls()).toHaveLength(1);
    expect(flightCalls()[0].json).toMatchObject({ email: "forged@example.com" });
    expect(flightCalls()[0].visitor?.ip).toBeUndefined();
    expect(JSON.stringify(flightCalls()[0])).not.toMatch(/8\.8\.8\.8|8\.8\.4\.4|1\.1\.1\.1/);
  });

  test("a valid IPv6 address with no location headers at all is forwarded without a location (missing geo is graceful)", async ({ browser }) => {
    const context = await browser.newContext({ extraHTTPHeaders: { "CF-Connecting-IP": "2607:f8b0:4005:80a::200e" } });
    const page = await context.newPage();
    await submitFlightRequest(page, "nogeo@example.com", "+12125550123");
    await context.close();
    expect(flightCalls()).toHaveLength(1);
    expect(flightCalls()[0].visitor).toMatchObject({ state: "verified", ip: "2607:f8b0:4005:80a::200e" });
    expect(flightCalls()[0].visitor?.city).toBeUndefined();
    expect(flightCalls()[0].visitor?.country).toBeUndefined();
  });

  test("the CRM is down for the first press of the button and back for the second: the visitor sees an error, then success - the SAME submission key every time, ONE lead", async ({ page }) => {
    await fillFlightForm(page, "retry@example.com", "+14155552671");
    crm.script({ status: 503, body: { ok: false, error: { code: "not_configured", message: "x" } } }, { count: 3 }); // all three attempts of the first press
    await submit(page);
    await expect(page.getByText(/something went wrong while submitting your request/)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Thank you for your request")).toHaveCount(0);
    expect(flightCalls()).toHaveLength(3);
    await submit(page); // the visitor presses the button again
    await expect(page.getByText("Thank you for your request")).toBeVisible({ timeout: 30_000 });
    const keys = flightCalls().map((r) => r.headers["idempotency-key"]);
    expect(keys).toHaveLength(4);
    expect(new Set(keys).size).toBe(1);
    expect(crm.leadCount()).toBe(1);
  });

  test("the contact page reaches the CRM's public endpoint through the browser", async ({ page }) => {
    await page.goto(`http://127.0.0.1:${PORT}/contact`);
    await page.locator("#c-firstName").fill("Contact");
    await page.locator("#c-lastName").fill("Tester");
    await page.locator("#c-email").fill("contact@example.com");
    await page.locator("#c-phone").fill("+14155552671");
    await page.locator("#c-subject").selectOption("GENERAL_INQUIRY");
    await page.locator("#c-message").fill("Hello, this is an end-to-end test message for the CRM API.");
    await page.waitForTimeout(2500); // the form's anti-bot minimum fill time (2 s)
    await page.getByRole("button", { name: "Send Message" }).click();
    await expect(page.getByText("Message received")).toBeVisible({ timeout: 30_000 });
    const contact = crm.requests.filter((r) => r.path === "/api/public/contact-inquiry");
    expect(contact).toHaveLength(1);
    expect(contact[0].json).toMatchObject({ companyId: COMPANY, firstName: "Contact", email: "contact@example.com", subject: "GENERAL_INQUIRY" });
    expect(contact[0].headers.authorization).toBeUndefined();
  });

  test("the running server logged no credential and no customer value, and holds no database module", async () => {
    const logs = server.logs();
    for (const needle of [KEY, INGEST, "cf-headers@example.com", "forged@example.com", "retry@example.com", "+14155550123", "Selfhosted"]) expect(logs, needle).not.toContain(needle);
    expect(logs).not.toMatch(/DATABASE|prisma|postgres/i);
  });
});
