// Plain runtime constants the client-side flight form needs (trip type and
// cabin class options) — deliberately split out of flight-request.ts, which
// also builds the full Zod validation schema. Zod (plus every `.refine()`
// call in that schema) has no reason to ship to the browser: only the
// server action actually validates with it. But because flight-request.ts
// imports `zod` at its top level, any client component that imported even
// a single plain value from that file (e.g. TRIP_TYPES) pulled the entire
// module — zod included — into the client bundle, since bundlers can't
// safely tree-shake past `z.object(...).refine(...)` calls, which look
// like they could have side effects. That was measured as ~2.4s of a
// single chunk's script execution in a production Lighthouse run.
// This file has zero dependencies, so importing from it (instead of from
// flight-request.ts) can't pull zod in. flight-request.ts re-exports these
// same two constants so the server/schema side of the app still has one
// canonical import path.
export const TRIP_TYPES = ["ONE_WAY", "ROUND_TRIP", "MULTI_CITY"] as const;
export const CABIN_CLASSES = ["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS", "FIRST"] as const;

// ISO 4217 codes offered next to the budget field. The customer's chosen
// currency is preserved end to end (internal email, CRM) and the amount is
// never converted — "AUD 8,000" is shown as AUD, not as a dollar figure.
export const BUDGET_CURRENCIES = [
  "USD", "EUR", "GBP", "AUD", "CAD", "NZD", "CHF", "AED", "SAR", "QAR", "INR", "PKR",
  "SGD", "HKD", "JPY", "KRW", "CNY", "THB", "MYR", "ZAR", "TRY", "BRL", "MXN", "EGP",
] as const;
export type BudgetCurrency = (typeof BUDGET_CURRENCIES)[number];
export const DEFAULT_BUDGET_CURRENCY: BudgetCurrency = "USD";

// How far the customer can move the dates, as the number of days either side of the chosen ones. 0 = exact dates. These four are the ONLY
// values: one mutually exclusive choice (a radio group in the form), never a free number and never a second control. The same value travels to the
// CRM as `dateFlexibilityDays` (0-3), next to the `datesFlexible` Boolean the CRM has always had (true for 1-3), so nothing is reduced to a Boolean.
export const DATE_FLEXIBILITY_DAYS = [0, 1, 2, 3] as const;
export type DateFlexibilityDays = (typeof DATE_FLEXIBILITY_DAYS)[number];
export const DEFAULT_DATE_FLEXIBILITY_DAYS: DateFlexibilityDays = 0;

/** What the customer sees for each choice (the form) and what the team sees in the internal e-mail. */
export const DATE_FLEXIBILITY_LABEL: Record<DateFlexibilityDays, string> = {
  0: "Exact dates",
  1: "± 1 day",
  2: "± 2 days",
  3: "± 3 days",
};

/** One sentence for the internal e-mail and the confirmation summary: the choice in words, never a bare Yes/No. */
export function describeDateFlexibility(days: DateFlexibilityDays | null): string {
  if (days === null) return "Flexible (the number of days was not stated)";
  if (days === 0) return "Exact dates (no flexibility)";
  return `± ${days} day${days === 1 ? "" : "s"} around the chosen dates`;
}

/**
 * The ONE place that turns what a request carries into the flexibility the rest of the system uses. A current form sends `dateFlexibilityDays` (0-3).
 * A form bundle cached in a visitor's tab from before the four choices existed can only send the old `flexibleDates` Boolean: `true` is kept as "flexible,
 * number of days not stated" (days = null, never invented), `false` as exact dates. `days` is therefore null ONLY for that legacy "flexible" case.
 */
export function resolveDateFlexibility(input: { dateFlexibilityDays?: DateFlexibilityDays | undefined; flexibleDates?: boolean | undefined }): { flexible: boolean; days: DateFlexibilityDays | null } {
  if (input.dateFlexibilityDays !== undefined) return { flexible: input.dateFlexibilityDays > 0, days: input.dateFlexibilityDays };
  if (input.flexibleDates === true) return { flexible: true, days: null };
  return { flexible: false, days: 0 };
}
