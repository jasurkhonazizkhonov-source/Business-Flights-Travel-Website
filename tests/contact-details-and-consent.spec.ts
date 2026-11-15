import { test, expect, type Page } from "@playwright/test";

// Company contact details are one source of truth (src/lib/constants.ts) and must read the same everywhere: the floating "Call for the
// Best Deals" button, the "Call Us" section, footer, contact / about / flights pages, the legal pages and the structured data. And the
// short notice under the flight-request button: its wording, its link to THIS site's Privacy Policy, and the absence of a checkbox.

const PHONE_DISPLAY = "+1 415 570 9267";
const PHONE_TEL = "tel:+14155709267";
const EMAIL = "info@businessflights.travel";
const MAILTO = `mailto:${EMAIL}`;
const STREET = "350 Sansome St";
// Anything from the previous contact details (formatted or not), the old addresses and any other company's names/links.
const OLD = /777[\s.\-)]*7788|4157777788|requests?@businessflights|580 California|California Street|skylux|prime flights|travel consolidator/i;

async function dismissCookieBanner(page: Page) {
  const reject = page.getByRole("button", { name: /Reject Non-Essential/i });
  if (await reject.isVisible().catch(() => false)) await reject.click();
}

const PAGES = ["/", "/flights", "/contact", "/about", "/how-it-works", "/business-class", "/privacy-policy", "/terms-of-service", "/cookie-policy", "/destinations/europe/france/paris", "/blog/business-class-vs-first-class"];

test.describe("company contact details", () => {
  for (const url of PAGES) {
    test(`${url}: no old phone number, email or address; every tel:/mailto: link uses the new ones`, async ({ page }) => {
      await page.goto(url);
      const html = await page.content();
      expect(html).not.toMatch(OLD);
      const tels = await page.locator('a[href^="tel:"]').evaluateAll((els) => els.map((e) => e.getAttribute("href")));
      for (const t of tels) expect(t).toBe(PHONE_TEL);
      const mails = await page.locator('a[href^="mailto:"]').evaluateAll((els) => els.map((e) => (e.getAttribute("href") ?? "").split("?")[0]));
      for (const m of mails) expect(m).toBe(MAILTO);
    });
  }

  test("floating 'Call for the Best Deals' button: label, number and tel: link", async ({ page }) => {
    await page.goto("/");
    await dismissCookieBanner(page);
    // The button steps aside (aria-hidden) while the quote form is on screen, so address it by its landmark, not by role.
    const call = page.locator('aside[aria-label="Call us"] a');
    await expect(call).toHaveAttribute("href", PHONE_TEL);
    const text = (await call.textContent()) ?? "";
    expect(text).toContain("Call for the Best Deals");
    expect(text).toContain(PHONE_DISPLAY);
  });

  test("footer and contact page show the phone, email and address", async ({ page }) => {
    await page.goto("/contact");
    await expect(page.getByRole("heading", { name: "Call Us" })).toBeVisible();
    const main = page.locator("main");
    await expect(main.getByRole("link", { name: PHONE_DISPLAY })).toHaveAttribute("href", PHONE_TEL);
    await expect(main.getByRole("link", { name: EMAIL })).toHaveAttribute("href", MAILTO);
    const footer = page.locator("footer");
    await expect(footer.getByRole("link", { name: PHONE_DISPLAY })).toHaveAttribute("href", PHONE_TEL);
    await expect(footer.getByRole("link", { name: EMAIL })).toHaveAttribute("href", MAILTO);
    await expect(footer).toContainText(`${STREET}, San Francisco, CA 94104`);
  });

  test("the flights page 'call us' sentence uses the new number", async ({ page }) => {
    await page.goto("/flights");
    await expect(page.getByText(`Call ${PHONE_DISPLAY}`)).toBeVisible();
  });

  test("structured data: telephone, email and address on every page's TravelAgency block", async ({ page }) => {
    await page.goto("/about");
    const blocks = (await page.locator('script[type="application/ld+json"]').allTextContents()).map((b) => JSON.parse(b));
    const org = blocks.find((b) => b["@type"] === "TravelAgency");
    expect(org.telephone).toBe("+14155709267");
    expect(org.email).toBe(EMAIL);
    expect(org.contactPoint).toMatchObject({ telephone: "+14155709267", email: EMAIL });
    expect(org.address).toMatchObject({ streetAddress: STREET, addressLocality: "San Francisco", addressRegion: "CA", postalCode: "94104", addressCountry: "US" });
  });

  test("legal pages carry the new address, phone and email", async ({ page }) => {
    await page.goto("/privacy-policy");
    const main = page.locator("main");
    await expect(main).toContainText(`${STREET}, San Francisco, CA 94104, United States`);
    await expect(main).toContainText(PHONE_DISPLAY);
    await expect(main.getByRole("link", { name: EMAIL }).first()).toHaveAttribute("href", MAILTO);
    await page.goto("/terms-of-service");
    await expect(page.locator("main")).toContainText(`${STREET}, San Francisco, CA 94104, United States`);
  });
});

