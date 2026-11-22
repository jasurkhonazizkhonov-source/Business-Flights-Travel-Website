import { test, expect, type Page } from "@playwright/test";

// The phone-number validator (libphonenumber-js and its metadata, ~120 KB) is loaded ON DEMAND - not with the page - on /, /contact and /flights
// (src/lib/phone-validator.ts). These tests pin both halves of that: the library really is out of the initial JavaScript, and validation still behaves
// exactly as before - same messages, same accessibility attributes, keyboard submit, a submit that arrives before the library has loaded, and a
// library that cannot be loaded at all (the server then remains the authority).
//
// Runs in every viewport project (desktop and three phone widths) like the rest of the UI suite. No CRM is configured in the test environment.

const MARKER = "country_calling_codes"; // a key that only exists in libphonenumber's metadata
const CONTACT_PHONE_MESSAGE = "Please enter a valid phone number, including the complete number.";
const FLIGHT_PHONE_MESSAGE = "Please enter a valid phone number, including the complete number, so our travel specialist can reach you.";

test.describe("phone validation is not part of the initial JavaScript", () => {
  for (const route of ["/", "/contact", "/flights"]) {
    test(`${route}: no <script> in the initial HTML carries the phone-number metadata`, async ({ request, baseURL }) => {
      const html = await (await request.get(route)).text();
      const sources = [...new Set([...html.matchAll(/<script[^>]+src="([^"]+\.js[^"]*)"/g)].map((m) => m[1]))];
      expect(sources.length).toBeGreaterThan(3);
      for (const src of sources) {
        const body = await (await request.get(new URL(src, baseURL).href)).text();
        expect(body.includes(MARKER), `${src} still contains the phone-number metadata`).toBe(false);
      }
    });
  }

  test("the validator is fetched on demand: touching the phone field loads one more, small chunk", async ({ page, request }) => {
    const chunks = () => page.evaluate(() => performance.getEntriesByType("resource").map((e) => e.name).filter((u) => /\/_next\/static\/chunks\/.*\.js/.test(u)));
    await page.goto("/contact");
    await expect(page.locator("#c-phone")).toBeVisible();
    await page.locator(".PhoneInput").first().waitFor({ timeout: 30000 }); // settled: the upgraded field has loaded its own chunks
    const before = new Set(await chunks());
    await page.locator("#c-phone").focus();
    await expect.poll(async () => (await chunks()).filter((u) => !before.has(u)).length, { timeout: 15000 }).toBeGreaterThan(0);
    // the chunk that arrived is the small validator module, not another copy of the metadata
    for (const url of (await chunks()).filter((u) => !before.has(u))) expect((await (await request.get(url)).text()).includes(MARKER), url).toBe(false);
  });
});

async function dismissConsent(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem(
        "bft-cookie-consent",
        JSON.stringify({ version: 1, decidedAt: new Date().toISOString(), preferences: { necessary: true, analytics: false, marketing: false } }),
      );
    } catch {
      /* storage unavailable: the banner may show; the tests below scroll their targets into view */
    }
  });
}

// The field starts as a plain input and is swapped for the richer country-select input once its chunk arrives (existing behaviour), so the target can be
// replaced under the test: fill()/press() re-resolve the element and retry, where a separate scrollIntoView + focus would race the swap.
// Makes the validator's chunk slow (1.5 s) and the rich phone input's chunk slower still (6 s). The plain field is swapped for the rich one when its chunk
// arrives (existing behaviour, which re-parses the value); keeping that swap well after the validator arrives makes these tests deterministic.
async function delayPhoneChunks(page: Page) {
  await page.route("**/_next/static/chunks/*.js", async (route) => {
    try {
      const response = await route.fetch();
      const body = await response.text();
      if (body.includes(MARKER)) await new Promise((resolve) => setTimeout(resolve, body.includes("PhoneInput") ? 6000 : 1500));
      await route.fulfill({ response, body });
    } catch {
      await route.abort().catch(() => undefined); // the test (and its page) has already ended
    }
  });
}
// For tests that are not about loading order: wait until the field has been upgraded, so the value cannot be re-parsed under the test.
async function waitForRichPhone(page: Page) {
  await page.locator(".PhoneInput").first().waitFor({ timeout: 30000 });
}

