import { test, expect } from "@playwright/test";

// The flight form must not move when the device's position arrives and the departure airport is filled in. The "Suggested" tag appears in the From label row at
// that moment; this sweeps widths around every breakpoint of the form (sm 640, md 768, lg 1024) and asserts that the To field and the submit button stay exactly
// where they were, and that nothing overflows sideways. (Found by this test: between 640 and about 670 px the From column is too narrow for its label and the tag, so the label row wrapped and the form moved
// 16 px; the row now reserves two lines for 640-689 px. Before the "Use my location" button was removed the same happened between 640 and 800 px.) One project is enough: the spec sets its own widths.

const WIDTHS = [320, 375, 390, 480, 600, 639, 640, 641, 650, 660, 670, 680, 689, 690, 700, 740, 760, 767, 768, 769, 790, 800, 819, 820, 840, 900, 1000, 1023, 1024, 1025, 1280];

test("the device position arriving does not move the To field or the submit button at any width", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "Desktop Chrome", "this spec sets its own widths; once is enough");
  test.setTimeout(300_000); // 31 widths, each a full page load and hydration: the loop alone takes over two minutes
  // The scripted geolocation answers only when the test releases it, so the move (if there were one) happens after the first measurement.
  await page.addInitScript(() => {
    const w = window as unknown as { __release: () => void };
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    w.__release = () => release();
    Object.defineProperty(navigator, "permissions", { configurable: true, value: { query: async () => ({ state: "prompt" }) } });
    navigator.geolocation.getCurrentPosition = (ok) => {
      void gate.then(() => ok({ coords: { latitude: 48.14, longitude: 11.58, accuracy: 50 } } as GeolocationPosition));
    };
  });
  await page.route("**/api/visitor-hint", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  const moved: string[] = [];
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/flights");
    const to = page.getByRole("combobox", { name: "To", exact: true });
    const submit = page.locator("form:has(#phone) button[type=submit]");
    await expect(to).toBeVisible();
    await page.locator(".PhoneInput").first().waitFor({ timeout: 30_000 }); // hydrated: the form is interactive
    await page.waitForTimeout(300);
    const before = { to: (await to.boundingBox())!.y, submit: (await submit.boundingBox())!.y };
    await page.evaluate(() => (window as unknown as { __release: () => void }).__release());
    await expect(page.getByText("Suggested", { exact: true })).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(300);
    const after = { to: (await to.boundingBox())!.y, submit: (await submit.boundingBox())!.y };
    if (Math.abs(after.to - before.to) > 0.5 || Math.abs(after.submit - before.submit) > 0.5) moved.push(`${width}px: To ${before.to} -> ${after.to}, submit ${before.submit} -> ${after.submit}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${width}px overflow`).toBeLessThanOrEqual(0);
  }
  expect(moved).toEqual([]);
});
