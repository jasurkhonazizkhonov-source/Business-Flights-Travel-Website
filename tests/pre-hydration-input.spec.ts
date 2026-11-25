import { test, expect, type Page } from "@playwright/test";

// What a visitor types (or a browser autofills) into a form BEFORE React has hydrated it must still be there afterwards. It used not to be: the fields are controlled by
// useState("") and hydration wrote that empty value back into the input (found on the production build with no throttling at all; on a phone the window lasts seconds).
// The script in src/lib/early-input-capture.ts records the edits and each form takes its own fields back (useAdoptEarlyInputs).
//
// To make the window deterministic these tests hold every JavaScript chunk back for a while, type with real keystrokes the moment the form exists, check that hydration
// has NOT happened yet, release the chunks, and check what the visitor sees afterwards. Real keystrokes, not fill(): fill() is what autofill looks like, and one case below
// uses it on purpose for that.

const HOLD_MS = 8000; // longer than the slowest test below takes to type, so hydration cannot finish while a visitor is still typing

async function holdChunks(page: Page) {
  await page.route("**/_next/static/chunks/*.js", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, HOLD_MS));
    await route.continue().catch(() => undefined);
  });
}
const hydrated = (page: Page, formSelector: string) =>
  page.evaluate((selector) => {
    const form = document.querySelector(selector) as unknown as Record<string, unknown> | null;
    const key = form && Object.keys(form).find((k) => k.startsWith("__reactProps$"));
    return !!key && typeof (form![key] as { onSubmit?: unknown }).onSubmit === "function";
  }, formSelector);
async function waitHydrated(page: Page, formSelector: string) {
  await expect.poll(() => hydrated(page, formSelector), { timeout: 30000 }).toBe(true);
}

test.describe("text entered before hydration survives it", () => {
  test.setTimeout(90_000);

  test("contact form: names, email, subject and message typed before hydration are still there after it, and are what gets validated", async ({ page }) => {
    await holdChunks(page);
    await page.goto("/contact", { waitUntil: "commit" });
    await page.waitForSelector("#c-firstName", { state: "attached" });
    expect(await hydrated(page, "form:has(#c-firstName)"), "the test is only meaningful before hydration").toBe(false);
    await page.locator("#c-firstName").click();
    await page.keyboard.type("Dana", { delay: 15 });
    await page.locator("#c-lastName").click();
    await page.keyboard.type("Visitor", { delay: 15 });
    await page.locator("#c-email").click();
    await page.keyboard.type("dana.visitor@example.org", { delay: 5 });
    await page.locator("#c-subject").selectOption({ index: 1 });
    await page.locator("#c-message").click();
    await page.keyboard.type("A message typed before the page was ready.", { delay: 5 });
    expect(await hydrated(page, "form:has(#c-firstName)"), "still not hydrated while the visitor was typing").toBe(false);

    await waitHydrated(page, "form:has(#c-firstName)");
    await expect(page.locator("#c-firstName")).toHaveValue("Dana");
    await expect(page.locator("#c-lastName")).toHaveValue("Visitor");
    await expect(page.locator("#c-email")).toHaveValue("dana.visitor@example.org");
    await expect(page.locator("#c-message")).toHaveValue("A message typed before the page was ready.");
    await expect(page.locator("#c-subject")).not.toHaveValue("");

    // The values are in the form's state, not just on screen: submitting reports only what is really missing (the phone), never the fields typed early.
    await page.locator("form:has(#c-firstName) button[type=submit]").click();
    await expect(page.locator("#c-phone-error")).toBeVisible({ timeout: 20000 });
    await expect(page.locator("#c-firstName-error")).toHaveCount(0);
    await expect(page.locator("#c-lastName-error")).toHaveCount(0);
    await expect(page.locator("#c-email-error")).toHaveCount(0);
    await expect(page.locator("#c-message-error")).toHaveCount(0);
  });

  test("a browser autofill before hydration (the same input events as fill) is kept too", async ({ page }) => {
    await holdChunks(page);
    await page.goto("/contact", { waitUntil: "commit" });
    await page.waitForSelector("#c-email", { state: "attached" });
    expect(await hydrated(page, "form:has(#c-firstName)")).toBe(false);
    await page.locator("#c-firstName").fill("Auto");
    await page.locator("#c-email").fill("auto.fill@example.org");
    await waitHydrated(page, "form:has(#c-firstName)");
    await expect(page.locator("#c-firstName")).toHaveValue("Auto");
    await expect(page.locator("#c-email")).toHaveValue("auto.fill@example.org");
  });

  test("flight request form: names and email typed before hydration survive it", async ({ page }) => {
    await holdChunks(page);
    await page.goto("/flights", { waitUntil: "commit" });
    await page.waitForSelector("#firstName", { state: "attached" });
    expect(await hydrated(page, "form:has(#firstName)")).toBe(false);
    await page.locator("#firstName").click();
    await page.keyboard.type("Sam", { delay: 15 });
    await page.locator("#lastName").click();
    await page.keyboard.type("Traveller", { delay: 15 });
    await page.locator("#email").click();
    await page.keyboard.type("sam.traveller@example.org", { delay: 5 });
    await waitHydrated(page, "form:has(#firstName)");
    await expect(page.locator("#firstName")).toHaveValue("Sam");
    await expect(page.locator("#lastName")).toHaveValue("Traveller");
    await expect(page.locator("#email")).toHaveValue("sam.traveller@example.org");
  });

  test("newsletter form: an address typed before hydration survives it", async ({ page }) => {
    await holdChunks(page);
    await page.goto("/", { waitUntil: "commit" });
    const field = page.locator("input[type=email][id$='-email']").last();
    await field.waitFor({ state: "attached" });
    const id = await field.getAttribute("id");
    expect(await hydrated(page, `form:has(#${id})`)).toBe(false);
    await field.scrollIntoViewIfNeeded();
    await field.click();
    await page.keyboard.type("news.reader@example.org", { delay: 5 });
    await waitHydrated(page, `form:has(#${id})`);
    await expect(field).toHaveValue("news.reader@example.org");
  });

  test("typing AFTER hydration is untouched, and a form mounted later does not receive stale text", async ({ page }) => {
    await page.goto("/contact");
    await waitHydrated(page, "form:has(#c-firstName)");
    await page.locator("#c-firstName").fill("");
    await page.locator("#c-firstName").click();
    await page.keyboard.type("After", { delay: 10 });
    await expect(page.locator("#c-firstName")).toHaveValue("After");
    // The early script is closed for that field once its form has hydrated: nothing typed now is remembered for a later mount.
    const remembered = await page.evaluate(() => (window as unknown as { __bftEarlyInputs?: Record<string, string> }).__bftEarlyInputs?.["c-firstName"]);
    expect(remembered).toBeUndefined();
  });
});