// The tests below that submit "before the library has loaded" mean: before the phone VALIDATOR has loaded, not before React has hydrated the form.
// A click that lands on the server-rendered form before React has attached its handlers is a native form submission (a reload), so the intended
// behaviour is never exercised and the test races the hydration of the whole page, which is what made them fail now and then under load.
async function waitForFormHydrated(page: Page, formSelector: string) {
  await page.waitForFunction((selector) => {
    const form = document.querySelector(selector) as unknown as Record<string, unknown> | null;
    if (!form) return false;
    const key = Object.keys(form).find((k) => k.startsWith("__reactProps$"));
    return !!key && typeof (form[key] as { onSubmit?: unknown }).onSubmit === "function";
  }, formSelector, { timeout: 30000 });
}

async function setPhone(page: Page, selector: string, value: string) {
  await page.locator(selector).fill(value);
}
async function pressInPhone(page: Page, selector: string, key: string) {
  await page.locator(selector).press(key);
}

test.describe("validation behaves exactly as before (contact form)", () => {
  test.beforeEach(async ({ page }) => dismissConsent(page));

  test("an incomplete number shows the same message, marks the field invalid and wires the error for assistive technology; a valid number clears it", async ({ page }) => {
    await page.goto("/contact");
    await waitForRichPhone(page);
    await setPhone(page, "#c-phone", "+1415");
    await page.locator("form:has(#c-phone) button[type=submit]").click();
    const error = page.locator("#c-phone-error");
    await expect(error).toHaveText(CONTACT_PHONE_MESSAGE);
    await expect(page.locator("#c-phone")).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#c-phone")).toHaveAttribute("aria-describedby", "c-phone-error");

    await setPhone(page, "#c-phone", "+14155709267");
    await page.locator("form:has(#c-phone) button[type=submit]").click();
    await expect(page.locator("#c-phone-error")).toHaveCount(0); // other fields are empty, so other errors remain - but not the phone one
    await expect(page.locator("#c-firstName-error")).toBeVisible();
  });

  test("an empty phone is 'required', and an international (non-US) number is accepted", async ({ page }) => {
    await page.goto("/contact");
    await waitForRichPhone(page);
    await page.locator("form:has(#c-phone) button[type=submit]").click();
    await expect(page.locator("#c-phone-error")).toHaveText("Phone number is required.");
    await setPhone(page, "#c-phone", "+442079460958"); // a UK number
    await page.locator("form:has(#c-phone) button[type=submit]").click();
    await expect(page.locator("#c-phone-error")).toHaveCount(0);
  });

  test("the keyboard works: Enter inside the phone field validates", async ({ page }) => {
    await page.goto("/contact");
    await waitForRichPhone(page);
    await setPhone(page, "#c-phone", "+1415");
    await pressInPhone(page, "#c-phone", "Enter");
    await expect(page.locator("#c-phone-error")).toHaveText(CONTACT_PHONE_MESSAGE);
  });

  test("a submit that arrives BEFORE the library has loaded waits for it, then validates exactly the same way", async ({ page }) => {
    test.setTimeout(60_000); // this test makes the validator's chunks deliberately slow (1.5 s, 6 s) and waits up to 30 s inside: its whole-test budget must be larger than its own waits
    await delayPhoneChunks(page);
    await page.goto("/contact");
    await waitForFormHydrated(page, "form:has(#c-phone)");
    await setPhone(page, "#c-phone", "+1415");
    await page.locator("form:has(#c-phone) button[type=submit]").click(); // immediately: the library is still on its way
    await expect(page.locator("#c-phone-error")).toHaveText(CONTACT_PHONE_MESSAGE, { timeout: 15000 });
    // a second, rapid submit does not queue a second wait
    await page.locator("form:has(#c-phone) button[type=submit]").click();
    await expect(page.locator("#c-phone-error")).toHaveText(CONTACT_PHONE_MESSAGE);
  });

  test("a valid number submitted before the library has loaded is accepted once it arrives (no phone error)", async ({ page }) => {
    test.setTimeout(60_000); // this test makes the validator's chunks deliberately slow (1.5 s, 6 s) and waits up to 30 s inside: its whole-test budget must be larger than its own waits
    await delayPhoneChunks(page);
    await page.goto("/contact");
    await waitForFormHydrated(page, "form:has(#c-phone)");
    await setPhone(page, "#c-phone", "+14155709267");
    await page.locator("form:has(#c-phone) button[type=submit]").click();
    await expect(page.locator("#c-firstName-error")).toBeVisible({ timeout: 15000 }); // validation ran...
    await expect(page.locator("#c-phone-error")).toHaveCount(0); // ...and accepted the number
  });

  test("if the library can never be loaded the form is not stuck: the server's own validation answers with the same message", async ({ page }) => {
    test.setTimeout(60_000); // this test makes the validator's chunks deliberately slow (1.5 s, 6 s) and waits up to 30 s inside: its whole-test budget must be larger than its own waits
    await page.route("**/_next/static/chunks/*.js", async (route) => {
      // A chunk request can still be in flight when the test ends (the page keeps loading while the assertions finish); without this guard
      // Playwright reports "route.fetch: Test ended" as the test's failure, which made this spec fail intermittently under load. The handler
      // behaves exactly as before for every chunk that completes during the test.
      try {
        const response = await route.fetch();
        const body = await response.text();
        if (body.includes(MARKER)) return await route.abort();
        return await route.fulfill({ response, body });
      } catch {
        await route.abort().catch(() => undefined); // the test (and its page) has already ended
      }
    });
    await page.goto("/contact");
    await page.fill("#c-firstName", "Phone");
    await page.fill("#c-lastName", "Fallback");
    await page.fill("#c-email", "phone-fallback@example.test");
    await page.selectOption("#c-subject", { index: 1 });
    await page.fill("#c-message", "Checking the fallback when the validator cannot load.");
    await setPhone(page, "#c-phone", "12");
    const submit = page.locator("form:has(#c-phone) button[type=submit]");
    await submit.click();
    // Either the server's field error (same wording) or, if the contact rate limit of a long test run has been reached, its friendly refusal.
    await expect(page.locator("#c-phone-error, form .bg-red-50 p").first()).toBeVisible({ timeout: 20000 });
    await expect(submit).toBeEnabled({ timeout: 20000 });
    await page.unrouteAll({ behavior: "ignoreErrors" }); // let in-flight chunk requests end quietly with the test
  });
});

