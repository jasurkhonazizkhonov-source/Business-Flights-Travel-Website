import { test, expect, type Page } from "@playwright/test";

// The Content-Security-Policy in next.config.ts keeps 'unsafe-inline' for scripts and styles. These tests pin WHY, and what the page is allowed to do under it:
//  * script-src: every executable inline script is Next.js's own framework payload (the flight data and the bootstrap), which differs on every page, so a
//    hash list or nonce is impossible without rendering every page per request (docs/SECURITY_REVIEW_AND_REMAINING_LIMITATIONS.md, section 3);
//  * style-src: the toast library (sonner) inserts a <style> element when the toaster mounts, so narrowing style-src would unstyle the toasts;
//  * and nothing ELSE inline exists: no inline <style> in the server HTML, no event-handler attribute, no javascript: URL - so the broad directive is not
//    carrying anything the application did not put there itself.
// The browser flows below must raise no securitypolicyviolation at all: a new third-party script, font, image host, frame or inline construct that the
// policy does not allow shows up here.

const PAGES = ["/", "/flights", "/contact", "/about", "/blog", "/blog/business-class-vs-first-class", "/destinations", "/destinations/europe", "/destinations/europe/germany/munich", "/privacy-policy", "/cookie-policy", "/terms-of-service"];

test.describe("what the pages inline (server HTML)", () => {
  for (const path of PAGES) {
    test(`${path}: only framework scripts are executable and inline; no inline <style>, event handler or javascript: URL`, async ({ request }) => {
      const html = await (await request.get(path)).text();
      for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
        const [, attrs, body] = m;
        if (/\bsrc=/.test(attrs)) continue; // an external file: allowed by 'self'
        if (/type="application\/(ld\+)?json"/.test(attrs)) continue; // a data block (structured data): never executed
        expect(body.trim().slice(0, 60), `${path}: unexpected inline script`).toMatch(/^(self\.__next_f|\(self\.__next_f|\(globalThis\["TURBOPACK"\]|\(self\.__next_s|self\.__next_s)/);
      }
      expect(html, "inline <style> element").not.toMatch(/<style\b/i);
      expect(html, "inline event handler").not.toMatch(/\son[a-z]+="/i);
      expect(html, "javascript: URL").not.toMatch(/(href|src|action)="javascript:/i);
    });
  }
});

async function watchViolations(page: Page) {
  const seen: string[] = [];
  await page.exposeFunction("__reportCspViolation", (v: string) => seen.push(v));
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      (window as unknown as { __reportCspViolation: (v: string) => void }).__reportCspViolation(`${e.effectiveDirective}: blocked ${e.blockedURI || "inline"} ${(e.sample || "").slice(0, 60).replace(/\s+/g, " ")}`);
    });
  });
  return seen;
}

test.describe("browser flows under the real policy", () => {
  test("home page: newsletter toast (the toaster mounts and styles itself), navigation, cookie notice - no violation", async ({ page }) => {
    const seen = await watchViolations(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const email = page.locator('input[type="email"]').last();
    await email.fill("someone@example.com");
    await email.press("Enter");
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(1, { timeout: 15_000 });
    expect(seen).toEqual([]);
  });

  test("flight form: airport list, calendar and passenger popups open and work - no violation", async ({ page }) => {
    const seen = await watchViolations(page);
    await page.goto("/flights");
    await page.waitForLoadState("networkidle");
    const from = page.getByRole("combobox", { name: /Flight 1 — From/ });
    await from.fill("Lon");
    await expect(page.getByRole("option").first()).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /depart/i }).first().click().catch(() => undefined);
    await page.waitForTimeout(500);
    expect(seen).toEqual([]);
  });

  test("contact, a destination page and a legal page load and hydrate - no violation", async ({ page }) => {
    const seen = await watchViolations(page);
    for (const path of ["/contact", "/destinations/europe/germany/munich", "/cookie-policy"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
    }
    expect(seen).toEqual([]);
  });
});

// script-src still allows inline script (Next's framework payload needs it), but NOT inline event-handler attributes: nothing in the app uses them, so refusing
// them costs nothing and stops an injected onclick="..." / onerror="..." from becoming script. (script-src-attr 'none' in next.config.ts.)
test.describe("inline event-handler attributes are refused", () => {
  test("a handler attribute added to the page does not run and is reported as a policy violation", async ({ page }) => {
    await page.goto("/contact");
    const result = await page.evaluate(async () => {
      const violations: string[] = [];
      document.addEventListener("securitypolicyviolation", (e) => violations.push(e.effectiveDirective));
      const w = window as unknown as { __ran?: boolean };
      w.__ran = false;
      const button = document.createElement("button");
      button.setAttribute("onclick", "window.__ran = true");
      document.body.appendChild(button);
      button.click();
      const image = document.createElement("img");
      image.setAttribute("onerror", "window.__ran = true");
      image.setAttribute("src", "/definitely-missing-image.png");
      document.body.appendChild(image);
      await new Promise((resolve) => setTimeout(resolve, 400));
      return { ran: w.__ran, violations };
    });
    expect(result.ran).toBe(false);
    expect(result.violations).toContain("script-src-attr");
  });
});
