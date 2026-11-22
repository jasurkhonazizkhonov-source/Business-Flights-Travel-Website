import { test, expect, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Departure-airport and phone-country suggestions (src/hooks/useVisitorHint.ts, useDeviceAirport.ts, FlightRequestForm.tsx, PhoneNumberField.tsx).
//
// The server's answer (GET /api/visitor-hint: a country code and the nearest major airport, derived from Cloudflare's approximate location) is
// replaced here by a controlled response, so every case is deterministic and no real location is involved. The route itself, with real Cloudflare-style
// headers, is tested in tests/visitor-hint-route.spec.ts. What these cover: a suggestion is shown and labelled as one; it never replaces a choice the
// visitor made; a late answer is ignored once the visitor has started; the device's own location is asked for only on an explicit click (or silently
// when the permission is already granted) and never twice after a refusal; failures degrade to the normal empty form.

const FRANKFURT = { iata: "FRA", city: "Frankfurt am Main", name: "Frankfurt Main Airport", country: "Germany" };

async function dismissCookieBanner(page: Page) {
  const reject = page.getByRole("button", { name: /Reject Non-Essential/i });
  if (await reject.isVisible().catch(() => false)) await reject.click();
}

type Hint = { countryCode?: string; airport?: typeof FRANKFURT };
// `delay` is either milliseconds or a promise the answer waits for (a promise makes an ordering test independent of how fast the machine is).
async function mockHint(page: Page, body: Hint | { status: number }, delay: number | Promise<unknown> = 0) {
  await page.route("**/api/visitor-hint", async (route: Route) => {
    if (typeof delay === "number") {
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    } else {
      await delay;
    }
    if ("status" in body) await route.fulfill({ status: body.status, body: "boom" });
    else await route.fulfill({ status: 200, contentType: "application/json", headers: { "cache-control": "private, no-store" }, body: JSON.stringify(body) });
  });
}

const fromField = (page: Page) => page.getByRole("combobox", { name: /Flight 1 — From/ });
const toField = (page: Page) => page.getByRole("combobox", { name: "To", exact: true });
const suggestedTag = (page: Page) => page.getByText("Suggested", { exact: true });
const phoneCountry = (page: Page) => page.locator("#field-phone select");
const phoneInput = (page: Page) => page.locator("#phone");

/** The form is a hydrated client component; wait until typing is handled by React (not the server-rendered markup). */
async function openFlightForm(page: Page) {
  await page.goto("/flights");
  await dismissCookieBanner(page);
  await page.locator(".PhoneInput").first().waitFor({ timeout: 30000 }); // the rich phone field has loaded its chunks: the form is interactive
}

async function chooseAirport(page: Page, field: ReturnType<typeof fromField>, query: string, iata: string) {
  await field.click();
  await field.fill(query);
  const option = page.getByRole("option").filter({ hasText: iata }).first();
  await option.waitFor({ timeout: 30000 });
  await option.click();
}

test.describe("departure airport suggestion (approximate, server-derived)", () => {
  test("the suggestion fills the empty From field and is labelled as a suggestion", async ({ page }) => {
    await mockHint(page, { countryCode: "DE", airport: FRANKFURT });
    await openFlightForm(page);
    await expect(fromField(page)).toHaveValue("Frankfurt am Main (FRA)");
    await expect(suggestedTag(page)).toBeVisible();
    await expect(toField(page)).toHaveValue(""); // only the departure is suggested
    // Screen readers: the field is described as a suggestion that can be changed.
    await expect(page.locator("#origin-suggestion-note")).toHaveText("Suggested from your approximate location. You can change it.");
    await expect(fromField(page)).toHaveAttribute("aria-describedby", /origin-suggestion-note/);
  });

  test("choosing another airport replaces it, removes the label, and nothing puts the suggestion back", async ({ page }) => {
    await mockHint(page, { countryCode: "DE", airport: FRANKFURT });
    await openFlightForm(page);
    await expect(fromField(page)).toHaveValue("Frankfurt am Main (FRA)");
    await chooseAirport(page, fromField(page), "Munich", "MUC");
    await expect(fromField(page)).toHaveValue("Munich (MUC)");
    await expect(suggestedTag(page)).toHaveCount(0);
    await page.waitForTimeout(500);
    await expect(fromField(page)).toHaveValue("Munich (MUC)");
  });

  test("a choice made BEFORE the answer arrives is kept: the late suggestion is ignored", async ({ page }) => {
    await mockHint(page, { countryCode: "DE", airport: FRANKFURT }, 2500);
    await openFlightForm(page);
    await chooseAirport(page, fromField(page), "Munich", "MUC");
    await expect(fromField(page)).toHaveValue("Munich (MUC)");
    await page.waitForTimeout(3500); // the delayed answer has now arrived
    await expect(fromField(page)).toHaveValue("Munich (MUC)");
    await expect(suggestedTag(page)).toHaveCount(0);
  });

  test("editing the text away from the suggestion drops it - the form never submits an airport it is not showing", async ({ page }) => {
    await mockHint(page, { countryCode: "DE", airport: FRANKFURT });
    await openFlightForm(page);
    await expect(fromField(page)).toHaveValue("Frankfurt am Main (FRA)");
    await fromField(page).fill("");
    await expect(suggestedTag(page)).toHaveCount(0);
    await expect(fromField(page)).toHaveValue("");
    await page.locator("form:has(#phone) button[type=submit]").click();
    await expect(page.getByText("Select an origin")).toBeVisible(); // not silently submitted as Frankfurt
  });

  test("typing the suggestion back exactly re-selects it", async ({ page }) => {
    await mockHint(page, { countryCode: "DE", airport: FRANKFURT });
    await openFlightForm(page);
    await expect(fromField(page)).toHaveValue("Frankfurt am Main (FRA)");
    await fromField(page).fill("Frankfurt am Main (FR");
    await fromField(page).fill("Frankfurt am Main (FRA)");
    await page.locator("form:has(#phone) button[type=submit]").click();
    await expect(page.getByText("Select an origin")).toHaveCount(0);
  });

  test("a suggestion equal to the destination is not placed (never depart from where the visitor wants to go)", async ({ page }) => {
    // The answer is held back until the visitor has chosen Frankfurt as the destination (ordering, not a clock: a slow machine cannot reorder it).
    let release!: () => void;
    const destinationChosen = new Promise<void>((resolve) => (release = resolve));
    await mockHint(page, { countryCode: "DE", airport: FRANKFURT }, destinationChosen);
    await openFlightForm(page);
    await chooseAirport(page, toField(page), "Frankfurt", "FRA");
    const answered = page.waitForResponse("**/api/visitor-hint");
    release();
    await answered;
    await page.waitForTimeout(1000); // let the form act on the answer before asserting that it did not place it
    await expect(fromField(page)).toHaveValue("");
    await expect(suggestedTag(page)).toHaveCount(0);
  });

  test("no answer content, an HTTP error, or a dropped request all leave the normal empty form", async ({ page }) => {
    const answers: (Hint | { status: number })[] = [{}, { status: 500 }];
    for (const body of answers) {
      await page.unroute("**/api/visitor-hint").catch(() => undefined);
      await mockHint(page, body);
      await openFlightForm(page);
      await page.waitForTimeout(1500);
      await expect(fromField(page)).toHaveValue("");
      await expect(suggestedTag(page)).toHaveCount(0);
    }
    await page.unroute("**/api/visitor-hint");
    await page.route("**/api/visitor-hint", (route) => route.abort());
    await openFlightForm(page);
    await page.waitForTimeout(1500);
    await expect(fromField(page)).toHaveValue("");
  });

  test("a malformed answer is sanitised, not trusted", async ({ page }) => {
    await page.route("**/api/visitor-hint", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ countryCode: "<img src=x>", airport: { iata: "<script>", city: "x".repeat(500), name: 7, country: null } }) }),
    );
    await openFlightForm(page);
    await page.waitForTimeout(1500);
    await expect(fromField(page)).toHaveValue("");
    await expect(phoneCountry(page)).toHaveValue("ZZ"); // "International": no country from a junk code
  });

  test("markup inside an otherwise well-formed answer is shown as text, never parsed: no element is created and nothing runs", async ({ page }) => {
    const markup = "<img src=x onerror=\"window.__injected=1\"><b id=injected>";
    await page.route("**/api/visitor-hint", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ countryCode: "DE", airport: { iata: "FRA", city: `Frankfurt ${markup}`, name: `Frankfurt Main ${markup}`, country: `Germany ${markup}` } }) }),
    );
    await openFlightForm(page);
    await expect(suggestedTag(page)).toBeVisible();
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => (window as unknown as { __injected?: number }).__injected)).toBeUndefined();
    await expect(page.locator("#injected")).toHaveCount(0);
    expect(await page.locator("form img[src='x']").count()).toBe(0);
    // The text is there, literally (React escaped it), so the visitor can see and replace it like any other value.
    expect(await fromField(page).inputValue()).toContain("<img");
  });

  test("the suggestion does not move the layout: the From, To and date fields stay level at every width, and nothing overflows sideways", async ({ page }) => {
    await mockHint(page, { countryCode: "DE", airport: FRANKFURT }, 800);
    await openFlightForm(page);
    const before = await toField(page).boundingBox();
    const fromBefore = await fromField(page).boundingBox();
    await expect(fromField(page)).toHaveValue("Frankfurt am Main (FRA)");
    const after = await toField(page).boundingBox();
    const fromAfter = await fromField(page).boundingBox();
    expect(after!.y).toBeCloseTo(before!.y, 0);
    expect(fromAfter!.y).toBeCloseTo(fromBefore!.y, 0);
    expect(fromAfter!.height).toBeCloseTo(fromBefore!.height, 0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("phone country code suggestion", () => {
  test("the suggested country is pre-selected and its calling code shown; the visitor can change it", async ({ page }) => {
    await mockHint(page, { countryCode: "DE" });
    await openFlightForm(page);
    await expect(phoneCountry(page)).toHaveValue("DE");
    await expect(phoneInput(page)).toHaveValue(/^\+49/);
    await phoneCountry(page).selectOption("GB");
    await expect(phoneCountry(page)).toHaveValue("GB");
    await expect(phoneInput(page)).toHaveValue(/^\+44/);
  });

  test("with no country known the field is neutral: no country, and no United States assumed", async ({ page }) => {
    await mockHint(page, {});
    await openFlightForm(page);
    await page.waitForTimeout(1200);
    await expect(phoneCountry(page)).toHaveValue("ZZ"); // the library's "International" entry: no country chosen
    await expect(phoneInput(page)).not.toHaveValue(/^\+1/);
  });

  test("a country picked by the visitor before the answer arrives is kept", async ({ page }) => {
    await mockHint(page, { countryCode: "DE" }, 2500);
    await openFlightForm(page);
    await phoneCountry(page).selectOption("FR");
    await page.waitForTimeout(3500);
    await expect(phoneCountry(page)).toHaveValue("FR");
  });

  test("a number the visitor started typing is not touched by a late suggestion", async ({ page }) => {
    await mockHint(page, { countryCode: "DE" }, 2500);
    await openFlightForm(page);
    await phoneInput(page).fill("+44 20 7946 0958");
    await page.waitForTimeout(3500);
    await expect(phoneCountry(page)).toHaveValue("GB");
    await expect(phoneInput(page)).toHaveValue(/^\+44 20 7946 0958$/);
  });

  test("a full international number is accepted as typed, with the prefix once", async ({ page }) => {
    await mockHint(page, { countryCode: "DE" });
    await openFlightForm(page);
    await expect(phoneInput(page)).toHaveValue(/^\+49/);
    await phoneInput(page).fill("+49 30 123456");
    const text = await phoneInput(page).inputValue();
    expect(text.match(/\+49/g)).toHaveLength(1);
    expect(text.replace(/\D/g, "")).toBe("4930123456"); // no digit dropped or added
  });

  test("changing the country after typing never leaves the old digits under the new code: the field resets, the visitor is told, and can restore the number", async ({ page }) => {
    await mockHint(page, { countryCode: "DE" });
    await openFlightForm(page);
    await phoneInput(page).fill("+49 30 123456");
    await expect(page.locator("#phone-country-notice")).toHaveCount(0);
    await phoneCountry(page).selectOption("FR");
    await expect(phoneCountry(page)).toHaveValue("FR");
    // The same digits under +33 would be a different (and not necessarily invalid) number, so they are not carried over...
    await expect(phoneInput(page)).toHaveValue("+33");
    // ... and that is said out loud (not silent), with a way back.
    const notice = page.locator("#phone-country-notice");
    await expect(notice).toContainText("Country changed to France");
    await expect(notice).toContainText("cleared");
    await notice.getByRole("button", { name: "Restore it" }).click();
    await expect(phoneCountry(page)).toHaveValue("DE");
    await expect(phoneInput(page)).toHaveValue("+49 30 123456");
    await expect(notice).toHaveCount(0);
  });

  test("changing the country on an empty field says nothing; typing after a country change dismisses the notice", async ({ page }) => {
    await mockHint(page, { countryCode: "DE" });
    await openFlightForm(page);
    await phoneCountry(page).selectOption("GB");
    await expect(page.locator("#phone-country-notice")).toHaveCount(0);
    await phoneInput(page).fill("+49 30 123456");
    await phoneCountry(page).selectOption("US");
    await expect(page.locator("#phone-country-notice")).toHaveCount(1);
    await phoneInput(page).fill("+1 415 570 9267");
    await expect(page.locator("#phone-country-notice")).toHaveCount(0);
  });
});

test.describe("the device's own location (explicit permission only)", () => {
  test("permission already granted: used silently, outranks the approximate answer, and is labelled as a suggestion", async ({ browser }) => {
    const context = await browser.newContext({ permissions: ["geolocation"], geolocation: { latitude: 48.14, longitude: 11.58 } });
    const page = await context.newPage();
    await mockHint(page, { countryCode: "DE", airport: FRANKFURT });
    await openFlightForm(page);
    await expect(fromField(page)).toHaveValue("Munich (MUC)");
    await expect(page.locator("#origin-suggestion-note")).toHaveText("Suggested from your device's location. You can change it.");
    await page.waitForTimeout(800);
    await expect(fromField(page)).toHaveValue("Munich (MUC)"); // the (later or earlier) network estimate never replaces it
    await context.close();
  });

  test("permission granted but the visitor already chose an airport: the automatic result does not overwrite it", async ({ browser }) => {
    const context = await browser.newContext({ permissions: ["geolocation"], geolocation: { latitude: 48.14, longitude: 11.58 } });
    const page = await context.newPage();
    // Hold the device's answer until the visitor has made their choice (an ordering, not a clock: a slow machine cannot reorder it), then release it.
    await page.addInitScript(() => {
      const original = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
      const w = window as unknown as { __releaseDevice: () => void };
      const gate = new Promise<void>((resolve) => (w.__releaseDevice = resolve));
      navigator.geolocation.getCurrentPosition = (ok, err, options) => {
        void gate.then(() => original(ok, err, options));
      };
    });
    await mockHint(page, {});
    await openFlightForm(page);
    await chooseAirport(page, fromField(page), "London Heathrow", "LHR");
    await expect(fromField(page)).toHaveValue("London (LHR)");
    await page.evaluate(() => (window as unknown as { __releaseDevice: () => void }).__releaseDevice());
    await page.waitForTimeout(1500); // the device answer arrives and is handled in this time
    await expect(fromField(page)).toHaveValue("London (LHR)");
    await context.close();
  });

  test("never asked on load: with the permission at 'prompt' nothing is requested until the visitor clicks, then exactly once", async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __geoCalls: number }).__geoCalls = 0;
      Object.defineProperty(navigator, "permissions", { value: { query: async () => ({ state: "prompt" }) }, configurable: true });
      navigator.geolocation.getCurrentPosition = (ok) => {
        (window as unknown as { __geoCalls: number }).__geoCalls++;
        setTimeout(() => ok({ coords: { latitude: 48.14, longitude: 11.58, accuracy: 50 } } as GeolocationPosition), 50);
      };
    });
    await mockHint(page, {});
    await openFlightForm(page);
    await page.waitForTimeout(1200);
    expect(await page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls)).toBe(0);
    await expect(fromField(page)).toHaveValue("");
    await page.getByRole("button", { name: "Use my current location to suggest a departure airport" }).click();
    await expect(fromField(page)).toHaveValue("Munich (MUC)");
    await expect(suggestedTag(page)).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls)).toBe(1);
  });

  test("an explicit click replaces an airport the visitor chose earlier (they asked for it); automatic paths never would", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "permissions", { value: { query: async () => ({ state: "prompt" }) }, configurable: true });
      navigator.geolocation.getCurrentPosition = (ok) => ok({ coords: { latitude: 48.14, longitude: 11.58, accuracy: 50 } } as GeolocationPosition);
    });
    await mockHint(page, {});
    await openFlightForm(page);
    await chooseAirport(page, fromField(page), "London Heathrow", "LHR");
    await page.getByRole("button", { name: "Use my current location to suggest a departure airport" }).click();
    await expect(fromField(page)).toHaveValue("Munich (MUC)");
  });

  test("refused: a plain message and the button disappears; the browser (not this site) remembers the refusal, so a reload does not ask again, and nothing is stored", async ({ page }) => {
    // A tiny model of what a real browser does: it remembers the refusal and reports it through the Permissions API on later page loads.
    let browserRemembersDenial = false;
    let calls = 0;
    await page.exposeFunction("__browserDenied", () => browserRemembersDenial);
    await page.exposeFunction("__recordDenial", () => {
      browserRemembersDenial = true;
      calls++;
    });
    await page.addInitScript(() => {
      const w = window as unknown as { __browserDenied: () => Promise<boolean>; __recordDenial: () => void };
      Object.defineProperty(navigator, "permissions", { value: { query: async () => ({ state: (await w.__browserDenied()) ? "denied" : "prompt" }) }, configurable: true });
      navigator.geolocation.getCurrentPosition = (_ok, err) => {
        w.__recordDenial();
        err?.({ code: 1, message: "denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
      };
    });
    await mockHint(page, {});
    await openFlightForm(page);
    const button = page.getByRole("button", { name: "Use my current location to suggest a departure airport" });
    await button.click();
    await expect(page.locator("#origin-suggestion-note")).toHaveText("Location access is off. Please type your departure city.");
    await expect(button).toHaveCount(0);
    await expect(fromField(page)).toHaveValue(""); // the form is just the normal empty form
    await page.reload();
    await page.locator(".PhoneInput").first().waitFor({ timeout: 30000 });
    await expect(page.locator("#origin-suggestion-note")).toHaveText("Location access is off. Please type your departure city.");
    await expect(button).toHaveCount(0);
    expect(calls).toBe(1); // asked once, never again
    // This site stores nothing about the refusal: no session or local storage entry mentions location, and the site sets no cookie at all.
    const stored = await page.evaluate(() => ({ session: Object.keys(sessionStorage), local: Object.keys(localStorage), cookie: document.cookie }));
    expect(stored.session).toEqual([]);
    expect(stored.local.filter((k) => /geo|location/i.test(k))).toEqual([]);
    expect(stored.cookie).toBe("");
  });

  test("timeout and unavailable positions: a message, and the visitor may try again", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "permissions", { value: { query: async () => ({ state: "prompt" }) }, configurable: true });
      let n = 0;
      navigator.geolocation.getCurrentPosition = (_ok, err) => {
        n++;
        err?.({ code: n === 1 ? 3 : 2, message: "x", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
      };
    });
    await mockHint(page, {});
    await openFlightForm(page);
    const button = page.getByRole("button", { name: "Use my current location to suggest a departure airport" });
    await button.click();
    await expect(page.locator("#origin-suggestion-note")).toHaveText("We couldn't get your location. Please type your departure city.");
    await expect(button).toHaveCount(1); // not a refusal: asking again is allowed
    await button.click();
    await expect(page.locator("#origin-suggestion-note")).toHaveText("We couldn't get your location. Please type your departure city.");
  });

  test("a position far from any major airport: no suggestion, an honest message", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "permissions", { value: { query: async () => ({ state: "prompt" }) }, configurable: true });
      navigator.geolocation.getCurrentPosition = (ok) => ok({ coords: { latitude: -30, longitude: -130, accuracy: 50 } } as GeolocationPosition);
    });
    await mockHint(page, {});
    await openFlightForm(page);
    await page.getByRole("button", { name: "Use my current location to suggest a departure airport" }).click();
    await expect(page.locator("#origin-suggestion-note")).toHaveText("No major airport found near you. Please type your departure city.");
    await expect(fromField(page)).toHaveValue("");
  });

  test("the device's coordinates never leave the browser: no request carries them", async ({ page }) => {
    const urls: string[] = [];
    const bodies: string[] = [];
    page.on("request", (request) => {
      urls.push(request.url());
      const body = request.postData();
      if (body) bodies.push(body);
    });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "permissions", { value: { query: async () => ({ state: "prompt" }) }, configurable: true });
      navigator.geolocation.getCurrentPosition = (ok) => ok({ coords: { latitude: 48.1351, longitude: 11.5820, accuracy: 50 } } as GeolocationPosition);
    });
    await mockHint(page, {});
    await openFlightForm(page);
    await page.getByRole("button", { name: "Use my current location to suggest a departure airport" }).click();
    await expect(fromField(page)).toHaveValue("Munich (MUC)");
    for (const text of [...urls, ...bodies]) expect(text).not.toMatch(/48\.13|11\.58/);
  });
});

