import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

// Mobile usability, measured on the real pages with real interaction (found by an audit of every page type at 320-430 px portrait, 568-844 px landscape and 768 px):
//   * tap targets: nothing standalone smaller than 24 x 24 CSS px anywhere (WCAG 2.2 2.5.8), and the primary controls of the form, header and footer at a comfortable
//     44 px on a touch screen;
//   * the fixed "Best Deals" pill never sits over a form while the form is on screen below 1024 px (and is unchanged from 1024 px up), also after a client-side navigation;
//   * the first-visit cookie notice never takes more than about half of a screen (between 640 and 700 px it used to take 52%, and 88% of a landscape phone);
//   * the calendar days are as large as the narrowest screens allow, and the mobile menu can be fully reached on a landscape phone.
// The spec sets its own viewports (a touch context per size), so it runs once, in the Desktop Chrome project.

const CONSENT = JSON.stringify({ version: 1, decidedAt: "2026-11-01T00:00:00.000Z", preferences: { necessary: true, analytics: false, marketing: false } });

async function touchContext(browser: Browser, baseURL: string, width: number, height: number, consent = true): Promise<BrowserContext> {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, baseURL });
  if (consent) await context.addInitScript((c) => { try { localStorage.setItem("bft-cookie-consent", c); } catch { /* storage unavailable */ } }, CONSENT);
  await context.route("**/api/visitor-hint", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  return context;
}
const base = (testInfo: { project: { use: { baseURL?: string } } }) => testInfo.project.use.baseURL ?? "http://127.0.0.1:3101";
async function settle(page: Page, route: string) {
  await page.goto(route, { waitUntil: "load" });
  await page.waitForTimeout(500);
  await page.evaluate(async () => {
    const step = Math.max(300, window.innerHeight * 0.8);
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 30)); }
    window.scrollTo(0, 0);
  });
}

