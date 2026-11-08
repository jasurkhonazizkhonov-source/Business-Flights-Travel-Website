import { test, expect, type Locator, type Page } from "@playwright/test";

// Round-trip date range: after a departure date is chosen, the RETURN calendar previews departure → return while the visitor hovers
// (mouse), moves focus (keyboard) or taps (touch: the first tap previews, the second tap — or the button — confirms), keeps the range
// once chosen, and can never offer a return date before the departure.
//
// Dates are picked by position in the calendar (the 5th of next month), never by a hard-coded date, so the spec does not age.

async function dismissCookieBanner(page: Page) {
  const reject = page.getByRole("button", { name: /Reject Non-Essential/i });
  if (await reject.isVisible().catch(() => false)) await reject.click();
}

function trigger(page: Page, label: "Departure Date" | "Return Date") {
  return page.getByRole("button", { name: new RegExp(`^${label}`) });
}
function calendar(page: Page, label: "Departure Date" | "Return Date") {
  return page.getByRole("dialog", { name: label });
}
// The calendar popovers are always mounted and toggled with `inert` + opacity, so Playwright sees them as "visible" even when closed.
async function expectOpen(dialog: Locator) {
  await expect(dialog).not.toHaveAttribute("inert", "");
}
async function expectClosed(dialog: Locator) {
  await expect(dialog).toHaveAttribute("inert", "");
}
function enabledDays(dialog: Locator) {
  return dialog.locator(".rdp-day_button:not([disabled])");
}

/** Opens the departure calendar, moves to next month and chooses the 5th (plenty of later days in the same month remain). */
async function chooseDeparture(page: Page, tap = false) {
  const click = (l: Locator) => (tap ? l.tap() : l.click());
  await click(trigger(page, "Departure Date"));
  const dialog = calendar(page, "Departure Date");
  await expectOpen(dialog);
  await expect(enabledDays(dialog).first()).toBeAttached(); // the calendar is a lazily loaded chunk
  await click(dialog.locator("button.rdp-button_next"));
  await click(enabledDays(dialog).nth(4));
  await expectClosed(dialog);
}

