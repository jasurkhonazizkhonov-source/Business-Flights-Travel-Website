import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { createFlightRequestSchema } from "../src/lib/validations/flight-request";
import { buildFlightInquiryBody } from "../src/lib/crm-api/flight-inquiry";
import { STUB_ALLOWED_FIELDS } from "./support/stub-crm";

// The website-to-CRM contract as FIXTURES: the bodies this website really sends (built by the real validated-request-to-body code, with a fixed clock so they never change
// by themselves) and the bodies it must never send. The CRM repository carries a byte-identical copy (src/server/__tests__/fixtures/website-flight-inquiry-contract.json) and a
// test that pushes every case through the CRM's REAL validation schema (flightInquiryBase through the route's strict schema and refinements) and checks what would be
// stored. So a change to the payload on either side fails a test on the OTHER side too, instead of failing in production against a CRM that is one release behind.
//
// This spec fails when the committed fixture no longer matches what the code produces. To update it on purpose: BFT_UPDATE_CONTRACT=1 npx playwright test tests/crm-contract-fixtures.spec.ts
// --project=Infrastructure --no-deps, then copy the file to the CRM repository.
const FIXTURE = path.resolve(__dirname, "support", "fixtures", "website-flight-inquiry-contract.json");
const NOW = new Date("2026-11-24T00:00:00Z");
const schema = createFlightRequestSchema(() => NOW);
const JFK = { iata: "JFK", city: "New York", country: "United States", name: "John F. Kennedy International Airport" };
const CDG = { iata: "CDG", city: "Paris", country: "France", name: "Paris Charles de Gaulle Airport" };
const LHR = { iata: "LHR", city: "London", country: "United Kingdom", name: "Heathrow" };
const SIN = { iata: "SIN", city: "Singapore", country: "Singapore", name: "Changi" };
const PHONE = "+14155552671";

const person = { firstName: "Dana", lastName: "Contract", email: "dana.contract@example.org", phone: PHONE, website: "" };
const oneWay = { tripType: "ONE_WAY", segments: [{ from: JFK, to: CDG, departureDate: "2027-03-10" }], cabinClass: "BUSINESS", adults: 1, children: 0, infants: 0, ...person };
const roundTrip = { ...oneWay, tripType: "ROUND_TRIP", returnDate: "2027-03-20", adults: 2, children: 1 };
const multiCity = { ...oneWay, tripType: "MULTI_CITY", segments: [{ from: JFK, to: LHR, departureDate: "2027-03-10" }, { from: LHR, to: SIN, departureDate: "2027-03-15" }, { from: SIN, to: JFK, departureDate: "2027-03-25" }] };
const prefs = { preferredAirline: "Lufthansa", budget: 4200.5, budgetCurrency: "EUR", notes: "Window seats please" };

const ACCEPTED: Array<{ name: string; input: Record<string, unknown> }> = [
  { name: "one way, minimal", input: oneWay },
  { name: "round trip, exact dates chosen", input: { ...roundTrip, dateFlexibilityDays: 0 } },
  { name: "round trip, plus or minus 1 day", input: { ...roundTrip, dateFlexibilityDays: 1 } },
  { name: "round trip, plus or minus 2 days, every preference", input: { ...roundTrip, dateFlexibilityDays: 2, ...prefs } },
  { name: "multi-city, plus or minus 3 days", input: { ...multiCity, dateFlexibilityDays: 3 } },
  { name: "an older cached form: flexible checkbox only (no number is invented)", input: { ...roundTrip, flexibleDates: true } },
  { name: "an older cached form: not flexible checkbox only", input: { ...oneWay, flexibleDates: false } },
];
const REJECTED: Array<{ name: string; body: Record<string, unknown>; why: string }> = [
  { name: "a number above 3", body: { dateFlexibilityDays: 4 }, why: "dateFlexibilityDays" },
  { name: "a negative number", body: { dateFlexibilityDays: -1 }, why: "dateFlexibilityDays" },
  { name: "a fraction", body: { dateFlexibilityDays: 1.5 }, why: "dateFlexibilityDays" },
  { name: "a number sent as text", body: { dateFlexibilityDays: "2" }, why: "dateFlexibilityDays" },
  { name: "exact dates yet flexible", body: { dateFlexibilityDays: 0, datesFlexible: true }, why: "dateFlexibilityDays" },
  { name: "three days yet not flexible", body: { dateFlexibilityDays: 3, datesFlexible: false }, why: "dateFlexibilityDays" },
  { name: "a website-only field", body: { website: "" }, why: "website" },
  { name: "the submission id in the body (it belongs in the header)", body: { submissionId: "abcdefgh12345678" }, why: "submissionId" },
  { name: "a field the CRM owns", body: { status: "BOOKED" }, why: "status" },
];

function build() {
  const accepted = ACCEPTED.map(({ name, input }) => {
    const parsed = schema.parse(input);
    const body = buildFlightInquiryBody(parsed, PHONE);
    const days = body.dateFlexibilityDays;
    return { name, body, expect: { flexibleDates: body.datesFlexible, dateFlexibilityDays: days === undefined ? null : days } };
  });
  const base = accepted[1].body;
  const rejected = REJECTED.map(({ name, body, why }) => ({ name, body: { ...base, ...body }, rejectedBecause: why }));
  return { version: 1, comment: "Generated by tests/crm-contract-fixtures.spec.ts from the website's own code. A byte-identical copy lives in the CRM repository.", accepted, rejected };
}

test.describe("the website-to-CRM contract fixtures", () => {
  test("the committed fixture is exactly what the code produces now", () => {
    const text = JSON.stringify(build(), null, 2) + "\n";
    if (process.env.BFT_UPDATE_CONTRACT === "1") {
      fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
      fs.writeFileSync(FIXTURE, text);
    }
    expect(fs.readFileSync(FIXTURE, "utf8").replace(/\r\n/g, "\n"), "the fixture is stale: run with BFT_UPDATE_CONTRACT=1 and copy it to the CRM repository").toBe(text);
  });

  test("every body the website builds uses only fields on the CRM's allow-list, never a website-only or CRM-owned one, and the flexibility fields agree", () => {
    for (const c of build().accepted) {
      for (const key of Object.keys(c.body)) expect(STUB_ALLOWED_FIELDS as readonly string[], `${c.name}: ${key}`).toContain(key);
      for (const forbidden of ["website", "renderedAt", "submissionId", "companyId", "flexibleDates", "budget", "notes", "status", "source"]) expect(c.body, `${c.name}: ${forbidden}`).not.toHaveProperty(forbidden);
      const body = c.body as { datesFlexible: boolean; dateFlexibilityDays?: number };
      if (body.dateFlexibilityDays !== undefined) expect(body.datesFlexible, c.name).toBe(body.dateFlexibilityDays > 0);
    }
  });

  test("the cached-form cases keep their meaning: flexible without a number, or exact dates", () => {
    const cases = Object.fromEntries(build().accepted.map((c) => [c.name, c]));
    expect(cases["an older cached form: flexible checkbox only (no number is invented)"].body).toMatchObject({ datesFlexible: true });
    expect(cases["an older cached form: flexible checkbox only (no number is invented)"].body).not.toHaveProperty("dateFlexibilityDays");
    expect(cases["an older cached form: flexible checkbox only (no number is invented)"].expect).toEqual({ flexibleDates: true, dateFlexibilityDays: null });
    expect(cases["an older cached form: not flexible checkbox only"].expect).toEqual({ flexibleDates: false, dateFlexibilityDays: 0 });
  });
});
