import { test, expect } from "@playwright/test";

// WCAG 2.1 SC 1.3.5 (Identify Input Purpose): the contact form's name and email inputs must declare what they collect so browsers and assistive
// technology can autofill them. The two honeypot inputs (the contact form's and the footer newsletter's) must do the opposite: stay at
// autocomplete="off" so a browser never fills them for a real visitor, which would flag a genuine message as spam.

test.describe("contact form: autocomplete attributes", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/contact");
  });

  test("first name, last name and email declare their purpose", async ({ page }) => {
    await expect(page.locator("#c-firstName")).toHaveAttribute("autocomplete", "given-name");
    await expect(page.locator("#c-lastName")).toHaveAttribute("autocomplete", "family-name");
    const email = page.locator("#c-email");
    await expect(email).toHaveAttribute("type", "email");
    await expect(email).toHaveAttribute("autocomplete", "email");
  });

  test("the phone input keeps its tel purpose", async ({ page }) => {
    await expect(page.locator("#c-phone")).toHaveAttribute("autocomplete", "tel");
  });

  test("both honeypot inputs (contact form and footer newsletter) stay at autocomplete=off", async ({ page }) => {
    // A honeypot is an input inside an aria-hidden, display:none wrapper. Exactly two exist on /contact: the contact form's and the newsletter's.
    const honeypots = page.locator('div.hidden[aria-hidden="true"] input');
    await expect(honeypots).toHaveCount(2);
    for (const input of await honeypots.all()) {
      await expect(input).toHaveAttribute("autocomplete", "off");
      await expect(input).toHaveAttribute("tabindex", "-1");
    }
    await expect(page.locator("#c-website")).toHaveAttribute("autocomplete", "off");
    // The wrapper must really be out of sight for people, and the field empty.
    await expect(page.locator("#c-website")).toBeHidden();
    await expect(page.locator("#c-website")).toHaveValue("");
  });

  test("every text-entry input on the page declares an autocomplete value (no unannotated field)", async ({ page }) => {
    const missing = await page.evaluate(() =>
      Array.from(document.querySelectorAll("input"))
        .filter((i) => !["hidden", "checkbox", "radio", "submit", "button"].includes(i.type))
        .filter((i) => !i.getAttribute("autocomplete"))
        .map((i) => i.id || i.name || i.outerHTML.slice(0, 80)),
    );
    expect(missing).toEqual([]);
  });
});
