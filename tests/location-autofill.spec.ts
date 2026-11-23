import { test, expect, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// The departure airport from the DEVICE's location, and the phone country suggestion (src/hooks/useDeviceAirport.ts, useVisitorHint.ts, FlightRequestForm.tsx,
// PhoneNumberField.tsx).
//
// What the visitor sees: on /flights the browser asks for permission to use their location as soon as the form opens (on the home page, on their first use of the
// form); if they allow it the nearest MAJOR airport fills the empty From field, labelled "Suggested". If they decline, or the position cannot be had, nothing is
// suggested and nothing is said. There is no "Use my location" button. The network-derived airport of the earlier design is gone: the server's hint is a country
// code and nothing else.
//
// The browser's Geolocation API is replaced here by a scripted one (installGeo), so every case is deterministic, no real location is involved and the browser's own
// permission prompt (which a test cannot press) is modelled: `permission` is what navigator.permissions reports, `result` is what getCurrentPosition does. One test
// at the end uses the browser's REAL geolocation emulation (a granted permission and a set position) to prove the unscripted path.

const FRANKFURT = { iata: "FRA", city: "Frankfurt am Main", name: "Frankfurt Main Airport", country: "Germany" };
const MUNICH = { latitude: 48.14, longitude: 11.58 };

async function dismissCookieBanner(page: Page) {
  const reject = page.getByRole("button", { name: /Reject Non-Essential/i });
  if (await reject.isVisible().catch(() => false)) await reject.click();
}

type Hint = { countryCode?: string };
// `delay` is either milliseconds or a promise the answer waits for (a promise makes an ordering test independent of how fast the machine is).
async function mockHint(page: Page, body: Hint | Record<string, unknown> | { status: number }, delay: number | Promise<unknown> = 0) {
  await page.route("**/api/visitor-hint", async (route: Route) => {
    if (typeof delay === "number") {
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    } else {
      await delay;
    }
    if ("status" in body && typeof body.status === "number") await route.fulfill({ status: body.status, body: "boom" });
    else await route.fulfill({ status: 200, contentType: "application/json", headers: { "cache-control": "private, no-store" }, body: JSON.stringify(body) });
  });
}

type GeoPlan = {
  /** What navigator.permissions.query reports; "none" = the Permissions API does not exist (older browsers). Default "prompt". */
  permission?: "granted" | "prompt" | "denied" | "none";
  /** What getCurrentPosition does once the browser has decided. Default "position". */
  result?: "position" | "denied" | "unavailable" | "timeout";
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  /** Answer only after release() (an ordering, not a clock). */
  hold?: boolean;
  /** Model a browser that remembers a refusal: after one, the Permissions API says "denied" (also after a reload). */
  remembers?: boolean;
  /** No geolocation API at all. */
  unsupported?: boolean;
};

async function installGeo(page: Page, plan: GeoPlan = {}) {
  const log: string[] = [];
  let refused = false;
  await page.exposeFunction("__geoLog", (what: string) => {
    log.push(what);
    if (what === "refused") refused = true;
  });
  await page.exposeFunction("__geoRefused", () => refused);
  await page.addInitScript((p) => {
    const w = window as unknown as { __geoLog: (s: string) => void; __geoRefused: () => Promise<boolean>; __releaseGeo: () => void };
    if (p.unsupported) {
      Object.defineProperty(navigator, "geolocation", { value: undefined, configurable: true });
      return;
    }
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    w.__releaseGeo = () => release();
    const permission = p.permission ?? "prompt";
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value:
        permission === "none"
          ? undefined
          : {
              query: async () => {
                w.__geoLog("query");
                const state = p.remembers && (await w.__geoRefused()) ? "denied" : permission;
                return { state };
              },
            },
    });
    navigator.geolocation.getCurrentPosition = (ok, err) => {
      w.__geoLog("call");
      setTimeout(async () => {
        if (p.hold) await gate;
        const result = p.result ?? "position";
        if (result === "position") {
          ok({ coords: { latitude: p.latitude ?? 48.14, longitude: p.longitude ?? 11.58, accuracy: p.accuracy ?? 50 } } as GeolocationPosition);
          return;
        }
        if (result === "denied") w.__geoLog("refused");
        err?.({ code: result === "denied" ? 1 : result === "unavailable" ? 2 : 3, message: "x", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
      }, 30);
    };
  }, plan);
  return {
    /** How many times the page asked the browser for a position (each one is a prompt the visitor could see). */
    calls: () => log.filter((x) => x === "call").length,
    release: () => page.evaluate(() => (window as unknown as { __releaseGeo?: () => void }).__releaseGeo?.()),
  };
}

const fromField = (page: Page) => page.getByRole("combobox", { name: /Flight 1 — From/ });
const toField = (page: Page) => page.getByRole("combobox", { name: "To", exact: true });
const suggestedTag = (page: Page) => page.getByText("Suggested", { exact: true });
const spokenNote = (page: Page) => page.locator("#origin-suggestion-note");
const phoneCountry = (page: Page) => page.locator("#field-phone select");
const phoneInput = (page: Page) => page.locator("#phone");

/** The form is a hydrated client component; wait until typing is handled by React (not the server-rendered markup). */
async function openPage(page: Page, path: string) {
  await page.goto(path);
  await dismissCookieBanner(page);
  await page.locator(".PhoneInput").first().waitFor({ timeout: 30000 }); // the rich phone field has loaded its chunks: the form is interactive
}
const openFlightForm = (page: Page) => openPage(page, "/flights");

async function chooseAirport(page: Page, field: ReturnType<typeof fromField>, query: string, iata: string) {
  await field.click();
  await field.fill(query);
  const option = page.getByRole("option").filter({ hasText: iata }).first();
  await option.waitFor({ timeout: 30000 });
  await option.click();
}

/** Nothing of the removed control is left anywhere on the page. */
async function expectNoLocateControl(page: Page) {
  await expect(page.getByRole("button", { name: /use my (current )?location/i })).toHaveCount(0);
  await expect(page.getByText(/use my (current )?location|Locating…|Location unavailable|Location access is off/i)).toHaveCount(0);
}

test.describe("the permission is allowed: the nearest major airport fills From", () => {
  test("the browser is asked once when /flights opens; the airport fills the empty field, labelled and announced; there is no button", async ({ page }) => {
    const geo = await installGeo(page, { permission: "prompt", ...MUNICH });
    await mockHint(page, { countryCode: "DE" });
    await openFlightForm(page);
    await expect(fromField(page)).toHaveValue("Munich (MUC)"); // the existing airport-field format: "City (IATA)"
    await expect(suggestedTag(page)).toBeVisible();
    await expect(toField(page)).toHaveValue(""); // only the departure is suggested
    await expect(spokenNote(page)).toHaveText("Departure airport set to Munich (MUC) from your device's location. You can change it.");
    await expect(spokenNote(page)).toHaveAttribute("role", "status");
    await expect(fromField(page)).toHaveAttribute("aria-describedby", /origin-suggestion-note/);
    expect(geo.calls()).toBe(1);
    await expectNoLocateControl(page);
  });

  test("a permission the visitor granted earlier is used silently (no second question)", async ({ page }) => {
    const geo = await installGeo(page, { permission: "granted", ...MUNICH });
    await mockHint(page, {});
    await openFlightForm(page);
    await expect(fromField(page)).toHaveValue("Munich (MUC)");
    expect(geo.calls()).toBe(1);
  });

  test("the airport is a MAJOR one: a position beside a small airfield gets the big airport, not the airfield", async ({ page }) => {
    // Egelsbach (EDFE) is a general-aviation field 10 km south of Frankfurt; the nearest major airport is Frankfurt.
    await installGeo(page, { latitude: 49.9594, longitude: 8.6431 });
    await mockHint(page, {});
    await openFlightForm(page);
    await expect(fromField(page)).toHaveValue("Frankfurt am Main (FRA)");
  });

  test("the airport really is one the form supports: it submits as an ordinary selected airport (no 'Select an origin')", async ({ page }) => {
    await installGeo(page, MUNICH);
    await mockHint(page, {});
    await openFlightForm(page);
    await expect(fromField(page)).toHaveValue("Munich (MUC)");
    await page.locator("form:has(#phone) button[type=submit]").click();
    await expect(page.getByText("Select an origin")).toHaveCount(0);
    await expect(page.getByText("Select a destination")).toBeVisible(); // the rest of the form still validates
  });

  test("the real browser geolocation path (not scripted): a granted permission and a set position fill the field", async ({ browser }) => {
    const context = await browser.newContext({ permissions: ["geolocation"], geolocation: MUNICH });
    const page = await context.newPage();
    await mockHint(page, {});
    await openFlightForm(page);
    await expect(fromField(page)).toHaveValue("Munich (MUC)");
    await context.close();
  });
});

test.describe("the permission is refused, or no position can be had: nothing is suggested and the form works as usual", () => {
  test("refused at the prompt: From stays empty, nothing is said, the browser is asked once - and not again after a reload", async ({ page }) => {
    const geo = await installGeo(page, { permission: "prompt", result: "denied", remembers: true });
    await mockHint(page, {});
    await openFlightForm(page);
    await page.waitForTimeout(800);
    await expect(fromField(page)).toHaveValue("");
    await expect(suggestedTag(page)).toHaveCount(0);
    await expect(spokenNote(page)).toHaveText("");
    expect(geo.calls()).toBe(1);
    await page.reload();
    await page.locator(".PhoneInput").first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(500);
    expect(geo.calls()).toBe(1); // the browser now reports "denied": the page does not ask again
    await expect(fromField(page)).toHaveValue("");
    // The visitor can still search and choose an airport by hand.
    await chooseAirport(page, fromField(page), "London Heathrow", "LHR");
    await expect(fromField(page)).toHaveValue("London (LHR)");
    await expectNoLocateControl(page);
    // This site stores nothing about the refusal or the location: no cookie, no session storage, no location-related local storage key.
    const stored = await page.evaluate(() => ({ session: Object.keys(sessionStorage), local: Object.keys(localStorage), cookie: document.cookie }));
    expect(stored.session).toEqual([]);
    expect(stored.local.filter((k) => /geo|loc|lat|lon|coord/i.test(k))).toEqual([]);
    expect(stored.cookie).toBe("");
  });

  test("already refused in the browser's settings: the browser is never asked, From stays empty", async ({ page }) => {
    const geo = await installGeo(page, { permission: "denied" });
    await mockHint(page, {});
    await openFlightForm(page);
    await page.waitForTimeout(800);
    expect(geo.calls()).toBe(0);
    await expect(fromField(page)).toHaveValue("");
    await expect(suggestedTag(page)).toHaveCount(0);
  });

  for (const result of ["unavailable", "timeout"] as const) {
    test(`position ${result}: no suggestion, no message, no error page; the visitor chooses by hand`, async ({ page }) => {
      const geo = await installGeo(page, { result });
      await mockHint(page, {});
      const problems: string[] = [];
      page.on("pageerror", (error) => problems.push(error.message));
      await openFlightForm(page);
      await page.waitForTimeout(800);
      await expect(fromField(page)).toHaveValue("");
      await expect(spokenNote(page)).toHaveText("");
      expect(geo.calls()).toBe(1);
      await chooseAirport(page, fromField(page), "Munich", "MUC");
      await expect(fromField(page)).toHaveValue("Munich (MUC)");
      expect(problems).toEqual([]);
    });
  }

  test("a browser without geolocation (or without the Permissions API) behaves like one that was refused: manual entry only, no error", async ({ page }) => {
    await installGeo(page, { unsupported: true });
    await mockHint(page, {});
    const problems: string[] = [];
    page.on("pageerror", (error) => problems.push(error.message));
    await openFlightForm(page);
    await page.waitForTimeout(500);
    await expect(fromField(page)).toHaveValue("");
    await chooseAirport(page, fromField(page), "Munich", "MUC");
    await expect(fromField(page)).toHaveValue("Munich (MUC)");
    expect(problems).toEqual([]);
  });

  test("no Permissions API: the position is requested directly, once, and still works", async ({ page }) => {
    const geo = await installGeo(page, { permission: "none", ...MUNICH });
    await mockHint(page, {});
    await openFlightForm(page);
    await expect(fromField(page)).toHaveValue("Munich (MUC)");
    expect(geo.calls()).toBe(1);
  });

  test("an imprecise position (hundreds of kilometres of uncertainty) is not used", async ({ page }) => {
    await installGeo(page, { ...MUNICH, accuracy: 500_000 });
    await mockHint(page, {});
    await openFlightForm(page);
    await page.waitForTimeout(800);
    await expect(fromField(page)).toHaveValue("");
    await expect(suggestedTag(page)).toHaveCount(0);
  });

  test("an invalid position is not used", async ({ page }) => {
    await installGeo(page, { latitude: 999, longitude: 999 });
    await mockHint(page, {});
    await openFlightForm(page);
    await page.waitForTimeout(800);
    await expect(fromField(page)).toHaveValue("");
  });

  test("a position far from any major airport: no suggestion, nothing said", async ({ page }) => {
    await installGeo(page, { latitude: -30, longitude: -130 });
    await mockHint(page, {});
    await openFlightForm(page);
    await page.waitForTimeout(800);
    await expect(fromField(page)).toHaveValue("");
    await expect(spokenNote(page)).toHaveText("");
  });
});

test.describe("the visitor's own choice always wins", () => {
  test("an airport chosen BEFORE the position arrives is kept: the late result is ignored", async ({ page }) => {
    const geo = await installGeo(page, { ...MUNICH, hold: true });
    await mockHint(page, {});
    await openFlightForm(page);
    await chooseAirport(page, fromField(page), "London Heathrow", "LHR");
    await expect(fromField(page)).toHaveValue("London (LHR)");
    await geo.release();
    await page.waitForTimeout(1500); // the position arrives and is handled in this time
    await expect(fromField(page)).toHaveValue("London (LHR)");
    await expect(suggestedTag(page)).toHaveCount(0);
  });

  test("text typed in From BEFORE the position arrives is kept: the late result neither fills nor overwrites it", async ({ page }) => {
    const geo = await installGeo(page, { ...MUNICH, hold: true });
    await mockHint(page, {});
    await openFlightForm(page);
    await fromField(page).fill("Lon");
    await geo.release();
    await page.waitForTimeout(1500);
    await expect(fromField(page)).toHaveValue("Lon");
    await expect(suggestedTag(page)).toHaveCount(0);
  });

  test("changing the suggested airport replaces it, removes the label, and nothing puts the suggestion back", async ({ page }) => {
    const geo = await installGeo(page, MUNICH);
    await mockHint(page, {});
    await openFlightForm(page);
    await expect(fromField(page)).toHaveValue("Munich (MUC)");
    await chooseAirport(page, fromField(page), "London Heathrow", "LHR");
    await expect(fromField(page)).toHaveValue("London (LHR)");
    await expect(suggestedTag(page)).toHaveCount(0);
    await page.waitForTimeout(600);
    await expect(fromField(page)).toHaveValue("London (LHR)");
    expect(geo.calls()).toBe(1);
  });

  test("editing the text away from the suggestion drops it - the form never submits an airport it is not showing", async ({ page }) => {
    await installGeo(page, MUNICH);
    await mockHint(page, {});
    await openFlightForm(page);
    await expect(fromField(page)).toHaveValue("Munich (MUC)");
    await fromField(page).fill("");
    await expect(suggestedTag(page)).toHaveCount(0);
    await expect(fromField(page)).toHaveValue("");
    await page.locator("form:has(#phone) button[type=submit]").click();
    await expect(page.getByText("Select an origin")).toBeVisible(); // not silently submitted as Munich
  });

  test("typing the suggestion back exactly re-selects it", async ({ page }) => {
    await installGeo(page, MUNICH);
    await mockHint(page, {});
    await openFlightForm(page);
    await expect(fromField(page)).toHaveValue("Munich (MUC)");
    await fromField(page).fill("Munich (MU");
    await fromField(page).fill("Munich (MUC)");
    await page.locator("form:has(#phone) button[type=submit]").click();
    await expect(page.getByText("Select an origin")).toHaveCount(0);
  });

  test("an airport equal to the chosen destination is not placed (never depart from where the visitor wants to go)", async ({ page }) => {
    const geo = await installGeo(page, { ...MUNICH, hold: true });
    await mockHint(page, {});
    await openFlightForm(page);
    await chooseAirport(page, toField(page), "Munich", "MUC");
    await geo.release();
    await page.waitForTimeout(1500);
    await expect(fromField(page)).toHaveValue("");
    await expect(suggestedTag(page)).toHaveCount(0);
  });
});

test.describe("when the browser is asked", () => {
  test("never more than once per page, however much the form re-renders", async ({ page }) => {
    const geo = await installGeo(page, MUNICH);
    await mockHint(page, {});
    await openFlightForm(page);
    await expect(fromField(page)).toHaveValue("Munich (MUC)");
    for (const name of ["One Way", "Multi-City", "Round Trip"]) await page.getByRole("button", { name, exact: true }).click();
    await page.locator("#firstName").fill("Ada");
    await phoneCountry(page).selectOption("FR");
    await page.waitForTimeout(500);
    expect(geo.calls()).toBe(1);
  });

  test("the home-page form does not ask on load: only on the visitor's first use of it, and then once", async ({ page }) => {
    const geo = await installGeo(page, { ...MUNICH, hold: true });
    await mockHint(page, {});
    await openPage(page, "/");
    await page.waitForTimeout(1500);
    expect(geo.calls()).toBe(0); // looking at the home page asks nothing
    await expect(fromField(page)).toHaveValue("");
    await fromField(page).click(); // the first use: the visitor focuses the From field
    await expect.poll(() => geo.calls()).toBe(1);
    await page.locator("#firstName").click();
    await toField(page).click();
    await page.waitForTimeout(300);
    expect(geo.calls()).toBe(1);
    // Focusing the field (which is what triggered the question) is not an edit: the answer still fills the still-empty field.
    await geo.release();
    await expect(fromField(page)).toHaveValue("Munich (MUC)");
    await expectNoLocateControl(page);
  });

  test("a refusal (or a dismissed prompt, which the browser reports the same way) is not followed by a second question when the visitor moves on to /flights", async ({ page }) => {
    // permission stays "prompt" (a dismissed prompt stores nothing in the browser), so only the page's own memory can stop the second question.
    const geo = await installGeo(page, { permission: "prompt", result: "denied" });
    await mockHint(page, {});
    await openPage(page, "/");
    await fromField(page).click(); // first use of the home form: the question
    await expect.poll(() => geo.calls()).toBe(1);
    await page.waitForTimeout(500);
    await page.locator('footer a[href="/flights"]').first().click(); // a client-side navigation: a new form mounts, with "open" behaviour
    await expect(page).toHaveURL(/\/flights$/);
    await page.locator(".PhoneInput").first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(1200);
    expect(geo.calls()).toBe(1); // not asked again
    await expect(fromField(page)).toHaveValue("");
    await chooseAirport(page, fromField(page), "Munich", "MUC");
    await expect(fromField(page)).toHaveValue("Munich (MUC)");
  });

  test("pages without the flight form (contact, a destination page, an article) never ask", async ({ page }) => {
    const geo = await installGeo(page, MUNICH);
    await mockHint(page, {});
    for (const path of ["/contact", "/destinations/europe/germany/munich", "/blog/business-class-vs-first-class", "/privacy-policy"]) {
      await page.goto(path);
      await dismissCookieBanner(page);
      await page.waitForTimeout(700);
    }
    expect(geo.calls()).toBe(0);
  });
});

test.describe("privacy: the position stays in the browser", () => {
  test("no request, URL, console line or storage entry carries the coordinates; only the chosen airport is part of the form", async ({ page }) => {
    const seen: string[] = [];
    page.on("request", (request) => {
      seen.push(request.url());
      const body = request.postData();
      if (body) seen.push(body);
    });
    page.on("console", (message) => seen.push(message.text()));
    await installGeo(page, { latitude: 48.1351, longitude: 11.582, accuracy: 50 });
    await mockHint(page, {});
    await openFlightForm(page);
    await expect(fromField(page)).toHaveValue("Munich (MUC)");
    for (const text of seen) expect(text).not.toMatch(/48\.13|11\.58|48,13|11,58/);
    expect(page.url()).not.toMatch(/48\.13|11\.58/);
    const html = await page.content();
    expect(html).not.toMatch(/48\.1351|11\.582/);
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + document.cookie);
    expect(stored).not.toMatch(/48\.13|11\.58|latitude|longitude/i);
  });

  test("an error from the browser is never shown to the visitor or written to the console", async ({ page }) => {
    const lines: string[] = [];
    page.on("console", (message) => lines.push(`${message.type()}: ${message.text()}`));
    await installGeo(page, { result: "unavailable" });
    await mockHint(page, {});
    await openFlightForm(page);
    await page.waitForTimeout(800);
    expect(lines.filter((l) => /geolocation|position|denied|x$/i.test(l))).toEqual([]);
    await expect(page.getByText(/geolocation|position unavailable|permission/i)).toHaveCount(0);
  });
});

