import { test, expect, type Browser, type Page } from "@playwright/test";
import { standaloneBuildPresent, startStandalone, type StandaloneServer } from "./support/standalone-server";
import { startStubCrm, type StubCrm } from "./support/stub-crm";

// Date flexibility, END TO END: a real browser fills in the real form of a real production (standalone) server, chooses how far the dates can move, submits, and
// the LOCAL stand-in CRM (which refuses unknown fields exactly like the real one) must receive that choice, as `dateFlexibilityDays` next to `datesFlexible`.
// The confirmation the customer sees must say what was chosen, and the other preferences (airline, budget, notes) must arrive unchanged beside it.
// Synthetic data only; nothing leaves the machine. Needs `NEXT_OUTPUT=standalone npm run build` first (skipped, never "passed", without it).
const PORT = 3262;
const KEY = "sentinel-api-key-" + "0123456789abcdef".repeat(3);
const COMPANY = "test-company";

test.describe.configure({ mode: "serial" });
test.describe("date flexibility reaches the CRM (standalone server, stub CRM)", () => {
  test.skip(!standaloneBuildPresent(), "needs a standalone build (NEXT_OUTPUT=standalone npm run build)");
  test.setTimeout(180_000);

  let crm: StubCrm;
  let server: StandaloneServer;
  let nextIp = 40;

  test.beforeAll(async () => {
    crm = await startStubCrm({ apiKey: KEY, companyId: COMPANY });
    server = await startStandalone({
      label: "date flexibility e2e",
      port: PORT,
      withStaticAssets: true,
      env: { TRUSTED_PROXY: "cloudflare", CRM_API_URL: crm.url, CRM_API_KEY: KEY, CRM_COMPANY_ID: COMPANY },
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

  async function visitor(browser: Browser) {
    const context = await browser.newContext({ extraHTTPHeaders: { "CF-Connecting-IP": `198.51.100.${nextIp++}` }, viewport: { width: 390, height: 900 } });
    return { context, page: await context.newPage() };
  }

  async function fillAndSubmit(page: Page, choose: string | null, options: { reopenPreferences?: boolean } = {}) {
    await page.goto(`${server.origin}/flights`);
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
    await form.getByLabel("First Name", { exact: true }).fill("Dana");
    await form.getByLabel("Last Name", { exact: true }).fill("Flexible");
    await form.getByLabel("Email Address", { exact: true }).fill("dana.flexible@example.invalid");
    await page.locator("#phone").fill("+1 415 555 0132");
    await form.getByRole("button", { name: /Add preferences/ }).click();
    await form.locator("#preferredAirline").fill("Lufthansa");
    await form.locator("#budget").fill("4200");
    await form.locator("#notes").fill("Window seats please");
    if (choose) await form.getByRole("group", { name: "Date flexibility" }).getByText(choose, { exact: true }).click();
    if (options.reopenPreferences) {
      await form.getByRole("button", { name: "Hide additional preferences" }).click();
      await form.getByRole("button", { name: /Add preferences/ }).click();
    }
    await page.waitForTimeout(3000); // the form's anti-bot minimum fill time (2.5 s)
    await page.getByRole("button", { name: "Get a Free Flight Quote" }).click();
    await expect(page.getByText("Thank you for your request")).toBeVisible({ timeout: 30_000 });
  }

  const received = () => {
    const calls = crm.requests.filter((r) => r.path === "/api/v1/website/flight-inquiries");
    expect(calls).toHaveLength(1);
    expect(calls[0].status).toBe(201);
    return calls[0].json as Record<string, unknown>;
  };

  for (const [label, days] of [["Exact dates", 0], ["± 1 day", 1], ["± 2 days", 2], ["± 3 days", 3]] as const) {
    test(`${label}: the CRM receives datesFlexible=${days > 0} and dateFlexibilityDays=${days}, with every other preference intact; the customer's confirmation says so`, async ({ browser }) => {
      const { context, page } = await visitor(browser);
      await fillAndSubmit(page, label);
      const body = received();
      expect(body).toMatchObject({ datesFlexible: days > 0, dateFlexibilityDays: days, preferredAirline: "Lufthansa", approximateBudget: 4200, budgetCurrency: "USD", additionalNotes: "Window seats please", departureAirportIata: "JFK", arrivalAirportIata: "CDG", firstName: "Dana", lastName: "Flexible" });
      await expect(page.getByText("Date flexibility", { exact: true })).toBeVisible();
      await expect(page.locator("dd").filter({ hasText: new RegExp(`^${label.replace("±", "\\±")}$`) })).toBeVisible();
      await context.close();
    });
  }

  test("the default (the visitor never opens the section's choice) is exact dates, sent explicitly", async ({ browser }) => {
    const { context, page } = await visitor(browser);
    await fillAndSubmit(page, null);
    expect(received()).toMatchObject({ datesFlexible: false, dateFlexibilityDays: 0 });
    await context.close();
  });

  test("a choice made, then the section closed and re-opened before submitting, is the one that is sent", async ({ browser }) => {
    const { context, page } = await visitor(browser);
    await fillAndSubmit(page, "± 3 days", { reopenPreferences: true });
    expect(received()).toMatchObject({ datesFlexible: true, dateFlexibilityDays: 3, preferredAirline: "Lufthansa", approximateBudget: 4200 });
    await context.close();
  });

  test("the CRM's strict contract is not violated: nothing but allow-listed fields is sent (the stub answers 400 to an unknown field)", async ({ browser }) => {
    const { context, page } = await visitor(browser);
    await fillAndSubmit(page, "± 2 days");
    const body = received();
    for (const forbidden of ["flexibleDates", "website", "renderedAt", "submissionId", "companyId"]) expect(body).not.toHaveProperty(forbidden);
    await context.close();
  });
});
