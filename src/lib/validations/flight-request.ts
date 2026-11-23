import { z } from "zod";
import { TRIP_TYPES, CABIN_CLASSES, BUDGET_CURRENCIES, DATE_FLEXIBILITY_DAYS } from "./flight-request-options";
import { checkEmail, emailProblemMessage } from "@/lib/email-validation";
import { PAST_MESSAGE, TOO_FAR_MESSAGE, dateProblem, parseIsoDate, serverDateWindow } from "@/lib/flight-date-window";

// Shared between the client form (react-hook-free controlled state, see
// components/flight-form/FlightRequestForm.tsx) and the server action
// (server/actions/submit-flight-request.ts). The server re-validates
// everything here regardless of what client-side checks already passed —
// FormData/JSON from the client is always untrusted.
//
// TRIP_TYPES/CABIN_CLASSES live in flight-request-options.ts (no zod
// import) and are re-exported here so this stays the one canonical import
// path for server code and for types — but client components that only
// need those two constants should import them from flight-request-options
// directly (see the comment there) rather than from this file, or they'll
// pull the zod schema below into their bundle for nothing.
export { TRIP_TYPES, CABIN_CLASSES };

export const airportSchema = z.object({
  // Exactly 3 letters, nothing else — a real IATA code is always this shape.
  // `.length(3)` alone would accept any 3 code units, including a literal
  // CR/LF (e.g. "A\nB"); a multi-city request's later segments reach the
  // notification email's Subject line with this value (see
  // src/lib/email/flight-request-notification.ts), so this is also what
  // keeps a crafted code from injecting a raw newline into an email header.
  iata: z.string().regex(/^[A-Za-z]{3}$/, "Enter a valid 3-letter airport code").toUpperCase(),
  // Bounded: a multi-city request's later segments are client-supplied
  // objects (only segment 0 is re-looked-up in our own airport data), and
  // these strings flow into the notification email and the Lead's notes.
  // The longest real value in src/data/airports.json is 90 characters.
  city: z.string().min(1).max(120),
  name: z.string().min(1).max(120),
  country: z.string().min(1).max(120),
});
export type AirportOption = z.infer<typeof airportSchema>;

// The date rules. A date is a plain "YYYY-MM-DD" string compared with other such strings - deliberately NOT a Date object: `new Date("2026-08-30")`
// parses as UTC midnight while a Date floored with setHours(0,0,0,0) is LOCAL midnight, and comparing those two made every same-day departure
// fail "cannot be in the past" for any server time zone behind UTC. Comparing calendar dates sidesteps the mismatch.
//
// The window is src/lib/flight-date-window.ts: from today to ELEVEN CALENDAR MONTHS after today (the same module the browser's calendar uses).
// The server cannot know the visitor's time zone, so it accepts the widest window any zone could legitimately produce - one day of tolerance
// at each end, see that module - rather than refusing a date the visitor's own calendar offered.
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date").refine((v) => parseIsoDate(v) !== null, "Enter a valid date");

/**
 * The flight-request schema for a given clock. `flightRequestSchema` below is the one the application uses (the real clock); tests build one
 * with a fixed clock to pin the boundaries of the 11-month window exactly.
 */
