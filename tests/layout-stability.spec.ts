import { test, expect } from "@playwright/test";

// The flight form must not move when the departure-airport suggestion arrives. Two things used to move it between about 640 and 800 px, where the From column
// is so narrow that the label row holds one or two lines depending on its contents: the "Use my location" helper button appearing (about 300 ms after load) and
// the button giving up its text when the suggestion is placed. The label row now reserves the two-line height for that range (AirportAutocomplete.tsx).
//
// This sweeps widths around every breakpoint of that form (sm 640, md 768, lg 1024) and the zone's edges, with the answer held back until the form is hydrated
// and the helper button is showing, so BOTH changes happen after the first measurement. One project is enough: the spec sets its own widths.

const WIDTHS = [320, 375, 390, 480, 600, 639, 640, 641, 700, 740, 760, 767, 768, 769, 790, 800, 819, 820, 840, 900, 1000, 1023, 1024, 1025, 1280];
const FRANKFURT = { iata: "FRA", city: "Frankfurt am Main", name: "Frankfurt Main Airport", country: "Germany" };

test("the suggestion arriving does not move the To field or the submit button at any width", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "Desktop Chrome", "this spec sets its own widths; once is enough");
  test.setTimeout(180_000);
  let release: () => void = () => undefined;
  let gate: Promise<void> = Promise.resolve();
  await page.route("**/api/visitor-hint", async (route) => {
    await gate;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ countryCode: "DE", airport: FRANKFURT }) });
  });
  const moved: string[] = [];
  for (const width of WIDTHS) {
    gate = new Promise<void>((resolve) => (release = resolve));
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/flights");
    const to = page.getByRole("combobox", { name: "To", exact: true });
    const submit = page.locator("form:has(#phone) button[type=submit]");
    await expect(to).toBeVisible();
    // Hydrated and settled: the helper button (which replaces an invisible placeholder once the browser's permission state is read) is on screen.
    await expect(page.getByRole("button", { name: /Use my current location/ })).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(300);
    const before = { to: (await to.boundingBox())!.y, submit: (await submit.boundingBox())!.y };
    release();
    await expect(page.getByText("Suggested", { exact: true })).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(300);
    const after = { to: (await to.boundingBox())!.y, submit: (await submit.boundingBox())!.y };
    if (Math.abs(after.to - before.to) > 0.5 || Math.abs(after.submit - before.submit) > 0.5) moved.push(`${width}px: To ${before.to} -> ${after.to}, submit ${before.submit} -> ${after.submit}`);
    // And nothing overflows sideways at that width.
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${width}px overflow`).toBeLessThanOrEqual(0);
  }
  expect(moved).toEqual([]);
});
