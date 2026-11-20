import { test, expect, type Locator, type Page } from "@playwright/test";

// What a visitor experiences when a field is wrong, and the 11-month limit in the calendars. The pure rules are pinned in email-validation.spec.ts,
// phone-validation.spec.ts and flight-date-window.spec.ts; this is the form around them: when the message appears (not before the visitor has typed
// something), what it says, that the typed value stays, that nothing is submitted, and that the calendars stop at the same day the server does.

async function dismissCookieBanner(page: Page) {
  const reject = page.getByRole("button", { name: /Reject Non-Essential/i });
  if (await reject.isVisible().catch(() => false)) await reject.click();
}

/** Counts Server Action POSTs (the request a real submission makes). */
function watchSubmissions(page: Page) {
  const seen: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.headers()["next-action"]) seen.push(request.url());
  });
  return seen;
}

async function openFlightForm(page: Page) {
  await page.route("**/api/visitor-hint", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.goto("/flights");
  await dismissCookieBanner(page);
  await page.locator(".PhoneInput").first().waitFor({ timeout: 30000 });
}

test.describe("email: validated on leaving the field, again on submit", () => {
  test("nothing is said while the field is empty or being typed in; a bad address is explained when the visitor leaves it", async ({ page }) => {
    await openFlightForm(page);
    const email = page.locator("#email");
    await email.focus();
    await email.blur(); // left empty: no complaint yet
    await expect(page.locator("#email-error")).toHaveCount(0);
    await email.fill("john@gmail");
    await expect(page.locator("#email-error")).toHaveCount(0); // still typing
    await page.locator("#firstName").focus(); // leave the field
    await expect(page.locator("#email-error")).toContainText("Please enter a valid email address so our travel specialist can contact you about your flight request.");
    await expect(page.locator("#email-error")).toContainText("needs a dot");
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await expect(email).toHaveAttribute("aria-describedby", "email-error");
    await expect(email).toHaveValue("john@gmail"); // the typed text stays
  });

  test("the message clears as soon as the address becomes valid, and surrounding spaces do not make a valid address invalid", async ({ page }) => {
    await openFlightForm(page);
    const email = page.locator("#email");
    await email.fill("john@@example.com");
    await page.locator("#firstName").focus();
    await expect(page.locator("#email-error")).toContainText("only contain one @");
    await email.fill("  John.Doe+trip@Example.com  ");
    await expect(page.locator("#email-error")).toHaveCount(0); // cleared while typing, without leaving the field
    await page.locator("#firstName").focus();
    await expect(page.locator("#email-error")).toHaveCount(0);
    // (An <input type="email"> trims surrounding spaces itself; case, dots and the +tag are left exactly as typed.)
    await expect(email).toHaveValue("John.Doe+trip@Example.com");
  });

  test("each kind of mistake gets its own hint", async ({ page }) => {
    await openFlightForm(page);
    const email = page.locator("#email");
    const cases: [string, RegExp][] = [
      ["johnexample.com", /needs an @ sign/],
      ["@example.com", /Add the part before the @/],
      ["john@", /Add the part after the @/],
      ["john doe@example.com", /Remove any spaces/],
      ["jo..hn@example.com", /two dots in a row/],
      ["john@example..com", /typos, extra dots/],
      ["müller@example.de", /standard letters and digits/],
    ];
    for (const [value, hint] of cases) {
      await email.fill(value);
      await page.locator("#firstName").focus();
      await expect(page.locator("#email-error"), value).toContainText(hint);
    }
  });

  test("submitting with a bad address sends nothing, keeps everything typed, and puts focus on the problem", async ({ page }) => {
    const submissions = watchSubmissions(page);
    await openFlightForm(page);
    await page.locator("#firstName").fill("Jane");
    await page.locator("#lastName").fill("Traveller");
    await page.locator("#email").fill("jane@example");
    await page.locator("form:has(#email) button[type=submit]").click();
    await expect(page.locator("#email-error")).toContainText("needs a dot");
    expect(submissions).toHaveLength(0);
    await expect(page.locator("#firstName")).toHaveValue("Jane");
    await expect(page.locator("#lastName")).toHaveValue("Traveller");
    await expect(page.locator("#email")).toHaveValue("jane@example");
  });

  test("an empty address on submit says it is needed", async ({ page }) => {
    await openFlightForm(page);
    await page.locator("form:has(#email) button[type=submit]").click();
    await expect(page.locator("#email-error")).toHaveText("Please enter a valid email address so our travel specialist can contact you about your flight request.");
  });
});

test.describe("phone: validated on leaving the field, again on submit", () => {
  const phone = (page: Page) => page.locator("#phone");

  test("an incomplete number is explained when the visitor leaves the field, and is not rewritten", async ({ page }) => {
    await openFlightForm(page);
    await phone(page).fill("+1 415");
    await expect(page.locator("#phone-error")).toHaveCount(0); // still in the field
    await page.locator("#firstName").focus();
    await expect(page.locator("#phone-error")).toHaveText("Please enter a valid phone number, including the complete number, so our travel specialist can reach you.");
    await expect(phone(page)).toHaveValue("+1 415");
    await expect(phone(page)).toHaveAttribute("aria-invalid", "true");
  });

  test("too many digits, a country code that does not exist, and a number the country's plan does not allow each get a specific message", async ({ page }) => {
    await openFlightForm(page);
    await phone(page).fill("+1 415 570 9267 123");
    await page.locator("#firstName").focus();
    await expect(page.locator("#phone-error")).toContainText("too many digits");
    await phone(page).fill("+999 123 456 789");
    await page.locator("#firstName").focus();
    await expect(page.locator("#phone-error")).toContainText("country code");
    await phone(page).fill("+44 20 7946 095");
    await page.locator("#firstName").focus();
    await expect(page.locator("#phone-error")).toContainText("valid phone number for");
  });

  test("a valid number from any country clears the message while typing", async ({ page }) => {
    await openFlightForm(page);
    await phone(page).fill("+1 415");
    await page.locator("#firstName").focus();
    await expect(page.locator("#phone-error")).toHaveCount(1);
    for (const valid of ["+14155709267", "+442079460958", "+4930123456", "+998901234567", "+81312345678"]) {
      await phone(page).fill("+1 415");
      await page.locator("#firstName").focus();
      await expect(page.locator("#phone-error")).toHaveCount(1);
      await phone(page).fill(valid);
      await expect(page.locator("#phone-error"), valid).toHaveCount(0);
    }
  });

  test("moving between the country list and the number is not 'leaving the field'", async ({ page }) => {
    await openFlightForm(page);
    await phone(page).fill("+1 415");
    await page.locator("#field-phone select").focus();
    await expect(page.locator("#phone-error")).toHaveCount(0);
    await phone(page).focus();
    await expect(page.locator("#phone-error")).toHaveCount(0);
  });

  test("submitting with an invalid number sends nothing and keeps the number", async ({ page }) => {
    const submissions = watchSubmissions(page);
    await openFlightForm(page);
    await page.locator("#firstName").fill("Jane");
    await page.locator("#lastName").fill("Traveller");
    await page.locator("#email").fill("jane@example.com");
    await phone(page).fill("+1 415 570 9267 123");
    await page.locator("form:has(#phone) button[type=submit]").click();
    await expect(page.locator("#phone-error")).toBeVisible();
    expect(submissions).toHaveLength(0);
    await expect(phone(page)).toHaveValue(/4155709267123/); // every digit is still there
  });
});

test.describe("the contact form uses the same checks", () => {
  test("email and phone messages appear on leaving the fields; the form's own wording is kept", async ({ page }) => {
    await page.route("**/api/visitor-hint", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await page.goto("/contact");
    await dismissCookieBanner(page);
    await page.locator(".PhoneInput").first().waitFor({ timeout: 30000 });
    await page.locator("#c-email").fill("jane@@example.com");
    await page.locator("#c-firstName").focus();
    await expect(page.locator("#c-email-error")).toContainText("Please enter a valid email address.");
    await expect(page.locator("#c-email-error")).toContainText("only contain one @");
    await page.locator("#c-phone").fill("+49 1");
    await page.locator("#c-firstName").focus();
    await expect(page.locator("#c-phone-error")).toHaveText("Please enter a valid phone number, including the complete number.");
    await page.locator("#c-email").fill("jane@example.com");
    await expect(page.locator("#c-email-error")).toHaveCount(0);
  });
});

// ---- the 11-month limit in the calendars ------------------------------------------------------------------------------------------------------

function trigger(page: Page, label: "Departure Date" | "Return Date") {
  return page.getByRole("button", { name: new RegExp(`^${label}`) });
}
function calendar(page: Page, label: "Departure Date" | "Return Date") {
  return page.getByRole("dialog", { name: label });
}

/** Opens a calendar and pages forward until the "next month" button stops; returns the last month shown. */
async function goToLastMonth(page: Page, label: "Departure Date" | "Return Date"): Promise<{ dialog: Locator; monthsShown: number; caption: string }> {
  await trigger(page, label).click();
  const dialog = calendar(page, label);
  await expect(dialog).not.toHaveAttribute("inert", "");
  await expect(dialog.locator(".rdp-day_button").first()).toBeAttached();
  const next = dialog.locator("button.rdp-button_next");
  let monthsShown = 1;
  for (let i = 0; i < 20; i++) {
    if (await next.isDisabled()) break;
    await next.click();
    monthsShown++;
  }
  const caption = (await dialog.locator(".rdp-caption_label").first().innerText()).trim();
  return { dialog, monthsShown, caption };
}

const dayButton = (dialog: Locator, day: number) => dialog.locator(".rdp-day_button", { hasText: new RegExp(`^${day}$`) }).first();

for (const scenario of [
  { today: new Date(2026, 10, 15, 12), lastMonth: /October 2027/, lastEnabled: 15, firstDisabled: 16, months: 12, note: "Oct 15, 2027" },
  { today: new Date(2027, 2, 31, 12), lastMonth: /February 2028/, lastEnabled: 29, firstDisabled: undefined, months: 12, note: "Feb 29, 2028" }, // leap year: the limit is the 29th, the month has no 30th
  { today: new Date(2028, 2, 31, 12), lastMonth: /February 2029/, lastEnabled: 28, firstDisabled: undefined, months: 12, note: "Feb 28, 2029" }, // ordinary February
  { today: new Date(2026, 11, 31, 12), lastMonth: /November 2027/, lastEnabled: 30, firstDisabled: undefined, months: 12, note: "Nov 30, 2027" }, // year transition, 31 Dec
]) {
  test.describe(`calendars stop at today + 11 months (today = ${scenario.today.toDateString()})`, () => {
    test("departure calendar: the last month, the last enabled day and the first disabled one", async ({ page }) => {
      await page.clock.setFixedTime(scenario.today);
      await openFlightForm(page);
      const { dialog, monthsShown, caption } = await goToLastMonth(page, "Departure Date");
      expect(monthsShown).toBe(scenario.months); // this month + 11 more: never 11 and never 13
      expect(caption).toMatch(scenario.lastMonth);
      await expect(dayButton(dialog, scenario.lastEnabled)).toBeEnabled();
      if (scenario.firstDisabled) await expect(dayButton(dialog, scenario.firstDisabled)).toBeDisabled();
      await expect(dialog.getByText(`Flights can be requested until ${scenario.note}.`)).toBeVisible();
      // The last enabled day really can be chosen.
      await dayButton(dialog, scenario.lastEnabled).click();
      await expect(dialog).toHaveAttribute("inert", "");
      await expect(trigger(page, "Departure Date")).toContainText(String(scenario.lastEnabled));
    });

    test("return calendar: the same limit", async ({ page }) => {
      await page.clock.setFixedTime(scenario.today);
      await openFlightForm(page);
      const { dialog, monthsShown, caption } = await goToLastMonth(page, "Return Date");
      expect(monthsShown).toBe(scenario.months);
      expect(caption).toMatch(scenario.lastMonth);
      await expect(dayButton(dialog, scenario.lastEnabled)).toBeEnabled();
      if (scenario.firstDisabled) await expect(dayButton(dialog, scenario.firstDisabled)).toBeDisabled();
    });
  });
}

test("the first month offers no day before today, and today itself is selectable", async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 10, 15, 12));
  await openFlightForm(page);
  await trigger(page, "Departure Date").click();
  const dialog = calendar(page, "Departure Date");
  await expect(dialog.locator(".rdp-day_button").first()).toBeAttached();
  await expect(dayButton(dialog, 14)).toBeDisabled();
  await expect(dayButton(dialog, 15)).toBeEnabled();
});

test("a keyboard user can reach and choose the last allowed day, and cannot go beyond it", async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 10, 15, 12));
  await openFlightForm(page);
  const { dialog } = await goToLastMonth(page, "Departure Date");
  await dayButton(dialog, 15).focus();
  await page.keyboard.press("ArrowRight"); // the 16th is disabled: focus must not move onto a day that cannot be chosen
  await page.keyboard.press("Enter");
  await expect(trigger(page, "Departure Date")).not.toContainText("Oct 16");
});