test.describe("notice under the flight-request button", () => {
  for (const url of ["/", "/flights"]) {
    test(`${url}: sits directly under the button, no checkbox, privacy link goes to this site's own Privacy Policy`, async ({ page, request }) => {
      await page.goto(url);
      await dismissCookieBanner(page);
      const form = page.locator("form", { has: page.getByRole("button", { name: "Get a Free Flight Quote" }) }).first();
      const button = form.getByRole("button", { name: "Get a Free Flight Quote" });
      const notice = form.getByTestId("quote-consent-notice");
      await expect(notice).toBeVisible();
      for (const phrase of [
        "By providing your contact details and clicking “Get a Free Flight Quote”",
        "you agree to be contacted by Business Flights Travel regarding your request.",
        "We respect your privacy.",
      ]) {
        await expect(notice).toContainText(phrase);
      }
      // Nothing about SMS / text-message marketing, promotional offers or deals, or consent to marketing messages: the site has no such
      // functionality and records no such consent (docs/LEGAL.md, item 4).
      expect(await notice.innerText()).not.toMatch(/text message|\bsms\b|\boffers?\b|\bdeals?\b|marketing|purchase necessary|condition of purchase|spam/i);
      // Nothing from the example companies.
      expect(await notice.innerText()).not.toMatch(/skylux|prime flights|travel consolidator/i);

      // Below the button, in the same form, and small (12px).
      const b = await button.boundingBox();
      const n = await notice.boundingBox();
      expect(n!.y).toBeGreaterThan(b!.y + b!.height - 1);
      expect(await notice.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeLessThanOrEqual(13);

      // The word "privacy" is the link, and it is this website's own page.
      const link = notice.getByRole("link", { name: "privacy" });
      await expect(link).toHaveText("privacy");
      expect(await link.getAttribute("href")).toBe("/privacy-policy");
      const res = await request.get("/privacy-policy");
      expect(res.status()).toBe(200);
      expect(await res.text()).toContain("Privacy Policy");
      expect(await notice.locator("a").count()).toBe(1);

      // No checkbox was added: none in the form until the optional preferences are opened, and then only the existing "flexible dates" one.
      expect(await form.locator('input[type="checkbox"]').count()).toBe(0);
      await form.getByRole("button", { name: /Add preferences/ }).click();
      expect(await form.locator('input[type="checkbox"]').count()).toBe(1);
      await expect(form.getByLabel(/My dates are flexible/)).toBeVisible();
    });
  }

  test("the link works: clicking it opens the Privacy Policy page", async ({ page }) => {
    await page.goto("/flights");
    await dismissCookieBanner(page);
    await page.getByTestId("quote-consent-notice").getByRole("link", { name: "privacy" }).click();
    await expect(page).toHaveURL(/\/privacy-policy$/);
    await expect(page.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeVisible();
    // The policy's contact wording covers only the visitor's own request, and makes no marketing / offers / consent-to-marketing claim.
    await expect(page.locator("main")).toContainText("about your request");
    const policy = await page.locator("main").innerText();
    expect(policy).not.toMatch(/offers by phone|travel information and offers|marketing messages|condition of purchase/i);
  });
});