test.describe("the removed control", () => {
  for (const path of ["/", "/flights"]) {
    test(`${path}: there is no "Use my location" button, text, tooltip or placeholder space`, async ({ page }) => {
      await installGeo(page, { permission: "prompt", hold: true });
      await mockHint(page, {});
      await openPage(page, path);
      await expectNoLocateControl(page);
      const html = await page.content();
      expect(html).not.toMatch(/use my (current )?location/i);
      // The From field itself (label row included) holds no button, no link and no map-pin icon (the footer and contact details have their own, elsewhere).
      const fromBlock = await page.locator('[id="field-segments.0.from"]').innerHTML();
      expect(fromBlock).not.toMatch(/<button|<a\s|lucide-map-pin/);
    });
  }
});

test.describe("the country suggestion for the phone field (the only thing the server hints)", () => {
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
    await expect(phoneInput(page)).toHaveValue("+33");
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

  test("the contact form uses the same suggestion: the phone field starts on the suggested country", async ({ page }) => {
    await mockHint(page, { countryCode: "GB" });
    await page.goto("/contact");
    await dismissCookieBanner(page);
    await page.locator(".PhoneInput").first().waitFor({ timeout: 30000 });
    const select = page.locator("#field-phone select");
    await expect(select).toHaveValue("GB");
    await select.selectOption("US");
    await expect(select).toHaveValue("US");
  });

  test("no answer content, an HTTP error, a dropped request or junk all leave the normal form; an airport in the answer (an old server) is ignored", async ({ page }) => {
    const answers: Array<Hint | Record<string, unknown> | { status: number }> = [{}, { status: 500 }, { countryCode: "DE", airport: FRANKFURT }];
    for (const body of answers) {
      await page.unroute("**/api/visitor-hint").catch(() => undefined);
      await mockHint(page, body);
      await openFlightForm(page);
      await page.waitForTimeout(1200);
      await expect(fromField(page)).toHaveValue(""); // the network never fills the departure airport
      await expect(suggestedTag(page)).toHaveCount(0);
    }
    await page.unroute("**/api/visitor-hint");
    await page.route("**/api/visitor-hint", (route) => route.abort());
    await openFlightForm(page);
    await page.waitForTimeout(1200);
    await expect(fromField(page)).toHaveValue("");
    await page.unroute("**/api/visitor-hint");
    await mockHint(page, { countryCode: "<img src=x>" });
    await openFlightForm(page);
    await page.waitForTimeout(1200);
    await expect(phoneCountry(page)).toHaveValue("ZZ"); // "International": no country from a junk code
  });
});

