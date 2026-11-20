import { test, expect } from "@playwright/test";
import type { CountryCode } from "libphonenumber-js/min";
import { checkPhoneNumber, phoneProblemMessage, isValidPhoneNumber, type PhoneProblem } from "../src/lib/phone";

// International phone validation (src/lib/phone.ts, libphonenumber-js "min" metadata). "Valid" here means VALID IN THE NUMBERING PLAN: a real country
// calling code, a length the country's numbers have, and a prefix/area code that country uses. It does NOT mean the number is assigned to anyone, can
// receive calls or SMS, or belongs to the visitor - a numbering plan cannot know that, and nothing on the site claims it.

type Case = { label: string; input: string; country?: CountryCode; e164: string };

const VALID: Case[] = [
  { label: "US, international format", input: "+1 415 570 9267", e164: "+14155709267" },
  { label: "US, brackets and dashes", input: "+1 (415) 570-9267", e164: "+14155709267" },
  { label: "US, national format with the country chosen", input: "(415) 570-9267", country: "US", e164: "+14155709267" },
  { label: "Canada (+1, different country)", input: "+1 416 555 0123", e164: "+14165550123" },
  { label: "Germany, Berlin landline", input: "+49 30 123456", e164: "+4930123456" },
  { label: "Germany, mobile (11 digits)", input: "+49 151 12345678", e164: "+4915112345678" },
  { label: "Germany, national format", input: "030 123456", country: "DE", e164: "+4930123456" },
  { label: "United Kingdom, London", input: "+44 20 7946 0958", e164: "+442079460958" },
  { label: "United Kingdom, national format", input: "020 7946 0958", country: "GB", e164: "+442079460958" },
  { label: "France, mobile", input: "+33 6 12 34 56 78", e164: "+33612345678" },
  { label: "Uzbekistan, mobile", input: "+998 90 123 45 67", e164: "+998901234567" },
  { label: "Japan, Tokyo", input: "+81 3 1234 5678", e164: "+81312345678" },
  { label: "China, mobile (11 digits)", input: "+86 138 1234 5678", e164: "+8613812345678" },
  { label: "United Arab Emirates, mobile", input: "+971 50 123 4567", e164: "+971501234567" },
  { label: "India, mobile (10 digits)", input: "+91 98765 43210", e164: "+919876543210" },
  { label: "Australia, mobile", input: "+61 412 345 678", e164: "+61412345678" },
  { label: "Brazil, mobile (11 digits)", input: "+55 11 91234 5678", e164: "+5511912345678" },
  { label: "'00' international prefix with no country chosen", input: "00 44 20 7946 0958", e164: "+442079460958" },
];

test.describe("valid numbers become one consistent international form", () => {
  for (const c of VALID) {
    test(c.label, () => {
      const result = checkPhoneNumber(c.input, c.country);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.e164).toBe(c.e164);
      expect(isValidPhoneNumber(c.input, c.country)).toBe(true);
    });
  }
});

type Bad = { label: string; input: string; country?: CountryCode; problem: PhoneProblem };
const INVALID: Bad[] = [
  { label: "empty", input: "", problem: "empty" },
  { label: "only spaces", input: "   ", problem: "empty" },
  { label: "letters", input: "abc", problem: "not_a_number" },
  { label: "digits with letters", input: "+1 415 abc 9267", problem: "not_a_number" },
  { label: "vanity number", input: "+1 800 FLOWERS", problem: "not_a_number" },
  { label: "a bare plus", input: "+", problem: "not_a_number" },
  { label: "symbols", input: "+1 415 570 9267 #", problem: "not_a_number" },
  { label: "national format with no country chosen", input: "415 570 9267", problem: "needs_country" },
  { label: "country code only", input: "+49", problem: "too_short" },
  { label: "US: area code only", input: "+1 415", problem: "too_short" },
  { label: "Germany: far too short", input: "+49 1", problem: "too_short" },
  { label: "US: one digit short", input: "+1 415 570 926", problem: "too_short" },
  { label: "US: too long", input: "+1 415 570 9267 123", problem: "too_long" },
  { label: "Germany: too long", input: "+49 151 1234567890123", problem: "too_long" },
  { label: "a country calling code that does not exist", input: "+999 123 456 789", problem: "invalid_country_code" },
  { label: "UK: right length, but not a number the plan allows", input: "+44 20 7946 095", problem: "invalid_for_country" },
  { label: "US: area code 000 / exchange 000 is not assigned in the plan", input: "+1 000 000 0000", problem: "invalid_for_country" },
  { label: "national format that is too short for the chosen country", input: "123", country: "GB", problem: "too_short" },
];

