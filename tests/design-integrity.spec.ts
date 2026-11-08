import { test, expect } from "@playwright/test";

// Regression tests for the 2026-10-25 design pass. Each one pins a defect that was reproduced first (see
// docs/audit-2026-10-25/COMPREHENSIVE-WEBSITE-DESIGN-SEO-FOLLOWUP-REPORT.md), not a stylistic preference.

test.describe("design integrity", () => {
  test("Trustpilot links do not draw a row of filled stars (no rating has been verified) and say they open a new tab", async ({ page }) => {
    await page.goto("/");
    const links = page.locator('a[href^="https://www.trustpilot.com/"]');
    expect(await links.count()).toBeGreaterThanOrEqual(2); // the testimonials section and the footer
    for (let i = 0; i < (await links.count()); i++) {
      const link = links.nth(i);
      await expect(link.locator("svg.lucide-star")).toHaveCount(0);
      await expect(link).toContainText("opens in a new tab");
    }
  });

  test("cookie banner: Reject Non-Essential and Accept All carry the same visual weight", async ({ page }) => {
    await page.goto("/");
    const banner = page.getByRole("region", { name: "Cookie notice" });
    await expect(banner).toBeVisible();
    const style = (name: string) =>
      banner.getByRole("button", { name }).evaluate((el) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return { background: cs.backgroundColor, color: cs.color, fontWeight: cs.fontWeight, height: Math.round(r.height) };
      });
    expect(await style("Reject Non-Essential")).toEqual(await style("Accept All"));
  });

  for (const path of ["/", "/flights"]) {
    test(`date popover opened on ${path} is brought fully into view (it used to open below the fold on phones and on the home page)`, async ({ page }) => {
      await page.goto(path);
      await page.waitForTimeout(1500); // hydration + the deferred calendar chunk
      await page.locator('button[aria-haspopup="dialog"]').first().click();
      const dialog = page.getByRole("dialog").first();
      await expect(dialog).toBeVisible();
      // smooth scroll (~0.5 s): poll until the popover's bottom edge is inside the viewport
      await expect
        .poll(async () => dialog.evaluate((el) => Math.round(el.getBoundingClientRect().bottom - window.innerHeight)), { timeout: 5000 })
        .toBeLessThanOrEqual(0);
      const top = await dialog.evaluate((el) => el.getBoundingClientRect().top);
      expect(top).toBeGreaterThanOrEqual(0);
    });
  }

  test("flight form: a failed submit marks the invalid airport field and ties its message to it (aria-invalid + aria-describedby)", async ({ page }) => {
    await page.goto("/flights");
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: /get a free flight quote/i }).last().click();
    const origin = page.getByPlaceholder("City or airport code").first();
    await expect(origin).toHaveAttribute("aria-invalid", "true");
    const describedBy = await origin.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    await expect(page.locator(`[id="${describedBy}"]`)).toContainText("Select an origin");
  });

  test("WCAG 2.4.11 focus not obscured: tabbing through /flights with the cookie banner showing never lands a control fully behind it", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/flights");
    await expect(page.getByRole("region", { name: "Cookie notice" })).toBeVisible();
    const hidden: string[] = [];
    for (let i = 0; i < 70; i++) {
      await page.keyboard.press("Tab");
      await page.waitForTimeout(150); // focus scrolling is instant, but let layout settle
      const result = await page.evaluate(() => {
        const e = document.activeElement;
        if (!e || e === document.body) return null;
        const b = e.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) return null;
        const points = [
          [b.x + b.width / 2, b.y + b.height / 2],
          [b.x + 4, b.y + 4],
          [b.x + b.width - 4, b.y + b.height - 4],
        ];
        const covered = points.filter(([x, y]) => {
          if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return true;
          const top = document.elementFromPoint(x, y);
          return !!top && top !== e && !e.contains(top) && !top.contains(e);
        }).length;
        const name = (e.getAttribute("aria-label") || e.textContent || e.getAttribute("placeholder") || e.tagName).trim().slice(0, 40);
        return covered === 3 ? name : null;
      });
      if (result) hidden.push(result);
    }
    expect(hidden, `controls fully hidden behind fixed UI when focused: ${hidden.join(" | ")}`).toEqual([]);
  });

  test("home regions grid: an odd last card spans the row instead of sitting alone in a half-empty one (below lg)", async ({ page }, testInfo) => {
    test.skip((testInfo.project.use.viewport?.width ?? 1280) >= 1024, "three-column layout from lg");
    await page.goto("/");
    const grid = page.locator("section", { has: page.getByRole("heading", { name: /regions, one dedicated specialist/i }) }).locator("div.grid");
    const cards = grid.locator("> div");
    const n = await cards.count();
    expect(n % 2, "the test assumes an odd number of regions; update it if the region count changes").toBe(1);
    const widths = await cards.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));
    expect(widths[n - 1]).toBeGreaterThan(widths[0] * 1.9);
  });
});