test.describe("layout and accessibility", () => {
  test("the position arriving does not move the form: the To field and the submit button stay put, and nothing overflows sideways", async ({ page }) => {
    const geo = await installGeo(page, { ...MUNICH, hold: true });
    await mockHint(page, {});
    await openFlightForm(page);
    const submit = page.locator("form:has(#phone) button[type=submit]");
    const before = { to: (await toField(page).boundingBox())!.y, from: (await fromField(page).boundingBox())!, submit: (await submit.boundingBox())!.y };
    await geo.release();
    await expect(fromField(page)).toHaveValue("Munich (MUC)");
    await expect(suggestedTag(page)).toBeVisible();
    await page.waitForTimeout(300);
    const after = { to: (await toField(page).boundingBox())!.y, from: (await fromField(page).boundingBox())!, submit: (await submit.boundingBox())!.y };
    expect(after.to).toBeCloseTo(before.to, 0);
    expect(after.from.y).toBeCloseTo(before.from.y, 0);
    expect(after.from.height).toBeCloseTo(before.from.height, 0);
    expect(after.submit).toBeCloseTo(before.submit, 0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });

  test("no WCAG 2.2 A/AA violation in the form with the suggestion, a country notice and validation messages showing", async ({ page }) => {
    await installGeo(page, MUNICH);
    await mockHint(page, { countryCode: "DE" });
    await openFlightForm(page);
    await expect(suggestedTag(page)).toBeVisible();
    await phoneInput(page).fill("+49 30 123456");
    await phoneCountry(page).selectOption("FR");
    await expect(page.locator("#phone-country-notice")).toBeVisible();
    await page.locator("#email").fill("jane@example");
    await page.locator("#firstName").focus();
    await expect(page.locator("#email-error")).toBeVisible();
    const results = await new AxeBuilder({ page }).include("form:has(#phone)").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  });

  test("a screen reader is told when the airport is filled in (a polite status that exists before it changes); keyboard use is unaffected", async ({ page }) => {
    const geo = await installGeo(page, { ...MUNICH, hold: true });
    await mockHint(page, {});
    await openFlightForm(page);
    const note = spokenNote(page);
    await expect(note).toHaveAttribute("role", "status"); // present and empty before anything changes, so the later text is announced
    await expect(note).toHaveText("");
    await fromField(page).focus();
    await page.keyboard.press("Tab"); // Tab leaves the field normally: no control was inserted between the label and the input
    await geo.release();
    await expect(note).toHaveText(/^Departure airport set to Munich \(MUC\) from your device's location/);
    // The label row holds only the (aria-hidden) tag and the status: nothing focusable.
    expect(await page.locator('[id="field-segments.0.from"] button, [id="field-segments.0.from"] a').count()).toBe(0);
  });

  test("a failed submit still focuses the departure INPUT when the position was refused", async ({ page }) => {
    await installGeo(page, { permission: "denied" });
    await mockHint(page, {});
    await openFlightForm(page);
    await page.locator("form:has(#phone) button[type=submit]").click();
    await expect(page.locator('[id="field-segments.0.from"] input')).toBeFocused();
  });
});

test.describe("no hydration or console errors with the new behaviour", () => {
  // Pages are prerendered at build time, so anything that depends on today's date or the visitor must not be in the server-rendered markup (it would
  // differ on hydration). React reports such a mismatch as a console error.
  for (const url of ["/", "/flights", "/contact", "/destinations/europe/france/paris"]) {
    test(`${url}: loads, takes the device airport, opens a calendar - no console error, no page error`, async ({ page }) => {
      const problems: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") problems.push(`console: ${message.text()}`);
      });
      page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
      await installGeo(page, MUNICH);
      await mockHint(page, { countryCode: "DE" });
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
