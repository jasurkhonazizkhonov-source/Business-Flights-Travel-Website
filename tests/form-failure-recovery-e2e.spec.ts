import { test, expect, type Browser, type Locator, type Page } from "@playwright/test";
import { standaloneBuildPresent, startStandalone, type StandaloneServer } from "./support/standalone-server";
import { startStubCrm, type StubCrm } from "./support/stub-crm";
import { ACTION_FAILURE_MESSAGES } from "../src/lib/safe-action";

// What a VISITOR experiences when a form submission fails, for all three forms (flight request, contact, newsletter): they stay on the page, everything
// they typed is still there, an inline message says what happened (and never claims success), the button works again, and trying again succeeds.
// Real browser, real production (standalone) server, a LOCAL stand-in CRM (tests/support/stub-crm.ts), synthetic data only. Nothing leaves the machine.
//
// Two layers of failure are covered:
//   * the CALL itself fails (dropped connection, HTTP 500/413, a reply that is not an action reply, no answer at all): the page's own safe handler
//     shows the fixed message from src/lib/safe-action.ts;
//   * the call succeeds but the CRM refuses or fails (400, 401, 403, 429, 500, a reply of the wrong shape): the server action returns its friendly error.
//
// Needs `NEXT_OUTPUT=standalone npm run build` first. Skipped, never "passed", without it.
const PORT = 3239;
const KEY = "sentinel-api-key-" + "0123456789abcdef".repeat(3);
const COMPANY = "test-company";
const GENERIC_ERROR_PAGE = "This page hit an unexpected error";

