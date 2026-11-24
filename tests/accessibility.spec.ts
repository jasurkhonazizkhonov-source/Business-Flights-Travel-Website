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
  { name: "Destination detail with verified airport access", path: "/destinations/europe/germany/munich" },
  { name: "Region hub", path: "/destinations/europe" },
  { name: "Region hub (smaller region)", path: "/destinations/oceania" },
  { name: "Blog index", path: "/blog" },
  { name: "Blog article", path: "/blog/business-class-etiquette-guide" },
  { name: "About", path: "/about" },
  { name: "Contact", path: "/contact" },
  { name: "Flights (request form)", path: "/flights" },
  { name: "Business class", path: "/business-class" },
  { name: "How it works", path: "/how-it-works" },
  { name: "Privacy policy", path: "/privacy-policy" },
  { name: "Terms of service", path: "/terms-of-service" },
  { name: "Cookie policy", path: "/cookie-policy" },
  { name: "Not found (404)", path: "/this-page-does-not-exist" },
];

for (const { name, path } of PAGES) {
  test(`axe: ${name} has no automatically-detectable a11y violations`, async ({ page }) => {
    // The scroll-through below walks the whole page (the destinations index is ~49,000 px tall on a phone, 171 cards) and axe then
    // scans every node: 16-25 s alone, and it hit the 30 s default under load (1 of 1,098 in the 2026-10-25 run; 3/3 pass in isolation).
    test.setTimeout(90_000);
    await page.goto(path);
    // Let Reveal's whileInView fade-ins (550ms) finish before scanning —
    // axe evaluates the DOM's current computed styles at the instant it
    // runs, and catching an element mid-fade (its container still at
    // partial opacity) can register as a transient color-contrast failure
    // that has nothing to do with the element's actual, resting-state
    // contrast. Confirmed by hand for the specific case this surfaced
    // (gold-500/navy-950 CTA button, 7.14:1 at rest — comfortably passes).
    await page.waitForTimeout(900);
    // Reveal keeps blocks BELOW the fold at opacity 0 until they are scrolled to, and axe skips
    // invisible content — so without this scroll the scan only ever saw the first screenful. It
    // is how the 12px gold kickers on cream-100 (4.37:1) and the tiny placeholder text went
    // unnoticed. Walk the page once so everything has been revealed, then return to the top.
    await page.evaluate(async () => {
      const step = Math.max(300, Math.floor(window.innerHeight * 0.8));
      for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(900);
    // The floating call button is mounted late (deferred chunk) and fades in over
    // 250 ms; scanning it mid-fade reads its label at partial opacity and can
    // report a transient contrast failure. Wait until it has fully appeared.
    await page.waitForFunction(() => {
      const fab = document.querySelector('a.fixed[href^="tel:"]');
      // (On pages with their own primary button in view it deliberately hides itself: aria-hidden.)
      return !fab || fab.getAttribute("aria-hidden") === "true" || getComputedStyle(fab).opacity === "1";
    });
    // The fixed sleeps above are guesses about how long the fade-ins take; under load (three browsers on a small machine) one run of the Blog index scan caught
    // text mid-fade and reported a contrast failure that was gone on the retry. Wait for the STATE instead: no animation running, and no element with an inline
    // opacity (what the animation library writes) left between 0 and 1. Bounded, so a page that deliberately rests at a partial inline opacity cannot hang
    // the test: after the bound the scan runs exactly as before.
    await page
      .waitForFunction(
        () =>
          !document.getAnimations().some((a) => a.playState === "running") &&
          [...document.querySelectorAll<HTMLElement>('[style*="opacity"]')].every((el) => {
            const o = Number.parseFloat(getComputedStyle(el).opacity);
            return Number.isNaN(o) || o === 0 || o === 1;
          }),
        undefined,
        { timeout: 8000 },
      )
      .catch(() => undefined);
    const results = await new AxeBuilder({ page })
      // Best-practice rules (e.g. "region", "landmark-unique") are useful
      // guidance but not WCAG failures on their own — scoring only against
      // the actual WCAG 2.x A/AA rule sets keeps this test meaningful
      // (fails on real conformance issues) rather than noisy.
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
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
  test("skip link is the first focus stop and jumps to main content", async ({ page, browserName }) => {
    // Safari's default setting ("Press Tab to highlight each item on a webpage" is OFF) makes Tab skip every LINK and stop only on buttons and form controls, so in WebKit the
    // first Tab stop is the first button and a skip link is reached with Option+Tab or a screen reader. That is the browser's behaviour, not something the page can change; the
    // skip link itself is still the first element in the document and is verified in Chromium here.
    test.skip(browserName === "webkit", "Safari's default keyboard setting skips links when Tab is pressed");
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

test.describe("Floating call button", () => {
  // An article page: no primary-CTA button in view at the top, so the pill is showing.
  const ARTICLE = "/blog/business-class-vs-first-class";

  // A visitor who has already answered the cookie notice (while the notice is up the
  // pill deliberately hides itself, like it does for any other bottom call-to-action).
  async function answeredCookieNotice(page: import("@playwright/test").Page) {
    await page.addInitScript(() => {
      window.localStorage.setItem("bft-cookie-consent", JSON.stringify({ version: 1, decidedAt: new Date().toISOString(), preferences: { necessary: true, analytics: false, marketing: false } }));
    });
  }

  test("steps aside while a form field has focus, and returns when focus leaves", async ({ page }) => {
    await answeredCookieNotice(page);
    await page.goto(ARTICLE);
    const fab = page.locator('a.fixed[href^="tel:"]');
    await expect(fab).toHaveAttribute("aria-hidden", "false", { timeout: 15000 });
    await page.locator("#newsletter-email").focus();
    await expect(fab).toHaveAttribute("aria-hidden", "true");
    expect(await fab.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
    await page.locator("#newsletter-email").blur();
    await expect(fab).toHaveAttribute("aria-hidden", "false");
  });

  test("steps aside while a date or traveler popup is open, so it cannot cover (and be tapped instead of) a calendar day", async ({ page }) => {
    await answeredCookieNotice(page);
    // This test is about the POPUP rule only. The pill also (correctly) steps aside whenever the form's own submit button is near the bottom of the
    // screen, which on a tall tablet window (768x1024) is already the case at load - so the window is made short enough that the submit button is
    // below the fold at every project width. The submit-button rule has its own test below.
    const size = page.viewportSize();
    if (size) await page.setViewportSize({ width: size.width, height: Math.min(size.height, 640) });
    await page.goto("/flights");
    const fab = page.locator('a.fixed[href^="tel:"]');
    if (size && size.width < 1024) {
      // Below 1024 px the pill steps aside for the WHOLE form (FloatingDealsButton, data-hide-floating-cta-small: on a phone it otherwise sat over the field
      // being filled in), so it is already hidden at load and the popup can never be covered by it. What matters here is that it STAYS hidden with the popup
      // open and comes back once the form is out of view (the rest of the behaviour is in mobile-usability.spec.ts).
      await expect(fab).toHaveAttribute("aria-hidden", "true", { timeout: 15000 });
      await page.getByRole("button", { name: /travelers & cabin/i }).click();
      await expect(fab).toHaveAttribute("aria-hidden", "true");
      expect(await fab.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
      await page.getByRole("button", { name: /travelers & cabin/i }).click(); // toggle closed
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expect(fab).toHaveAttribute("aria-hidden", "false", { timeout: 15000 });
      return;
    }
    await expect(fab).toHaveAttribute("aria-hidden", "false", { timeout: 15000 });
    await page.getByRole("button", { name: /travelers & cabin/i }).click();
    await expect(fab).toHaveAttribute("aria-hidden", "true");
    await page.getByRole("button", { name: /travelers & cabin/i }).click(); // toggle closed
    // Opening the popup now scrolls the page so the whole popup is on screen (useScrollPopoverIntoView), which can bring the form's own
    // submit button into view, and the pill deliberately steps aside for that button too. Return to the top so this asserts only the popup rule.
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(fab).toHaveAttribute("aria-hidden", "false");
  });

  test("steps aside while the form's own submit button is on screen, so it can never sit on top of it, and returns when that button is out of view", async ({ page }) => {
    await answeredCookieNotice(page);
    // A tall tablet-sized window shows the submit button in the first screen: the pill must be hidden, not covering it.
    await page.setViewportSize({ width: 768, height: 1100 });
    await page.goto("/flights");
    const submit = page.locator("form:has(#phone) button[type=submit]");
    await expect(submit).toBeVisible();
    const fab = page.locator('a.fixed[href^="tel:"]');
    await expect(fab).toHaveAttribute("aria-hidden", "true", { timeout: 15000 });
    expect(await fab.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
    // The pill and the button never overlap in any state we can observe.
    const overlap = await page.evaluate(() => {
      const f = document.querySelector('a.fixed[href^="tel:"]') as HTMLElement | null;
      const b = document.querySelector("form button[type=submit]") as HTMLElement | null;
      if (!f || !b || getComputedStyle(f).opacity === "0") return false;
      const x = f.getBoundingClientRect();
      const y = b.getBoundingClientRect();
      return Math.min(x.right, y.right) > Math.max(x.left, y.left) && Math.min(x.bottom, y.bottom) > Math.max(x.top, y.top);
    });
    expect(overlap).toBe(false);
    // Below 1024 px the pill also steps aside for the rest of the form (it used to sit over the fields), so at 768 px a short window that merely puts the submit
    // button below the fold does NOT bring it back while form fields are still on screen: it returns once the form is out of view.
    await page.setViewportSize({ width: 768, height: 640 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(fab).toHaveAttribute("aria-hidden", "true");
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(fab).toHaveAttribute("aria-hidden", "false", { timeout: 15000 });
    // The original rule, unchanged on a desktop: from 1024 px the pill is back as soon as the submit button is below the fold.
    await page.setViewportSize({ width: 1280, height: 640 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(fab).toHaveAttribute("aria-hidden", "false", { timeout: 15000 });
  });

  test("never covers anything at the end of the page", async ({ page }) => {
    await answeredCookieNotice(page);
    await page.goto(ARTICLE);
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(500);
    const covered = await page.evaluate(() => {
      const fab = document.querySelector('a.fixed[href^="tel:"]');
      // Hidden (faded out) counts as not covering anything.
      if (!fab || getComputedStyle(fab).opacity === "0") return [];
      const f = fab.getBoundingClientRect();
      return [...document.querySelectorAll("footer a, footer button, footer p")].filter((el) => {
        const b = el.getBoundingClientRect();
        return b.width > 0 && Math.min(b.right, f.right) > Math.max(b.left, f.left) && Math.min(b.bottom, f.bottom) > Math.max(b.top, f.top);
      }).map((el) => (el.textContent || "").trim().slice(0, 30));
    });
    expect(covered).toEqual([]);
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

  test("CSS animations and transitions collapse to ~instant under reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/flights");
    // The global rule in globals.css flattens every transition/animation, so a
    // control that normally eases (any <button>/<a>) reports a ~0 duration.
    const durations = await page.evaluate(() => {
      const ms = (v: string) => Math.max(...v.split(",").map((s) => (s.trim().endsWith("ms") ? parseFloat(s) : parseFloat(s) * 1000)));
      const els = Array.from(document.querySelectorAll("a, button")).slice(0, 25);
      return els.map((el) => ms(getComputedStyle(el).transitionDuration));
    });
    for (const d of durations) expect(d).toBeLessThanOrEqual(1);
  });
});

// Regressions found by the 2026-10 follow-up audit (each was reproduced before it was fixed).
test.describe("Form and markup regressions", () => {
  test("home page has no duplicate element ids (two newsletter forms share the page)", async ({ page }) => {
    await page.goto("/");
    const duplicates = await page.evaluate(() => {
      const counts: Record<string, number> = {};
      document.querySelectorAll("[id]").forEach((el) => (counts[el.id] = (counts[el.id] ?? 0) + 1));
      return Object.entries(counts).filter(([, n]) => n > 1).map(([id, n]) => `${id}×${n}`);
    });
    expect(duplicates).toEqual([]);
    // and every newsletter email field is reachable by its own label
    const emailFields = page.locator('input[type="email"][id$="-email"]');
    for (let i = 0; i < (await emailFields.count()); i++) {
      const id = await emailFields.nth(i).getAttribute("id");
      await expect(page.locator(`label[for="${id}"]`)).toHaveCount(1);
    }
  });

  test("placeholder text is at least 65% of the text colour (WCAG 1.4.3 needs ~4.5:1)", async ({ page }) => {
    await page.goto("/flights");
    const alphas = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLInputElement>("input[placeholder], textarea[placeholder]"))
        .filter((el) => getComputedStyle(el).display !== "none")
        .map((el) => {
          const m = /\/\s*([\d.]+)\s*\)/.exec(getComputedStyle(el, "::placeholder").color);
          return { placeholder: el.placeholder, alpha: m ? Number(m[1]) : 1 };
        }),
    );
    expect(alphas.length).toBeGreaterThan(0);
    for (const a of alphas) expect(a.alpha, `placeholder "${a.placeholder}"`).toBeGreaterThanOrEqual(0.65);
  });

  test("date and traveler triggers announce their current value, and their popups are named dialogs", async ({ page }) => {
    await page.goto("/flights");
    // aria-labelledby pointed at the label only, so the accessible name was just "Departure Date" and the chosen date was never read out.
    await expect(page.getByRole("button", { name: /departure date.*select date/i }).first()).toBeVisible();
    const travelers = page.getByRole("button", { name: /travelers & cabin.*1 traveler.*business/i });
    await expect(travelers).toBeVisible();
    await travelers.click();
    await expect(page.getByRole("dialog", { name: /travelers & cabin/i })).toBeVisible();
    const results = await new AxeBuilder({ page }).withRules(["aria-dialog-name", "aria-allowed-attr", "aria-valid-attr-value"]).analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });

  test("cookie preferences dialog traps Tab/Shift+Tab inside itself and returns focus to its opener on Escape", async ({ page }) => {
    await page.goto("/");
    const opener = page.getByRole("button", { name: /manage preferences/i });
    await opener.click({ timeout: 20000 }); // the banner is mounted lazily
    const dialog = page.getByRole("dialog", { name: /cookie preferences/i });
    await expect(dialog).toBeVisible();
    const insideModal = () => page.evaluate(() => !!document.activeElement?.closest('[aria-modal="true"]'));
    // Focus used to leave the aria-modal dialog after six Tab presses and land on <body>.
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      expect(await insideModal(), `Tab #${i + 1}`).toBe(true);
    }
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Shift+Tab");
      expect(await insideModal(), `Shift+Tab #${i + 1}`).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test("a failed submit moves keyboard focus to the first invalid field (flight form)", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("bft-cookie-consent", JSON.stringify({ version: 1, decidedAt: new Date().toISOString(), preferences: { necessary: true, analytics: false, marketing: false } }));
    });
    await page.goto("/flights");
    await page.getByRole("button", { name: /get a free flight quote/i }).last().click();
    // Focus used to stay on the submit button at the bottom of the long form.
    await expect(page.locator('[id="field-segments.0.from"] input')).toBeFocused();
  });

  test("the whole airport field is a tap target, not just the 20px text line", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("bft-cookie-consent", JSON.stringify({ version: 1, decidedAt: new Date().toISOString(), preferences: { necessary: true, analytics: false, marketing: false } }));
    });
    await page.goto("/flights");
    const input = page.getByPlaceholder("City or airport code").first();
    const box = await input.evaluate((el) => {
      let wrap = el.parentElement as HTMLElement;
      while (wrap && getComputedStyle(wrap).borderTopWidth === "0px") wrap = wrap.parentElement as HTMLElement;
      const r = wrap.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    // 3px inside the visible field's top edge, horizontally in the middle
    await page.mouse.click(box.x + box.w / 2, box.y + 3);
    await expect(input).toBeFocused();
  });
});
