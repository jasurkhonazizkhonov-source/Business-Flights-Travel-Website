import { z } from "zod";
import { TRIP_TYPES, CABIN_CLASSES } from "./flight-request-options";

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
  iata: z.string().length(3).toUpperCase(),
  city: z.string().min(1),
  name: z.string().min(1),
  country: z.string().min(1),
});
export type AirportOption = z.infer<typeof airportSchema>;

// A plain "YYYY-MM-DD" string for today, in the server's local calendar
// date — deliberately NOT a Date object. `new Date("2026-08-30")` (a
// bare date, no time) parses as UTC midnight, but a Date built from
// today's wall-clock time and floored via setHours(0,0,0,0) is LOCAL
// midnight — for any server timezone behind UTC (the whole Western
// Hemisphere), local midnight is *later* than that same day's UTC
// midnight, so comparing those two Date objects directly made every
// same-day departure date fail with "cannot be in the past", even
// though the date the customer picked was today. Comparing two
// "YYYY-MM-DD" strings directly sidesteps the mismatch entirely — it's
// a plain calendar-date comparison, not a moment-in-time comparison,
// which is what "is this date today or later" actually means here.
const todayIsoDate = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
  .refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid date");

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
  .refine((s) => s.departureDate >= todayIsoDate(), {
    message: "Departure date cannot be in the past",
    path: ["departureDate"],
  });

export const flightRequestSchema = z
  .object({
    tripType: z.enum(TRIP_TYPES),

    // ONE_WAY / ROUND_TRIP: exactly one segment. MULTI_CITY: 2–6 segments.
    segments: z.array(segmentSchema).min(1).max(6),
    returnDate: isoDate.optional(),

    cabinClass: z.enum(CABIN_CLASSES),
    adults: z.number().int().min(1).max(9),
    children: z.number().int().min(0).max(8),
    infants: z.number().int().min(0).max(8),
    flexibleDates: z.boolean().default(false),
    preferredAirline: z.string().max(120).optional().or(z.literal("")),
    budget: z.number().positive().max(1_000_000).optional(),
    notes: z.string().max(2000).optional().or(z.literal("")),

    firstName: z.string().trim().min(1, "First name is required").max(80),
    lastName: z.string().trim().min(1, "Last name is required").max(80),
    email: z
      .string()
      .trim()
      .email("Please enter a valid email address so our travel specialist can contact you about your flight request.")
      .max(200),
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
  .refine((v) => v.adults + v.children + v.infants <= 9, {
    message: "For groups larger than 9 travelers, please contact us directly",
    path: ["adults"],
  })
  .refine((v) => v.infants <= v.adults, {
    message: "Each infant must be accompanied by an adult",
    path: ["infants"],
  });

export type FlightRequestInput = z.infer<typeof flightRequestSchema>;