test.describe("the contact form uses the country suggestion too", () => {
  test("the phone field starts on the suggested country; the visitor can change it", async ({ page }) => {
    await mockHint(page, { countryCode: "GB", airport: FRANKFURT });
    await page.goto("/contact");
    await dismissCookieBanner(page);
    await page.locator(".PhoneInput").first().waitFor({ timeout: 30000 });
    const select = page.locator("#field-phone select");
    await expect(select).toHaveValue("GB");
    await select.selectOption("US");
    await expect(select).toHaveValue("US");
  });
});

test.describe("accessibility of the new states", () => {
  test("no WCAG 2.2 A/AA violation in the form with a suggestion, a country notice and validation messages showing", async ({ page }) => {
    await mockHint(page, { countryCode: "DE", airport: FRANKFURT });
    await openFlightForm(page);
    await expect(suggestedTag(page)).toBeVisible();
    // Put the form into every new state at once: a suggestion, a country-change notice, an email error and a phone error.
    await phoneInput(page).fill("+49 30 123456");
    await phoneCountry(page).selectOption("FR");
    await expect(page.locator("#phone-country-notice")).toBeVisible();
    await page.locator("#email").fill("jane@example");
    await page.locator("#firstName").focus();
    await expect(page.locator("#email-error")).toBeVisible();
    const results = await new AxeBuilder({ page }).include("form:has(#phone)").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  });

  test("the suggestion controls are reachable and operable by keyboard, with names a screen reader can use", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "permissions", { value: { query: async () => ({ state: "prompt" }) }, configurable: true });
      navigator.geolocation.getCurrentPosition = (ok) => ok({ coords: { latitude: 48.14, longitude: 11.58, accuracy: 50 } } as GeolocationPosition);
    });
    await mockHint(page, {});
    await openFlightForm(page);
    const button = page.getByRole("button", { name: "Use my current location to suggest a departure airport" });
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(24); // WCAG 2.2 target size (minimum)
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(fromField(page)).toHaveValue("Munich (MUC)");
    await expect(page.locator("#origin-suggestion-note")).toHaveAttribute("role", "status");
  });
});

