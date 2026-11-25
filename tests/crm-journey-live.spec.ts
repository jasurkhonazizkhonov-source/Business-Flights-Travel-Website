import { test, expect, type Browser, type Page } from "@playwright/test";
import { standaloneBuildPresent, startStandalone, type StandaloneServer } from "./support/standalone-server";

// OPT-IN: the customer journey END TO END against a REAL, NON-PRODUCTION Compass Tools CRM: a real browser fills in the real forms of a real production (standalone)
// website server, which signs and sends the request to the CRM; the CRM stores the lead. Skipped unless these are set (same variables as crm-signed-live.spec.ts):
//
//   CRM_CONTRACT_URL=http://127.0.0.1:3301   CRM_CONTRACT_KEY=<WEBSITE_API_KEY>   CRM_CONTRACT_SECRET=<LEAD_INGEST_SECRET>   CRM_CONTRACT_COMPANY_ID=<WEBSITE_API_COMPANY_ID>
//
// It creates a few records (names JOURNEY-*, @example.test addresses, documentation IP addresses) and prints their marker so they can be found in the CRM's database.
// It never prints a key, a secret or a request body, and it checks that the website's own log contains neither the key nor the secret.
const url = process.env.CRM_CONTRACT_URL?.trim().replace(/\/+$/, "");
const key = process.env.CRM_CONTRACT_KEY?.trim();
const secret = process.env.CRM_CONTRACT_SECRET?.trim();
const companyId = process.env.CRM_CONTRACT_COMPANY_ID?.trim();
const configured = !!url && !!key && !!secret && !!companyId;
const STAMP = Date.now();

test.describe.configure({ mode: "serial" });
test.describe("the customer journey against a real CRM (opt-in)", () => {
  test.skip(!configured || !standaloneBuildPresent(), "needs CRM_CONTRACT_URL/KEY/SECRET/COMPANY_ID for a non-production CRM and a standalone build");
  test.setTimeout(180_000);

  let server: StandaloneServer;
  let down: StandaloneServer;
  let nextIp = 60;

  test.beforeAll(async () => {
    server = await startStandalone({ label: "journey live", port: 3281, withStaticAssets: true, env: { TRUSTED_PROXY: "cloudflare", CRM_API_URL: url!, CRM_API_KEY: key!, LEAD_INGEST_SECRET: secret!, CRM_COMPANY_ID: companyId! } });
    // The same website with a CRM address nothing listens on: the "CRM is down" behaviour.
    down = await startStandalone({ label: "journey crm down", port: 3282, withStaticAssets: true, env: { TRUSTED_PROXY: "cloudflare", CRM_API_URL: "http://127.0.0.1:3399", CRM_API_KEY: key!, LEAD_INGEST_SECRET: secret!, CRM_COMPANY_ID: companyId! } });
  });
  test.afterAll(async () => {
    await server?.stop();
    await down?.stop();
  });

  async function visitor(browser: Browser) {
    const context = await browser.newContext({ extraHTTPHeaders: { "CF-Connecting-IP": `203.0.113.${nextIp++}` }, viewport: { width: 390, height: 900 } });
    return { context, page: await context.newPage() };
  }
  async function fillFlightForm(page: Page, origin: string, lastName: string) {
    await page.goto(`${origin}/flights`);
    await page.waitForLoadState("networkidle");
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
    const form = page.locator("form:has(#phone)");
    await form.getByLabel("First Name", { exact: true }).fill("Journey");
    await form.getByLabel("Last Name", { exact: true }).fill(lastName);
    await form.getByLabel("Email Address", { exact: true }).fill(`${lastName.toLowerCase()}@example.test`);
    await page.locator("#phone").fill("+1 415 555 0132");
    await form.getByRole("button", { name: /Add preferences/ }).click();
    await form.locator("#preferredAirline").fill("Lufthansa");
    await form.locator("#budget").fill("4200");
    await form.getByRole("group", { name: "Date flexibility" }).getByText("± 2 days", { exact: true }).click();
    await page.waitForTimeout(3000); // the form's anti-bot minimum fill time
    await page.getByRole("button", { name: "Get a Free Flight Quote" }).click();
  }

  test("flight request: the customer sees the confirmation, and the website's own log never contains the key or the secret", async ({ browser }) => {
    const lastName = `JOURNEY-FLIGHT-${STAMP}`;
    const { context, page } = await visitor(browser);
    await fillFlightForm(page, server.origin, lastName);
    await expect(page.getByText("Thank you for your request")).toBeVisible({ timeout: 40_000 });
    console.log(`MARKER flight ${lastName}`);
    const logs = server.logs();
    expect(logs.includes(key!)).toBe(false);
    expect(logs.includes(secret!)).toBe(false);
    await context.close();
  });

  test("contact form: the customer sees the confirmation", async ({ browser }) => {
    const lastName = `JOURNEY-CONTACT-${STAMP}`;
    const { context, page } = await visitor(browser);
    await page.goto(`${server.origin}/contact`);
    await page.waitForLoadState("networkidle");
    await page.locator("#c-firstName").fill("Journey");
    await page.locator("#c-lastName").fill(lastName);
    await page.locator("#c-email").fill(`${lastName.toLowerCase()}@example.test`);
    await page.locator("#c-phone").fill("+1 415 555 0133");
    await page.locator("#c-subject").selectOption({ index: 1 });
    await page.locator("#c-message").fill("A test message for the real-CRM journey check. Please ignore.");
    await page.waitForTimeout(3000);
    await page.locator("form:has(#c-phone) button[type=submit]").click();
    await expect(page.getByText("Thank you for reaching out")).toBeVisible({ timeout: 40_000 });
    console.log(`MARKER contact ${lastName}`);
    await context.close();
  });

  test("newsletter: the visitor is told they are subscribed", async ({ browser }) => {
    const address = `journey-news-${STAMP}@example.test`;
    const { context, page } = await visitor(browser);
    await page.goto(`${server.origin}/`);
    await page.waitForLoadState("networkidle");
    const field = page.locator("#newsletter-email");
    await field.scrollIntoViewIfNeeded();
    await field.fill(address);
    await page.waitForTimeout(3000);
    await field.press("Enter");
    await expect(page.getByText(/You're subscribed|You're already on the list/)).toBeVisible({ timeout: 40_000 });
    console.log(`MARKER newsletter ${address}`);
    await context.close();
  });

  test("the CRM is unreachable: the visitor gets a clear failure within a bounded time, keeps what they typed, and can try again", async ({ browser }) => {
    const { context, page } = await visitor(browser);
    const started = Date.now();
    await fillFlightForm(page, down.origin, `JOURNEY-DOWN-${STAMP}`);
    await expect(page.getByText(/couldn.t submit your flight request|try again/i).first()).toBeVisible({ timeout: 90_000 });
    console.log(`CRM-DOWN failure shown after ${Math.round((Date.now() - started) / 1000)} s (including the 3 s fill delay)`);
    await expect(page.getByLabel("First Name", { exact: true })).toHaveValue("Journey");
    await expect(page.getByRole("button", { name: "Get a Free Flight Quote" })).toBeEnabled();
    expect(down.logs().includes(key!)).toBe(false);
    expect(down.logs().includes(secret!)).toBe(false);
    await context.close();
  });
});