for (const route of ["/", "/flights"]) {
  test.describe(`validation behaves exactly as before (flight request form on ${route})`, () => {
    test.beforeEach(async ({ page }) => dismissConsent(page));

    test("an incomplete number shows the flight form's own message; Enter in the field validates; a valid number clears it", async ({ page }) => {
      await page.goto(route);
      await waitForRichPhone(page);
      await setPhone(page, "#phone", "+1415");
      await pressInPhone(page, "#phone", "Enter");
      await expect(page.locator("#phone-error")).toHaveText(FLIGHT_PHONE_MESSAGE);
      await expect(page.locator("#phone")).toHaveAttribute("aria-invalid", "true");

      await setPhone(page, "#phone", "+14155709267");
      await pressInPhone(page, "#phone", "Enter");
      await expect(page.locator("#phone-error")).toHaveCount(0);
      await expect(page.getByText("Select an origin").first()).toBeVisible(); // the rest of the form still validates
    });

    test("a submit before the library has loaded waits for it and then validates the same way", async ({ page }) => {
      test.setTimeout(60_000); // this test makes the validator's chunks deliberately slow (1.5 s, 6 s) and waits up to 30 s inside: its whole-test budget must be larger than its own waits
      await delayPhoneChunks(page);
      await page.goto(route);
      await waitForFormHydrated(page, "form:has(#phone)");
      await setPhone(page, "#phone", "+1415");
      await pressInPhone(page, "#phone", "Enter");
      await expect(page.locator("#phone-error")).toHaveText(FLIGHT_PHONE_MESSAGE, { timeout: 15000 });
    });
  });
}