test.describe("round-trip date range — mouse and keyboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/flights");
    await dismissCookieBanner(page);
  });

  test("hovering a day previews departure → return, the preview follows the mouse, a click makes it permanent", async ({ page }) => {
    await chooseDeparture(page);
    await trigger(page, "Return Date").click();
    const dialog = calendar(page, "Return Date");
    await expectOpen(dialog);
    const days = enabledDays(dialog);

    // Nothing previewed before the pointer is over a day: the departure day alone is marked.
    await page.mouse.move(2, 2); // the popover may have opened under the pointer
    await expect(dialog.locator(".bfw-range-end")).toHaveCount(0);
    await expect(dialog.locator(".bfw-range-start")).toHaveCount(1);
    await expect(dialog.locator(".bfw-range-middle")).toHaveCount(0);

    await days.nth(6).hover();
    await expect(dialog.locator(".bfw-range-end")).toHaveCount(1);
    await expect(dialog.locator(".bfw-range-middle")).toHaveCount(5);
    await expect(dialog.getByText(/6 nights/)).toBeVisible();
    // The endpoint is the hovered day; the departure day is distinguished as the start.
    await expect(dialog.locator(".bfw-range-end .rdp-day_button")).toHaveText((await days.nth(6).textContent())!.trim());
    await expect(dialog.locator(".bfw-range-start")).toHaveCount(1);

    await days.nth(3).hover();
    await expect(dialog.locator(".bfw-range-middle")).toHaveCount(2);
    await expect(dialog.getByText(/3 nights/)).toBeVisible();
    // A preview is not a selection.
    await expect(trigger(page, "Return Date")).toContainText("Select date");

    await days.nth(9).click();
    await expectClosed(dialog);
    await expect(trigger(page, "Return Date")).not.toContainText("Select date");

    // The range stays selected when the calendar is reopened (no hover needed).
    await trigger(page, "Return Date").click();
    await expect(dialog.locator(".bfw-range-end")).toHaveCount(1);
    await expect(dialog.locator(".bfw-range-middle")).toHaveCount(8);
    await expect(dialog.locator(".bfw-range-start")).toHaveCount(1);
  });

  test("no return date before the departure can be chosen", async ({ page }) => {
    await chooseDeparture(page);
    await trigger(page, "Return Date").click();
    const dialog = calendar(page, "Return Date");
    // The 5th of the month was chosen: days 1–4 are shown but disabled.
    const disabled = dialog.locator(".rdp-day_button[disabled]");
    expect(await disabled.count()).toBeGreaterThanOrEqual(4);
    await page.mouse.move(2, 2); // the popover may have opened under the pointer
    await disabled.first().click({ force: true });
    await expect(trigger(page, "Return Date")).toContainText("Select date");
    await disabled.first().hover({ force: true });
    await expect(dialog.locator(".bfw-range-end")).toHaveCount(0);
  });

  test("keyboard: moving focus previews the range and Enter selects it", async ({ page }) => {
    await chooseDeparture(page);
    await trigger(page, "Return Date").click();
    const dialog = calendar(page, "Return Date");
    const days = enabledDays(dialog);
    await days.first().focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(dialog.locator(".bfw-range-end")).toHaveCount(1);
    await expect(dialog.getByText(/3 nights/)).toBeVisible();
    await page.keyboard.press("Enter");
    await expectClosed(dialog);
    await expect(trigger(page, "Return Date")).not.toContainText("Select date");
  });

  test("the chosen range is also shown when the departure calendar is reopened", async ({ page }) => {
    await chooseDeparture(page);
    await trigger(page, "Return Date").click();
    const ret = calendar(page, "Return Date");
    await enabledDays(ret).nth(7).click();
    await trigger(page, "Departure Date").click();
    const dep = calendar(page, "Departure Date");
    await expect(dep.locator(".bfw-range-start")).toHaveCount(1);
    await expect(dep.locator(".bfw-range-end")).toHaveCount(1);
    await expect(dep.locator(".bfw-range-middle")).toHaveCount(6);
  });

  test("moving the departure past a chosen return date clears the stale return date", async ({ page }) => {
    await chooseDeparture(page);
    await trigger(page, "Return Date").click();
    await enabledDays(calendar(page, "Return Date")).nth(5).click();
    await expect(trigger(page, "Return Date")).not.toContainText("Select date");

    await trigger(page, "Departure Date").click();
    const dep = calendar(page, "Departure Date");
    await enabledDays(dep).last().click();
    await expect(trigger(page, "Return Date")).toContainText("Select date");
  });

  test("one-way trips have no return calendar and no range", async ({ page }) => {
    await page.getByRole("button", { name: "One Way" }).click();
    await expect(page.getByRole("button", { name: /^Return Date/ })).toHaveCount(0);
  });
});

test.describe("round-trip date range — touch", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  // Hover does not exist on a touch screen, so this is the equivalent interaction; one viewport is enough.
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "Desktop Chrome", "touch behaviour is checked once");
  });

  test("first tap previews the range, a second tap on the same day (or the button) confirms it", async ({ page }) => {
    await page.goto("/flights");
    await dismissCookieBanner(page);
    await chooseDeparture(page, true);
    await trigger(page, "Return Date").tap();
    const dialog = calendar(page, "Return Date");
    await expectOpen(dialog);
    const days = enabledDays(dialog);

    await days.nth(6).tap();
    await expect(dialog.locator(".bfw-range-end")).toHaveCount(1);
    await expect(dialog.locator(".bfw-range-middle")).toHaveCount(5);
    await expect(dialog.getByText(/6 nights/)).toBeVisible();
    const confirm = dialog.getByRole("button", { name: /as return date/ });
    await expect(confirm).toBeVisible();
    await expect(trigger(page, "Return Date")).toContainText("Select date"); // previewed, not selected

    await days.nth(8).tap(); // another day moves the preview
    await expect(dialog.getByText(/8 nights/)).toBeVisible();
    await expect(trigger(page, "Return Date")).toContainText("Select date");

    await days.nth(8).tap(); // the same day again confirms
    await expectClosed(dialog);
    await expect(trigger(page, "Return Date")).not.toContainText("Select date");

    // Via the confirm button.
    await trigger(page, "Return Date").tap();
    await enabledDays(dialog).nth(4).tap();
    await dialog.getByRole("button", { name: /as return date/ }).tap();
    await expectClosed(dialog);
    await expect(trigger(page, "Return Date")).not.toContainText("Select date");
  });
});