test.describe("mobile usability", () => {
  test.beforeEach(({ browserName }, testInfo) => {
    void browserName;
    test.skip(testInfo.project.name !== "Desktop Chrome", "this spec sets its own viewports; once is enough");
  });
  test.setTimeout(240_000);

  test("no standalone tap target is smaller than 24 x 24 px on any page type at 320, 375 and 430 px, and nothing overflows sideways", async ({ browser }, testInfo) => {
    const routes = ["/", "/flights", "/contact", "/about", "/how-it-works", "/business-class", "/destinations", "/destinations/europe", "/destinations/europe/united-kingdom/london", "/blog", "/blog/business-class-vs-first-class", "/privacy-policy"];
    const failures: string[] = [];
    for (const width of [320, 375, 430]) {
      const context = await touchContext(browser, base(testInfo), width, 800);
      const page = await context.newPage();
      for (const route of routes) {
        await settle(page, route);
        const found = await page.evaluate(() => {
          const out: string[] = [];
          const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
          if (overflow > 1) out.push(`horizontal overflow ${overflow}px`);
          const visible = (el: Element) => {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) return false;
            for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
              const s = getComputedStyle(n);
              if (s.display === "none" || s.visibility === "hidden" || (n as HTMLElement).inert || parseFloat(s.opacity) < 0.05) return false;
              if (n !== el && /(hidden|clip)/.test(s.overflowY + s.overflowX)) {
                const a = n.getBoundingClientRect();
                if (r.bottom <= a.top + 1 || r.top >= a.bottom - 1 || r.right <= a.left + 1 || r.left >= a.right - 1) return false;
              }
            }
            return true;
          };
          const inRunningText = (a: Element) => {
            if (a.tagName !== "A" || getComputedStyle(a).display !== "inline") return false;
            const p = a.closest("p, li, dd, dt, td, blockquote, span, small");
            return !!p && p !== a && (p.textContent ?? "").trim().length > (a.textContent ?? "").trim().length + 3; // a link inside a line of text is exempt from the 24 px floor (WCAG 2.5.8, inline)
          };
          for (const el of document.querySelectorAll("a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab]")) {
            if (!visible(el) || el.closest(".sr-only") || inRunningText(el)) continue;
            if (el instanceof HTMLInputElement && (el.type === "radio" || el.type === "checkbox")) continue; // operated through its label, measured separately
            const r = el.getBoundingClientRect();
            if (r.width < 24 || r.height < 24) out.push(`${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
          }
          return out;
        });
        for (const f of found) failures.push(`${width}px ${route}: ${f}`);
      }
      await context.close();
    }
    expect(failures).toEqual([]);
  });

  test("the primary controls are comfortable to tap on a touch screen (44 px)", async ({ browser }, testInfo) => {
    for (const [width, height] of [[320, 700], [390, 844], [667, 375], [768, 1024]] as const) {
      const context = await touchContext(browser, base(testInfo), width, height);
      const page = await context.newPage();
      const size = async (locator: ReturnType<Page["locator"]>) => (await locator.boundingBox())!;
      await page.goto("/flights", { waitUntil: "load" });
      await page.locator(".PhoneInput").first().waitFor({ timeout: 30_000 });
      const form = page.locator("form:has(#phone)");
      const label = `${width}x${height}`;
      if (width < 1024) {
        const menu = await size(page.getByRole("button", { name: /open menu/i }));
        expect(menu.width, `${label} menu button`).toBeGreaterThanOrEqual(44);
        expect(menu.height, `${label} menu button`).toBeGreaterThanOrEqual(44);
        expect((await size(page.getByRole("link", { name: /Business Flights Travel — home/ }))).height, `${label} logo link`).toBeGreaterThanOrEqual(44);
      }
      for (const name of ["One Way", "Round Trip", "Multi-City"]) expect((await size(form.getByRole("button", { name, exact: true }))).height, `${label} ${name}`).toBeGreaterThanOrEqual(44);
      expect((await size(form.getByRole("button", { name: /Add preferences/ }))).height, `${label} preferences toggle`).toBeGreaterThanOrEqual(44);
      await form.getByRole("button", { name: /Traveler/ }).first().click();
      for (const name of ["Increase Adults", "Decrease Adults", "Increase Children", "Decrease Children"]) {
        const b = await size(form.getByRole("button", { name }));
        expect(Math.min(b.width, b.height), `${label} ${name}`).toBeGreaterThanOrEqual(44);
      }
      await page.goto("/", { waitUntil: "load" });
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      for (const name of ["Privacy Policy", "Cookie Policy", "Terms of Service", "Cookie Settings"]) {
        const target = page.locator("footer nav[aria-label='Legal']").getByRole(name === "Cookie Settings" ? "button" : "link", { name, exact: true });
        expect((await size(target)).height, `${label} footer ${name}`).toBeGreaterThanOrEqual(36);
      }
      await context.close();
    }
  });

  test("the call pill steps aside while a form is on screen below 1024 px, comes back after it, and is unchanged on a desktop", async ({ browser }, testInfo) => {
    const pillOpacity = (page: Page) => page.locator("aside[aria-label='Call us'] a").evaluate((el) => parseFloat(getComputedStyle(el).opacity));
    for (const [width, height, route, hidden] of [
      [390, 844, "/flights", true], [320, 700, "/flights", true], [768, 1024, "/flights", true], [390, 844, "/contact", true],
      [1280, 800, "/flights", false], [1024, 768, "/flights", false],
    ] as const) {
      const context = await touchContext(browser, base(testInfo), width, height);
      const page = await context.newPage();
      await page.goto(route, { waitUntil: "load" });
      // below 1024 px bring the form on screen; on a desktop leave the page as a visitor first sees it (the submit button, which also hides the pill, starts below the fold)
      if (hidden) await page.locator("form").first().scrollIntoViewIfNeeded();
      // The pill fades over a quarter of a second (and later under load): poll for the settled state instead of sampling it after a fixed wait.
      await page.waitForTimeout(300);
      if (hidden) await expect.poll(() => pillOpacity(page), { message: `${width}px ${route}: pill over the form`, timeout: 10_000 }).toBeLessThan(0.05);
      else await expect.poll(() => pillOpacity(page), { message: `${width}px ${route}: pill on a desktop`, timeout: 10_000 }).toBeGreaterThan(0.9);
      if (hidden) {
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await expect.poll(() => pillOpacity(page), { message: `${width}px ${route}: pill returns once the form is out of view`, timeout: 10_000 }).toBeGreaterThan(0.9);
      }
      await context.close();
    }
  });

  test("the pill also steps aside on a page reached by a link (client-side navigation), not only on a fresh load", async ({ browser }, testInfo) => {
    const context = await touchContext(browser, base(testInfo), 390, 844);
    const page = await context.newPage();
    await page.goto("/about", { waitUntil: "load" });
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: /open menu/i }).click();
    await page.locator("header").getByRole("link", { name: "Flights", exact: true }).click();
    await page.waitForURL("**/flights");
    await page.locator("form:has(#phone)").scrollIntoViewIfNeeded();
    await expect.poll(() => page.locator("aside[aria-label='Call us'] a").evaluate((el) => parseFloat(getComputedStyle(el).opacity)), { timeout: 10_000 }).toBeLessThan(0.05);
    await context.close();
  });

  test("the first-visit cookie notice never takes much more than half of a screen, at any phone or tablet size or orientation", async ({ browser }, testInfo) => {
    const sizes = [[320, 700], [360, 740], [390, 844], [430, 932], [568, 320], [640, 900], [667, 375], [700, 900], [768, 1024], [844, 390], [1024, 768], [1280, 720]] as const;
    const tall: string[] = [];
    for (const [width, height] of sizes) {
      const context = await touchContext(browser, base(testInfo), width, height, false);
      const page = await context.newPage();
      await page.goto("/contact", { waitUntil: "load" });
      const box = await page.locator("[role=region][aria-label='Cookie notice']").boundingBox({ timeout: 10_000 }).catch(() => null);
      expect(box, `${width}x${height}: the notice is shown on a first visit`).not.toBeNull();
      if (box && box.height > height * 0.55) tall.push(`${width}x${height}: ${Math.round(box.height)}px = ${Math.round((box.height / height) * 100)}%`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${width}x${height} overflow`).toBeLessThanOrEqual(0);
      await context.close();
    }
    expect(tall).toEqual([]);
  });

  test("the calendar days are as large as the narrowest screens allow, and the whole calendar fits the screen", async ({ browser }, testInfo) => {
    // 32 px buttons up to 380 px wide: the largest the popover geometry allows (larger cells push its right edge past a 320 px screen); 44 px cells from 381 px
    for (const [width, min] of [[320, 32], [360, 32], [375, 32], [390, 42]] as const) {
      const context = await touchContext(browser, base(testInfo), width, 800);
      const page = await context.newPage();
      await page.goto("/flights", { waitUntil: "load" });
      await page.locator(".PhoneInput").first().waitFor({ timeout: 30_000 });
      await page.locator("form:has(#phone)").getByText("Select date").first().click();
      await page.waitForTimeout(600);
      const grid = (await page.getByRole("grid").first().boundingBox())!;
      expect(grid.x, `${width}px calendar left edge`).toBeGreaterThanOrEqual(0);
      expect(grid.x + grid.width, `${width}px calendar right edge`).toBeLessThanOrEqual(width + 1);
      const day = (await page.getByRole("grid").first().locator("button:not([disabled])").first().boundingBox())!;
      expect(Math.min(day.width, day.height), `${width}px day size`).toBeGreaterThanOrEqual(min);
      await context.close();
    }
  });

  test("on a landscape phone the whole mobile menu can be reached (the quote button scrolls fully into view)", async ({ browser }, testInfo) => {
    for (const [width, height] of [[568, 320], [667, 375], [844, 390]] as const) {
      const context = await touchContext(browser, base(testInfo), width, height);
      const page = await context.newPage();
      await page.goto("/", { waitUntil: "load" });
      await page.waitForTimeout(600);
      await page.getByRole("button", { name: /open menu/i }).tap();
      const cta = page.locator("header").getByRole("link", { name: /Get a Free Flight Quote/ }).last();
      await cta.waitFor();
      await cta.scrollIntoViewIfNeeded();
      const box = (await cta.boundingBox())!;
      expect(box.y, `${width}x${height}`).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height, `${width}x${height}`).toBeLessThanOrEqual(height + 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${width}x${height} overflow`).toBeLessThanOrEqual(0);
      await context.close();
    }
  });
});