test.describe.configure({ mode: "serial" });
test.describe("form failure recovery (standalone server, stub CRM)", () => {
  test.skip(!standaloneBuildPresent(), "needs a standalone build (NEXT_OUTPUT=standalone npm run build)");
  test.setTimeout(180_000);

  let crm: StubCrm;
  let server: StandaloneServer;
  const origin = () => `http://127.0.0.1:${PORT}`;
  let nextIp = 10;
  /** Navigates and waits for the page to settle, so the form is hydrated before a test fills it in. A click that lands before React attaches its handler is
   * a native form submission (the page reloads and no inline message can appear): a test race under load, not what a visitor on a settled page gets. */
  const openAndSettle = (route: string) => async (page: Page) => {
    await page.goto(`${origin()}${route}`);
    await page.waitForLoadState("networkidle");
  };

  test.beforeAll(async () => {
    crm = await startStubCrm({ apiKey: KEY, companyId: COMPANY });
    server = await startStandalone({
      label: "form failure recovery e2e",
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

  // One browser context per test with its own trusted client address, so the forms' per-visitor rate limits never interfere with each other.
  async function visitor(browser: Browser) {
    const context = await browser.newContext({ extraHTTPHeaders: { "CF-Connecting-IP": `198.51.100.${nextIp++}` } });
    const page = await context.newPage();
    return { context, page };
  }

  type Driver = {
    name: string;
    failureMessage: string;
    crmPath: string;
    open: (page: Page) => Promise<void>;
    fillIn: (page: Page) => Promise<void>;
    submit: (page: Page) => Promise<void>;
    expectTypedValuesKept: (page: Page) => Promise<void>;
    success: (page: Page) => Locator;
    alert: (page: Page) => Locator;
    submitButton: (page: Page) => Locator;
    /** How many times the website may call the CRM for one press of the button when the CRM answers with a retryable failure. */
    maxCrmAttemptsOnRetryableFailure: number;
  };

  const contact: Driver = {
    name: "contact",
    failureMessage: ACTION_FAILURE_MESSAGES.contactMessage,
    crmPath: "/api/public/contact-inquiry",
    maxCrmAttemptsOnRetryableFailure: 1,
    open: openAndSettle("/contact"),
    fillIn: async (page) => {
      await page.fill("#c-firstName", "Recover");
      await page.fill("#c-lastName", "Tester");
      await page.fill("#c-email", "recover.tester@example.invalid");
      await page.fill("#c-phone", "+1 415 555 0132");
      await page.selectOption("#c-subject", { index: 1 });
      await page.fill("#c-message", "Synthetic message for an automated recovery test. Please ignore.");
      await page.waitForTimeout(2700); // the form's anti-bot minimum fill time (2 s) counts from when it was shown
    },
    submit: (page) => page.locator('form:has(#c-firstName) button[type="submit"]').click(),
    expectTypedValuesKept: async (page) => {
      await expect(page.locator("#c-firstName")).toHaveValue("Recover");
      await expect(page.locator("#c-lastName")).toHaveValue("Tester");
      await expect(page.locator("#c-email")).toHaveValue("recover.tester@example.invalid");
      await expect(page.locator("#c-message")).toHaveValue("Synthetic message for an automated recovery test. Please ignore.");
    },
    success: (page) => page.getByText("Message received"),
    alert: (page) => page.locator('form:has(#c-firstName) div.bg-red-50[role="alert"]'),
    submitButton: (page) => page.locator('form:has(#c-firstName) button[type="submit"]'),
  };

  const newsletter: Driver = {
    name: "newsletter",
    failureMessage: ACTION_FAILURE_MESSAGES.newsletter,
    crmPath: "/api/public/subscribe",
    maxCrmAttemptsOnRetryableFailure: 1,
    open: openAndSettle("/contact"),
    fillIn: async (page) => void (await page.fill("#newsletter-email", "newsletter.tester@example.invalid")),
    submit: (page) => page.locator('form:has(#newsletter-email) button[type="submit"]').click(),
    expectTypedValuesKept: async (page) => void (await expect(page.locator("#newsletter-email")).toHaveValue("newsletter.tester@example.invalid")),
    success: (page) => page.getByText("You're subscribed"),
    alert: (page) => page.locator('form:has(#newsletter-email) p[role="alert"]'),
    submitButton: (page) => page.locator('form:has(#newsletter-email) button[type="submit"]'),
  };

  const flight: Driver = {
    name: "flight request",
    failureMessage: ACTION_FAILURE_MESSAGES.flightRequest,
    crmPath: "/api/v1/website/flight-inquiries",
    maxCrmAttemptsOnRetryableFailure: 3,
    open: openAndSettle("/flights"),
    fillIn: async (page) => {
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
      await form.getByLabel("First Name", { exact: true }).fill("Recover");
      await form.getByLabel("Last Name", { exact: true }).fill("Tester");
      await form.getByLabel("Email Address", { exact: true }).fill("recover.flight@example.invalid");
      await page.locator("#phone").fill("+1 415 555 0132");
      await page.waitForTimeout(3000); // the form's anti-bot minimum fill time (2.5 s)
    },
    submit: (page) => page.getByRole("button", { name: "Get a Free Flight Quote" }).click(),
    expectTypedValuesKept: async (page) => {
      const form = page.locator("form").first();
      await expect(form.getByLabel("First Name", { exact: true })).toHaveValue("Recover");
      await expect(form.getByLabel("Last Name", { exact: true })).toHaveValue("Tester");
      await expect(form.getByLabel("Email Address", { exact: true })).toHaveValue("recover.flight@example.invalid");
      await expect(page.getByPlaceholder("City or airport code").first()).toHaveValue(/JFK/);
      await expect(page.getByPlaceholder("City or airport code").nth(1)).toHaveValue(/CDG/);
    },
    success: (page) => page.getByText("Thank you for your request"),
    alert: (page) => page.locator('form div.bg-red-50[role="alert"]'),
    submitButton: (page) => page.getByRole("button", { name: /Get a Free Flight Quote|Submitting your request/ }),
  };

  const drivers = [contact, newsletter, flight];
  const crmCalls = (d: Driver) => crm.requests.filter((r) => r.path === d.crmPath);
  const isAction = (page: Page, route: { request: () => { method: () => string; headers: () => Record<string, string> } }) => route.request().method() === "POST" && "next-action" in route.request().headers();

  async function expectStillUsable(d: Driver, page: Page) {
    await expect(page.getByText(GENERIC_ERROR_PAGE)).toHaveCount(0); // never the route error page
    await d.expectTypedValuesKept(page); // nothing the visitor typed is lost
    await expect(d.success(page)).toHaveCount(0); // never a success message for a request nobody confirmed
    await expect(d.submitButton(page)).toBeEnabled(); // the button works again
  }

  for (const d of drivers) {
    test.describe(d.name, () => {
      // -------- the CALL fails: the page's own handler ---------------------------------------------------------------------------------------------
      const callFailures: Array<[string, (page: Page) => Promise<unknown>]> = [
        ["the connection is dropped", (p) => p.route("**/*", (r) => (isAction(p, r) ? r.abort("connectionreset") : r.continue()))],
        ["the server answers HTTP 500", (p) => p.route("**/*", (r) => (isAction(p, r) ? r.fulfill({ status: 500, contentType: "text/plain", body: "boom" }) : r.continue()))],
        ["the request is refused as too large (HTTP 413)", (p) => p.route("**/*", (r) => (isAction(p, r) ? r.fulfill({ status: 413, contentType: "text/plain", body: "Body exceeded" }) : r.continue()))],
        ["the reply is not an action reply", (p) => p.route("**/*", (r) => (isAction(p, r) ? r.fulfill({ status: 200, contentType: "text/x-component", body: '0:"not an action reply"\n' }) : r.continue()))],
      ];
      for (const [label, install] of callFailures) {
        test(`${label}: inline message, input kept, no false success, then a retry succeeds and creates exactly one record`, async ({ browser }) => {
          const { context, page } = await visitor(browser);
          try {
            await d.open(page);
            await d.fillIn(page);
            await install(page);
            await d.submit(page);
            await expect(d.alert(page)).toHaveText(d.failureMessage, { timeout: 15_000 });
            await expectStillUsable(d, page);
            expect(crmCalls(d), "the failed call never reached the CRM").toHaveLength(0);
            // recovery: the very same page, the very same fields
            await page.unroute("**/*");
            await d.submit(page);
            await expect(d.success(page)).toBeVisible({ timeout: 30_000 });
            expect(crmCalls(d).length, "one press, one CRM call").toBe(1);
          } finally {
            await context.close();
          }
        });
      }

      if (d !== flight) {
        test("no answer at all: the form gives up after its own time limit, shows the message, keeps the input", async ({ browser }) => {
          test.setTimeout(120_000);
          const { context, page } = await visitor(browser);
          try {
            await d.open(page);
            await d.fillIn(page);
            await page.route("**/*", (r) => (isAction(page, r) ? undefined : r.continue())); // the action request is held and never answered
            await d.submit(page);
            await expect(d.submitButton(page)).toBeDisabled(); // while it waits, a second click cannot send a second request
            await expect(d.alert(page)).toHaveText(d.failureMessage, { timeout: 45_000 });
            await expectStillUsable(d, page);
          } finally {
            await context.close();
          }
        });
      }

      // -------- the call succeeds but the CRM refuses or fails: the action's friendly error ----------------------------------------------------------
      const crmFailures: Array<[string, Parameters<StubCrm["script"]>[0], boolean]> = [
        ["CRM HTTP 400", { status: 400, body: { ok: false, error: { code: "validation_failed", message: "x" } } }, false],
        ["CRM HTTP 401", { status: 401, body: { ok: false, error: { code: "unauthorized", message: "x" } } }, false],
        ["CRM HTTP 403", { status: 403, body: { ok: false, error: "forbidden" } }, false],
        ["CRM HTTP 429", { status: 429, body: { ok: false, error: { code: "rate_limited", message: "x" } }, headers: { "Retry-After": "1" } }, true],
        ["CRM HTTP 500", { status: 500, body: { ok: false, error: { code: "internal_error", message: "x" } } }, true],
        ["a CRM reply of the wrong shape", { status: 200, body: { unexpected: true } }, d === flight],
      ];
      for (const [label, scripted, retryable] of crmFailures) {
        test(`${label}: friendly inline error, input kept, no false success, then the next attempt succeeds`, async ({ browser }) => {
          const { context, page } = await visitor(browser);
          try {
            await d.open(page);
            await d.fillIn(page);
            crm.script(scripted, { count: 10, path: d.crmPath });
            await d.submit(page);
            await expect(d.alert(page)).toBeVisible({ timeout: 60_000 });
            await expect(d.alert(page)).not.toHaveText(/\b(stack|exception|undefined|\[object)/i);
            await expectStillUsable(d, page);
            const attempts = crmCalls(d).length;
            expect(attempts).toBeGreaterThanOrEqual(1);
            expect(attempts).toBeLessThanOrEqual(retryable ? d.maxCrmAttemptsOnRetryableFailure : 1);
            // recovery
            crm.clearScripts();
            await d.submit(page);
            await expect(d.success(page)).toBeVisible({ timeout: 30_000 });
          } finally {
            await context.close();
          }
        });
      }

      // -------- no accidental second submission while one is in progress -------------------------------------------------------------------------
      test("pressing the button twice while the first request is in flight sends ONE request", async ({ browser }) => {
        const { context, page } = await visitor(browser);
        try {
          await d.open(page);
          await d.fillIn(page);
          let actionPosts = 0;
          await page.route("**/*", async (route) => {
            if (isAction(page, route)) {
              actionPosts++;
              await new Promise((resolve) => setTimeout(resolve, 1500)); // a slow network
            }
            await route.continue();
          });
          const button = d.submitButton(page);
          await button.click();
          await button.click({ force: true, timeout: 2000 }).catch(() => undefined); // a second tap on a disabled button does nothing
          await expect(d.success(page)).toBeVisible({ timeout: 30_000 });
          expect(actionPosts).toBe(1);
          expect(crmCalls(d)).toHaveLength(1);
        } finally {
          await context.close();
        }
      });
    });
  }
});
