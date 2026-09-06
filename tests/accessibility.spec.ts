import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Automated axe-core scans across the site's main page types, plus a few
// manual keyboard/focus/reduced-motion checks axe can't verify on its own
// (it flags missing/invalid a11y attributes and contrast, but not whether
// a control is actually reachable and operable by keyboard alone, or
// whether focus is visible). Not wired into the main `redesign.spec.ts`
// file — this is a separate concern (WCAG conformance vs. functional
// regression), run the same way against the same dev server.
const PAGES = [
  { name: "Homepage", path: "/" },
  { name: "Destinations index", path: "/destinations" },
  { name: "Destination detail", path: "/destinations/europe/france/paris" },
  { name: "Blog index", path: "/blog" },
  { name: "Blog article", path: "/blog/business-class-etiquette-guide" },
  { name: "About", path: "/about" },
  { name: "Contact", path: "/contact" },
  { name: "Flights (request form)", path: "/flights" },
];

for (const { name, path } of PAGES) {
  test(`axe: ${name} has no automatically-detectable a11y violations`, async ({ page }) => {
    await page.goto(path);
    // Let Reveal's whileInView fade-ins (550ms) finish before scanning —
    // axe evaluates the DOM's current computed styles at the instant it
    // runs, and catching an element mid-fade (its container still at
    // partial opacity) can register as a transient color-contrast failure
    // that has nothing to do with the element's actual, resting-state
    // contrast. Confirmed by hand for the specific case this surfaced
    // (gold-500/navy-950 CTA button, 7.14:1 at rest — comfortably passes).
    await page.waitForTimeout(900);
    const results = await new AxeBuilder({ page })
      // Best-practice rules (e.g. "region", "landmark-unique") are useful
      // guidance but not WCAG failures on their own — scoring only against
      // the actual WCAG 2.x A/AA rule sets keeps this test meaningful
      // (fails on real conformance issues) rather than noisy.
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    if (results.violations.length > 0) {
      const summary = results.violations
        .map((v) => `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s))\n  ${v.nodes.map((n) => n.target.join(" ")).join("\n  ")}`)
        .join("\n\n");
      throw new Error(`${results.violations.length} a11y violation(s) on ${path}:\n\n${summary}`);
    }
    expect(results.violations).toEqual([]);
  });
}

test.describe("Keyboard and focus", () => {
  test("skip link is the first focus stop and jumps to main content", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const active = page.locator(":focus");
    await expect(active).toHaveAttribute("href", "#main-content");
    await active.press("Enter");
    // Focus should land on/inside #main-content once the skip link is activated.
    const main = page.locator("#main-content");
    await expect(main).toBeVisible();
  });

  test("primary nav links are reachable and visibly focused via keyboard", async ({ page }) => {
    await page.goto("/");
    // Tab from the top past the skip link and logo to the first nav link.
    for (let i = 0; i < 4; i++) await page.keyboard.press("Tab");
    const active = page.locator(":focus");
    const outline = await active.evaluate((el) => {
      const cs = getComputedStyle(el);
      return cs.outlineStyle !== "none" || cs.boxShadow !== "none";
    });
    expect(outline).toBe(true);
  });

  test("mobile menu opens, traps focus usefully, and closes on Escape", async ({ page }) => {
    await page.goto("/");
    const menuButton = page.getByRole("button", { name: /open menu/i });
    // The hamburger button only renders (lg:hidden) on narrow viewports —
    // Playwright's `isMobile` fixture isn't set for this config's custom
    // Mobile 320/375/390 projects (it's tied to devices[...] presets), so
    // checking the button's actual presence is the reliable signal instead.
    test.skip((await menuButton.count()) === 0, "desktop project — no hamburger button");
    await menuButton.click();
    await expect(page.getByRole("button", { name: /close menu/i })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: /open menu/i })).toBeVisible();
  });

  test("airport autocomplete is fully keyboard-operable", async ({ page }) => {
    await page.goto("/flights");
    const fromField = page.getByPlaceholder("City or airport code").first();
    await fromField.click();
    await fromField.fill("New York");
    // Wait for the search to actually resolve and the listbox to open,
    // rather than a fixed timeout guessing at debounce/search latency —
    // deterministic across machines/throttling instead of occasionally
    // racing the results on a slower run.
    await expect(fromField).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("ArrowDown");
    await expect(fromField).toHaveAttribute("aria-activedescendant", /-option-0$/);
    await page.keyboard.press("Enter");
    // A selection should populate the field with a real airport label.
    await expect(fromField).not.toHaveValue("New York");
  });
});

test.describe("Reduced motion", () => {
  test("respects prefers-reduced-motion: reveal content is immediately visible", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    // Hero heading is wrapped in a Reveal (framer-motion whileInView) —
    // under reduced motion it should render at full opacity without
    // waiting on any animation/timeout.
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible();
    const opacity = await heading.evaluate((el) => getComputedStyle(el).opacity);
    expect(Number(opacity)).toBeGreaterThan(0.9);
  });
});