test.describe("no hydration or console errors with the new behaviour", () => {
  // Pages are prerendered at build time, so anything that depends on today's date or the visitor must not be in the server-rendered markup (it would
  // differ on hydration). React reports such a mismatch as a console error.
  for (const url of ["/", "/flights", "/contact", "/destinations/europe/france/paris"]) {
    test(`${url}: loads, shows a suggestion, opens a calendar - no console error, no page error`, async ({ page }) => {
      const problems: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") problems.push(`console: ${message.text()}`);
      });
      page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
      await mockHint(page, { countryCode: "DE", airport: FRANKFURT });
      await page.goto(url);
      await dismissCookieBanner(page);
      // Pages without a phone field (a destination page has only the newsletter form) have nothing to wait for.
      if (await page.locator("#phone, #c-phone").count()) await page.locator(".PhoneInput").first().waitFor({ timeout: 30000 });
      await page.waitForTimeout(1500);
      const departure = page.getByRole("button", { name: /^Departure Date/ });
      if (await departure.count()) {
        await departure.first().click();
        await expect(page.getByText(/Flights can be requested until/)).toBeVisible();
      }
      expect(problems).toEqual([]);
    });
  }
});

test("a failed submit focuses the departure INPUT even though the label row now holds a 'Use my location' button before it", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "permissions", { value: { query: async () => ({ state: "prompt" }) }, configurable: true });
  });
  await mockHint(page, {});
  await openFlightForm(page);
  await expect(page.getByRole("button", { name: "Use my current location to suggest a departure airport" })).toBeVisible();
  await page.locator("form:has(#phone) button[type=submit]").click();
  await expect(page.locator('[id="field-segments.0.from"] input')).toBeFocused();
});
