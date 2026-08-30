import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

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
  return normalizePhoneNumber(raw, defaultCountry) !== null;
}
