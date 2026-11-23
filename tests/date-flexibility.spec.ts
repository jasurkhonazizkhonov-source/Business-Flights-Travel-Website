import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// The FORM half of the date-flexibility tests (a real browser against the running site). The pure half (schema, mapping to the CRM body, e-mail) is
// tests/date-flexibility-logic.spec.ts; the whole path through a real server to a stand-in CRM is tests/date-flexibility-e2e.spec.ts.

// ---- the form ----------------------------------------------------------------------------------------------------------------------------------------------
async function openPreferences(page: Page) {
  await page.goto("/flights");
  await page.locator(".PhoneInput").first().waitFor({ timeout: 30_000 }); // hydrated
  const form = page.locator("form:has(#phone)");
  await form.getByRole("button", { name: /Add preferences/ }).click();
  const group = form.getByRole("group", { name: "Date flexibility" });
  await expect(group).toBeVisible();
  return { form, group };
}
const radio = (page: Page, days: number) => page.locator(`input[name="dateFlexibility"][value="${days}"]`);

test.describe("the form: one mutually exclusive choice inside the existing preferences section", () => {
  test("hidden until 'Add preferences' is opened; four choices, 'Exact dates' selected, no checkbox anywhere", async ({ page }) => {
    await page.goto("/flights");
    await page.locator(".PhoneInput").first().waitFor({ timeout: 30_000 });
    const form = page.locator("form:has(#phone)");
    await expect(form.getByRole("group", { name: "Date flexibility" })).toHaveCount(0);
    await form.getByRole("button", { name: /Add preferences/ }).click();
    const group = form.getByRole("group", { name: "Date flexibility" });
    await expect(group).toBeVisible();
    await expect(group.getByRole("radio")).toHaveCount(4);
    for (const label of ["Exact dates", "± 1 day", "± 2 days", "± 3 days"]) await expect(group.getByLabel(label, { exact: true })).toHaveCount(1);
    await expect(group.getByLabel("Exact dates", { exact: true })).toBeChecked();
    expect(await form.locator('input[type="checkbox"]').count()).toBe(0);
    // the section's other fields are all still there: one control for flexibility, none duplicated
    for (const id of ["preferredAirline", "budget", "budgetCurrency", "notes"]) await expect(form.locator(`#${id}`)).toBeVisible();
    expect(await form.locator('input[name="dateFlexibility"]').count()).toBe(4);
  });

  test("choosing one unchooses the others", async ({ page }) => {
    const { group } = await openPreferences(page);
    for (const [days, label] of [[2, "± 2 days"], [1, "± 1 day"], [3, "± 3 days"], [0, "Exact dates"]] as const) {
      await group.getByText(label, { exact: true }).click();
      for (const d of [0, 1, 2, 3]) {
        if (d === days) await expect(radio(page, d)).toBeChecked();
        else await expect(radio(page, d)).not.toBeChecked();
      }
    }
  });

  test("the choice survives closing and re-opening the section", async ({ page }) => {
    const { form, group } = await openPreferences(page);
    await group.getByText("± 3 days", { exact: true }).click();
    await form.getByRole("button", { name: "Hide additional preferences" }).click();
    await expect(form.getByRole("group", { name: "Date flexibility" })).toHaveCount(0);
    await form.getByRole("button", { name: /Add preferences/ }).click();
    await expect(form.getByRole("group", { name: "Date flexibility" }).getByLabel("± 3 days", { exact: true })).toBeChecked();
  });

  test("keyboard: the arrow keys move and select inside the group, and Tab leaves it", async ({ page }) => {
    const { group } = await openPreferences(page);
    await radio(page, 0).focus();
    await expect(radio(page, 0)).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(radio(page, 1)).toBeChecked();
    await expect(radio(page, 1)).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(radio(page, 2)).toBeChecked();
    await page.keyboard.press("ArrowLeft");
    await expect(radio(page, 1)).toBeChecked();
    // a visible focus indication on the focused choice's label (the input itself is visually hidden)
    const ring = await group.locator("label", { has: radio(page, 1) }).evaluate((el) => getComputedStyle(el).boxShadow);
    expect(ring).not.toBe("none");
    await page.keyboard.press("Tab");
    await expect(radio(page, 1)).not.toBeFocused();
  });

  test("no WCAG 2.2 A/AA violation with the preferences open and a choice selected (name, role, group label, contrast of the selected and unselected choices)", async ({ page }) => {
    const { group } = await openPreferences(page);
    await group.getByText("± 2 days", { exact: true }).click();
    await page.mouse.move(0, 0);
    await page.waitForTimeout(400); // the section's own 200 ms height/opacity transition must have finished before axe reads colours
    const results = await new AxeBuilder({ page }).include("form:has(#phone)").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  });

  test("every choice is a comfortable touch target and nothing overflows sideways", async ({ page }) => {
    const { group } = await openPreferences(page);
    for (const label of await group.locator("label").all()) {
      const box = (await label.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
});
