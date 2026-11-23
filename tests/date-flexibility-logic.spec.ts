import { test, expect } from "@playwright/test";
import { createFlightRequestSchema, flightRequestSchema, type FlightRequestInput } from "../src/lib/validations/flight-request";
import { DATE_FLEXIBILITY_DAYS, DATE_FLEXIBILITY_LABEL, describeDateFlexibility, resolveDateFlexibility } from "../src/lib/validations/flight-request-options";
import { buildFlightInquiryBody } from "../src/lib/crm-api/flight-inquiry";
import { buildFlightRequestNotificationEmail, type FlightRequestNotificationInput } from "../src/lib/email/flight-request-notification";

// Date flexibility: exactly one of "Exact dates", "± 1 day", "± 2 days", "± 3 days", chosen in the "Add preferences (airline, budget, notes)" section and carried,
// as that choice (not as a Boolean), to the CRM and to the internal e-mail. This file is the PURE half (schema, mapping, e-mail): no browser and no server, so the CI workflow runs it. The form's own
// behaviour is tests/date-flexibility.spec.ts; the whole path through a real server to a stand-in CRM is tests/date-flexibility-e2e.spec.ts.
const futureDate = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const JFK = { iata: "JFK", city: "New York", country: "United States", name: "John F. Kennedy International Airport" };
const CDG = { iata: "CDG", city: "Paris", country: "France", name: "Paris Charles de Gaulle Airport" };

function raw(extra: Record<string, unknown> = {}) {
  return {
    tripType: "ONE_WAY",
    segments: [{ from: JFK, to: CDG, departureDate: futureDate(30) }],
    cabinClass: "BUSINESS",
    adults: 1,
    children: 0,
    infants: 0,
    firstName: "Dana",
    lastName: "Flex",
    email: "dana.flex@example.org",
    phone: "+14155552671",
    website: "",
    ...extra,
  };
}
const parse = (extra: Record<string, unknown> = {}): FlightRequestInput => flightRequestSchema.parse(raw(extra));

test.describe("the schema accepts exactly the four choices", () => {
  for (const days of DATE_FLEXIBILITY_DAYS) {
    test(`${days} is accepted and preserved`, () => {
      expect(parse({ dateFlexibilityDays: days }).dateFlexibilityDays).toBe(days);
    });
  }
  for (const bad of [4, -1, 1.5, "2", null, true, 10, Number.NaN]) {
    test(`${typeof bad} ${String(bad)} is refused`, () => {
      expect(createFlightRequestSchema().safeParse(raw({ dateFlexibilityDays: bad })).success).toBe(false);
    });
  }
  test("absent is accepted (a form bundle from before the choice existed)", () => {
    expect(parse().dateFlexibilityDays).toBeUndefined();
  });
});

test.describe("what the request means (one resolver for the CRM body, the e-mail and the confirmation)", () => {
  test("a chosen number wins, and flexible means 1-3", () => {
    expect(resolveDateFlexibility({ dateFlexibilityDays: 0 })).toEqual({ flexible: false, days: 0 });
    for (const d of [1, 2, 3] as const) expect(resolveDateFlexibility({ dateFlexibilityDays: d })).toEqual({ flexible: true, days: d });
    expect(resolveDateFlexibility({ dateFlexibilityDays: 0, flexibleDates: true })).toEqual({ flexible: false, days: 0 }); // the explicit choice beats a stale flag
  });
  test("a cached old form's checkbox is kept honestly: flexible with NO invented number, or exact dates", () => {
    expect(resolveDateFlexibility({ flexibleDates: true })).toEqual({ flexible: true, days: null });
    expect(resolveDateFlexibility({ flexibleDates: false })).toEqual({ flexible: false, days: 0 });
    expect(resolveDateFlexibility({})).toEqual({ flexible: false, days: 0 });
  });
  test("the words used for each choice", () => {
    expect(DATE_FLEXIBILITY_DAYS.map((d) => DATE_FLEXIBILITY_LABEL[d])).toEqual(["Exact dates", "± 1 day", "± 2 days", "± 3 days"]);
    expect(describeDateFlexibility(0)).toBe("Exact dates (no flexibility)");
    expect(describeDateFlexibility(1)).toBe("± 1 day around the chosen dates");
    expect(describeDateFlexibility(3)).toBe("± 3 days around the chosen dates");
    expect(describeDateFlexibility(null)).toMatch(/not stated/);
  });
});