export function createFlightRequestSchema(now: () => Date = () => new Date()) {
  const segmentSchema = z
    .object({
      from: airportSchema,
      to: airportSchema,
      departureDate: isoDate,
    })
    .refine((s) => s.from.iata !== s.to.iata, {
      message: "Origin and destination must be different",
      path: ["to"],
    })
    .superRefine((s, ctx) => {
      const problem = dateProblem(s.departureDate, serverDateWindow(now()));
      if (problem === "past") ctx.addIssue({ code: "custom", message: PAST_MESSAGE, path: ["departureDate"] });
      else if (problem === "too_far") ctx.addIssue({ code: "custom", message: TOO_FAR_MESSAGE, path: ["departureDate"] });
    });

  return z
    .object({
      tripType: z.enum(TRIP_TYPES),

      // ONE_WAY / ROUND_TRIP: exactly one segment. MULTI_CITY: 2–6 segments.
      segments: z.array(segmentSchema).min(1).max(6),
      returnDate: isoDate.optional(),

      cabinClass: z.enum(CABIN_CLASSES),
      adults: z.number().int().min(1).max(9),
      children: z.number().int().min(0).max(8),
      infants: z.number().int().min(0).max(8),
      // How far the dates can move: exactly one of 0 (exact), 1, 2 or 3 days either side. Optional so a bundle cached from before this choice existed still
      // validates; see resolveDateFlexibility() in flight-request-options.ts for how its absence is read.
      dateFlexibilityDays: z.union([z.literal(DATE_FLEXIBILITY_DAYS[0]), z.literal(DATE_FLEXIBILITY_DAYS[1]), z.literal(DATE_FLEXIBILITY_DAYS[2]), z.literal(DATE_FLEXIBILITY_DAYS[3])]).optional(),
      // LEGACY: what a form bundle from before the four choices sends (a checkbox). The current form never sends it; it is only read when
      // dateFlexibilityDays is absent. Not a second control: nothing in the UI sets it.
      flexibleDates: z.boolean().optional(),
      preferredAirline: z.string().max(120).optional().or(z.literal("")),
      budget: z.number().positive().max(1_000_000).optional(),
      // The currency the customer chose for `budget` — never converted. Optional
      // so an older cached client (whose label said USD) still validates.
      budgetCurrency: z.enum(BUDGET_CURRENCIES).optional(),
      notes: z.string().max(2000).optional().or(z.literal("")),

      firstName: z.string().trim().min(1, "First name is required").max(80),
      lastName: z.string().trim().min(1, "Last name is required").max(80),
      // The shared syntax rules (src/lib/email-validation.ts), with a specific hint. Syntax only: nothing here (or anywhere on this site)
      // proves the mailbox exists or belongs to the visitor.
      email: z
        .string()
        .trim()
        .max(200, "Please enter a valid email address so our travel specialist can contact you about your flight request. The address is too long.")
        .superRefine((value, ctx) => {
          const result = checkEmail(value);
          if (!result.ok) {
            ctx.addIssue({
              code: "custom",
              message: emailProblemMessage(result.problem, "Please enter a valid email address so our travel specialist can contact you about your flight request."),
            });
          }
        }),
      phone: z
        .string()
        .trim()
        .min(4, "Please enter a valid phone number, including the complete number, so our travel specialist can reach you.")
        .max(30),

      // Spam protection: a hidden field real users never fill in, plus the
      // client-recorded time the form first rendered so we can reject
      // submissions that arrive implausibly fast for a human. Both re-checked
      // server-side in submit-flight-request.ts.
      website: z.string().max(0, "").optional().or(z.literal("")),
      renderedAt: z.number().optional(),

      // One random UUID per mounted form, reused by every attempt of the same
      // submission; the server action sends it to the CRM as the Idempotency-Key
      // (see src/server/actions/submit-flight-request.ts). Optional so an older
      // cached client bundle, or a caller without one, still works — it then gets
      // a fresh key per call (retry protection within that call only). Strictly a
      // UUID: the CRM derives the lead's primary key from it.
      submissionId: z.string().uuid().optional(),
    })
    .refine((v) => v.tripType !== "MULTI_CITY" || v.segments.length >= 2, {
      message: "Add at least two flights for a multi-city trip",
      path: ["segments"],
    })
    .refine((v) => v.tripType === "MULTI_CITY" || v.segments.length === 1, {
      message: "Only one flight is expected for this trip type",
      path: ["segments"],
    })
    .refine((v) => v.tripType !== "ROUND_TRIP" || !!v.returnDate, {
      message: "Return date is required for round trips",
      path: ["returnDate"],
    })
    .refine((v) => !v.returnDate || v.returnDate >= v.segments[0]?.departureDate, {
      message: "Return date must be on or after the departure date",
      path: ["returnDate"],
    })
    // The return date obeys the same latest date as the departure.
    .refine((v) => !v.returnDate || dateProblem(v.returnDate, { min: "0001-01-01", max: serverDateWindow(now()).max }) !== "too_far", {
      message: TOO_FAR_MESSAGE,
      path: ["returnDate"],
    })
    // A multi-city itinerary is in date order: the calendar never offers a date before the previous flight's, and neither does the server accept one.
    .refine((v) => v.segments.every((seg, i) => i === 0 || seg.departureDate >= v.segments[i - 1].departureDate), {
      message: "Each flight must be on or after the previous one",
      path: ["segments"],
    })
    .refine((v) => v.adults + v.children + v.infants <= 9, {
      message: "For groups larger than 9 travelers, please contact us directly",
      path: ["adults"],
    })
    .refine((v) => v.infants <= v.adults, {
      message: "Each infant must be accompanied by an adult",
      path: ["infants"],
    });
}

export const flightRequestSchema = createFlightRequestSchema();

export type FlightRequestInput = z.infer<typeof flightRequestSchema>;
