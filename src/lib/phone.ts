// The "min" metadata build, not the package root (which resolves to "max").
// react-phone-number-input (see PhoneNumberField.tsx) already uses "min"
// internally by default — importing the bare package here shipped a SEPARATE
// ~158KB "max" metadata set alongside that ~84KB "min" one already in the
// bundle, duplicating the same underlying phone-number database in two
// different sizes. "min" omits only auxiliary data (example numbers,
// alternate formats) that parsing/validation don't use — isValid() accuracy
// is unaffected. Verified identical accept/reject and E.164 output between
// the two metadata sets across 20 real-world and malformed numbers spanning
// the US, UK, China, France, Japan, India, Australia, UAE, Germany, South
// Korea, South Africa, Hong Kong, and Singapore before making this change.
import { parsePhoneNumberFromString, validatePhoneNumberLength, type CountryCode } from "libphonenumber-js/min";

export type ParsedPhone = {
  e164: string;
  country: CountryCode | undefined;
  callingCode: string;
  nationalNumber: string;
};

// Mirrors the CRM's own normalizePhoneNumber (src/lib/phone.ts in the CRM
// app): E.164 is the canonical stored form so a lead created here matches
// the same Contact the CRM would find by phone.
export function normalizePhoneNumber(raw: string, defaultCountry?: CountryCode): ParsedPhone | null {
  const parsed = parsePhoneNumberFromString(raw, defaultCountry);
  if (!parsed || !parsed.isValid()) return null;
  return {
    e164: parsed.number,
    country: parsed.country,
    callingCode: parsed.countryCallingCode,
    nationalNumber: parsed.nationalNumber,
  };
}

export function isValidPhoneNumber(raw: string, defaultCountry?: CountryCode): boolean {
  return checkPhoneNumber(raw, defaultCountry).ok;
}

// ---- Why a number was refused ----------------------------------------------------------------------------------------------------------------
//
// libphonenumber-js separates four things, and this module keeps them apart:
//   possible  - the digit COUNT fits some number type of the country (validatePhoneNumberLength)
//   valid     - the number matches the country's numbering plan: country calling code, length AND a prefix/area code in use (isValid())
//   assigned  - a subscriber actually holds it            -> NOT knowable from a numbering plan; never claimed
//   reachable - it can receive calls or SMS               -> NOT knowable without calling it; never claimed
// So "ok" below means VALID in the numbering-plan sense only. It says nothing about whether the visitor owns the number or can be reached on it.

export type PhoneProblem =
  | "empty"
  | "not_a_number" // letters or other characters that are not part of a phone number
  | "needs_country" // national format with no country chosen and no "+"
  | "invalid_country_code" // "+999..." - no such country calling code
  | "too_short" // fewer digits than any number of the country has (including "+49" alone): incomplete
  | "too_long"
  | "invalid_length" // a length no number of the country has, though neither too short nor too long overall
  | "invalid_for_country"; // plausible length, but not a number the country's plan allows (unused area code / prefix)

export type PhoneCheck =
  | { ok: true; e164: string; country: CountryCode | undefined; callingCode: string; nationalNumber: string }
  | { ok: false; problem: PhoneProblem; country?: CountryCode; callingCode?: string };

// Digits, spaces and the usual separators, with an optional leading "+" (or "00" typed by hand, which libphonenumber does not treat as "+"
// unless a default country is known - handled below). Letters (vanity numbers, "ext") and anything else are refused.
const PHONE_CHARS_RE = /^\+?[\d\s().\-/]+$/;

export function checkPhoneNumber(raw: string, defaultCountry?: CountryCode): PhoneCheck {
  const candidate = raw.trim();
  if (!candidate) return { ok: false, problem: "empty" };
  if (!PHONE_CHARS_RE.test(candidate)) return { ok: false, problem: "not_a_number" };
  // "00" is the international call prefix in most of the world ("0044 20 ..." = "+44 20 ..."). libphonenumber only knows it once a country is
  // chosen, so without one it is read as "+" - an interpretation, not an edit: the visitor's text is never changed in the field.
  const text = defaultCountry || !/^00\s*\d/.test(candidate) ? candidate : "+" + candidate.slice(2).trimStart();
  if (!text.startsWith("+") && !defaultCountry) return { ok: false, problem: "needs_country" };

  const length = validatePhoneNumberLength(text, defaultCountry);
  if (length === "INVALID_COUNTRY") return { ok: false, problem: "invalid_country_code", country: defaultCountry };
  if (length === "NOT_A_NUMBER") return { ok: false, problem: "not_a_number" };
  if (length === "TOO_SHORT") return { ok: false, problem: "too_short", country: defaultCountry };
  if (length === "TOO_LONG") return { ok: false, problem: "too_long", country: defaultCountry };
  if (length === "INVALID_LENGTH") return { ok: false, problem: "invalid_length", country: defaultCountry };

  const parsed = parsePhoneNumberFromString(text, defaultCountry);
  if (!parsed) return { ok: false, problem: "not_a_number" };
  if (!parsed.isValid()) return { ok: false, problem: "invalid_for_country", country: parsed.country ?? defaultCountry, callingCode: parsed.countryCallingCode };
  return { ok: true, e164: parsed.number, country: parsed.country, callingCode: parsed.countryCallingCode, nationalNumber: parsed.nationalNumber };
}

function countryName(country: CountryCode | undefined): string | undefined {
  if (!country) return undefined;
  try {
    const name = new Intl.DisplayNames(["en"], { type: "region" }).of(country);
    return name && name !== country ? name : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The visitor-facing text for a problem. `incompleteMessage` is the form's own sentence for a number that is too short or the wrong length
 * (it differs per form and is what the forms have always said); the other problems say something more specific.
 */
export function phoneProblemMessage(check: Extract<PhoneCheck, { ok: false }>, incompleteMessage: string, requiredMessage = "Phone number is required"): string {
  switch (check.problem) {
    case "empty":
      return requiredMessage;
    case "too_short":
    case "invalid_length":
      return incompleteMessage;
    case "too_long":
      return "This phone number has too many digits. Please check the number and enter it again.";
    case "invalid_country_code":
      return "We don't recognise that country code. Please check the number or choose your country.";
    case "not_a_number":
      return "A phone number can only contain digits, spaces, dashes and brackets, and may start with +.";
    case "needs_country":
      return "Please choose your country, or start the number with + and the country code.";
    case "invalid_for_country": {
      // The country when it is known (one country uses this calling code, or the visitor chose one); otherwise the calling code itself ("+44" is
      // shared by several territories, so naming just one of them would be a guess).
      const where = countryName(check.country) ?? (check.callingCode ? `+${check.callingCode}` : undefined);
      return where
        ? `This doesn't look like a valid phone number for ${where}. Please check the number, including the area code.`
        : "This doesn't look like a valid phone number. Please check the number, including the area code.";
    }
  }
}