test.describe("the CRM body carries the choice, never only a Boolean", () => {
  for (const days of DATE_FLEXIBILITY_DAYS) {
    test(`${DATE_FLEXIBILITY_LABEL[days]}: datesFlexible=${days > 0}, dateFlexibilityDays=${days}`, () => {
      const body = buildFlightInquiryBody(parse({ dateFlexibilityDays: days }), "+14155552671");
      expect(body.datesFlexible).toBe(days > 0);
      expect(body.dateFlexibilityDays).toBe(days);
      expect(body).not.toHaveProperty("flexibleDates");
    });
  }
  test("a legacy 'flexible' request sends datesFlexible=true and NO number; legacy 'not flexible' is exact dates", () => {
    const flexible = buildFlightInquiryBody(parse({ flexibleDates: true }), "+14155552671");
    expect(flexible.datesFlexible).toBe(true);
    expect(flexible).not.toHaveProperty("dateFlexibilityDays");
    const exact = buildFlightInquiryBody(parse({ flexibleDates: false }), "+14155552671");
    expect(exact).toMatchObject({ datesFlexible: false, dateFlexibilityDays: 0 });
  });
  test("the flexibility does not disturb any other field of the body", () => {
    const common = { preferredAirline: "Lufthansa", budget: 3200, budgetCurrency: "EUR", notes: "Window seats", adults: 2, children: 1 };
    const base = buildFlightInquiryBody(parse({ dateFlexibilityDays: 0, ...common }), "+14155552671");
    const flexed = buildFlightInquiryBody(parse({ dateFlexibilityDays: 3, ...common }), "+14155552671");
    const strip = (body: Record<string, unknown>) => Object.fromEntries(Object.entries(body).filter(([key]) => key !== "datesFlexible" && key !== "dateFlexibilityDays"));
    expect(strip(flexed)).toEqual(strip(base));
    expect(strip(base)).toMatchObject({ preferredAirline: "Lufthansa", approximateBudget: 3200, budgetCurrency: "EUR", additionalNotes: "Window seats", adults: 2, children: 1 });
  });
});

test.describe("the internal e-mail states the choice in words", () => {
  const BASE = {
    firstName: "Dana",
    lastName: "Flex",
    email: "dana.flex@example.org",
    phoneE164: "+14155552671",
    tripType: "ONE_WAY",
    cabinClass: "BUSINESS",
    adults: 1,
    children: 0,
    infants: 0,
    flexibleDates: false,
    segments: [{ from: JFK, to: CDG, departureDate: "2027-03-10" }],
    submittedAt: new Date("2026-11-20T10:00:00Z"),
    submission: { ip: null, location: undefined, locationSource: undefined },
  } as unknown as FlightRequestNotificationInput;
  for (const days of DATE_FLEXIBILITY_DAYS) {
    test(`${DATE_FLEXIBILITY_LABEL[days]}`, () => {
      const { html, text } = buildFlightRequestNotificationEmail({ ...BASE, flexibleDates: days > 0, dateFlexibilityDays: days });
      const sentence = describeDateFlexibility(days);
      expect(text).toContain(`Date Flexibility: ${sentence}`);
      expect(html).toContain("Date Flexibility");
      expect(html).toContain(sentence);
      expect(text).not.toMatch(/Flexible Dates: Yes/);
    });
  }
  test("a legacy flexible request says the number of days was not stated; one with neither shows no row", () => {
    expect(buildFlightRequestNotificationEmail({ ...BASE, flexibleDates: true }).text).toContain("Date Flexibility: Flexible (the number of days was not stated)");
    expect(buildFlightRequestNotificationEmail(BASE).text).not.toContain("Date Flexibility");
  });
});