test.describe("invalid numbers are refused with a reason", () => {
  for (const c of INVALID) {
    test(`${c.label} -> ${c.problem}`, () => {
      const result = checkPhoneNumber(c.input, c.country);
      expect(result.ok, JSON.stringify(c.input)).toBe(false);
      if (!result.ok) expect(result.problem, JSON.stringify(c.input)).toBe(c.problem);
      expect(isValidPhoneNumber(c.input, c.country), JSON.stringify(c.input)).toBe(false);
    });
  }

  test("the same digits are judged by the country they are given under (changing the country changes the verdict)", () => {
    // 212 555 1234 is a valid US number but not a valid German one.
    expect(checkPhoneNumber("+1 212 555 1234").ok).toBe(true);
    const german = checkPhoneNumber("+49 212 555 1234");
    expect(german.ok).toBe(true); // 212 is the Solingen area code - this one is genuinely valid in Germany too
    // 415 570 9267 is a valid US number. Put under other country codes the same digits are refused by some plans (+44, +33, +81, +971, +998 ...)...
    expect(checkPhoneNumber("+1 415 570 9267").ok).toBe(true);
    for (const calling of ["44", "33", "81", "971", "998", "34"]) expect(checkPhoneNumber(`+${calling} 415 570 9267`).ok, `+${calling}`).toBe(false);
    // ... but are a perfectly VALID number under others (+49, +86, +91, +55). That is why the form tells the visitor when they change the country
    // of a number they already typed: validity alone cannot tell "the right number" from "the same digits under another country".
    for (const calling of ["49", "86", "91", "55"]) expect(checkPhoneNumber(`+${calling} 415 570 9267`).ok, `+${calling}`).toBe(true);
  });
});

test.describe("messages", () => {
  const INCOMPLETE = "Please enter a valid phone number, including the complete number, so our travel specialist can reach you.";
  const message = (input: string, country?: CountryCode) => {
    const result = checkPhoneNumber(input, country);
    if (result.ok) return undefined;
    return phoneProblemMessage(result, INCOMPLETE);
  };

  test("an incomplete number keeps the sentence each form has always shown", () => {
    expect(message("+1415")).toBe(INCOMPLETE);
    expect(message("+49")).toBe(INCOMPLETE);
  });

  test("other problems say something specific", () => {
    expect(message("+1 415 570 9267 123")).toMatch(/too many digits/);
    expect(message("+999 123 456 789")).toMatch(/country code/);
    expect(message("abc")).toMatch(/digits, spaces, dashes and brackets/);
    expect(message("415 570 9267")).toMatch(/choose your country/);
    expect(message("+44 20 7946 095")).toMatch(/valid phone number for (United Kingdom|\+44)\./);
    expect(message("+81 415 570 9267")).toMatch(/valid phone number for Japan\./); // one country uses +81, so it is named
  });

  test("the required message is the form's own", () => {
    const result = checkPhoneNumber("");
    expect(!result.ok && phoneProblemMessage(result, INCOMPLETE, "Phone number is required.")).toBe("Phone number is required.");
  });

  test("no message claims the number is assigned, reachable or verified", () => {
    for (const input of ["+1415", "abc", "+999 1", "+44 20 7946 095", "415 570 9267", "+1 415 570 9267 123"]) {
      expect(message(input) ?? "").not.toMatch(/reachable|verified|exists|belongs to you|working/i);
    }
  });
});
