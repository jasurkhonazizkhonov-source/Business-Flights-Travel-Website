import type { FlightRequestInput } from "@/lib/validations/flight-request";

// Maps the website's VALIDATED flight request onto the body of the CRM's POST /api/v1/website/flight-inquiries
// (the CRM's docs/WEBSITE_LEAD_API.md, "Body fields"; schema: flightInquiryBase in its src/server/lead-intake.ts).
//
// The endpoint is STRICT: an unknown field is a 400, so this builds the body from an explicit allow-list and never spreads the input. The
// website-only fields (honeypot `website`, `renderedAt`, `submissionId` - which travels in the Idempotency-Key header) are therefore
// never sent, and neither is anything the CRM owns (companyId, source, status, assignment, priority, IP).
//
// Differences in NAME between the website and the CRM: flexibleDates -> datesFlexible, budget -> approximateBudget, notes -> additionalNotes,
// segments[i].from.iata -> segments[i].departureAirportIata (the CRM resolves airports itself from the IATA code).
//
// The body is a pure function of the validated input, so a retry of the same submission produces byte-identical JSON: the CRM stores a
// fingerprint of the request under the Idempotency-Key and answers a different request under the same key with 409.

export type FlightInquiryBody = {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  tripType: FlightRequestInput["tripType"];
  departureAirportIata: string;
  arrivalAirportIata: string;
  departureDate: string;
  returnDate?: string;
  segments?: Array<{ departureAirportIata: string; arrivalAirportIata: string; departureDate: string }>;
  cabinClass: FlightRequestInput["cabinClass"];
  adults: number;
  children: number;
  infants: number;
  datesFlexible: boolean;
  preferredAirline?: string;
  approximateBudget?: number;
  budgetCurrency?: string;
  additionalNotes?: string;
};

/** `phoneE164` is the website's own normalised number (src/lib/phone.ts); the CRM validates it again with its normal rule. */
export function buildFlightInquiryBody(data: FlightRequestInput, phoneE164: string): FlightInquiryBody {
  const first = data.segments[0];
  const body: FlightInquiryBody = {
    firstName: data.firstName,
    lastName: data.lastName,
    phone: phoneE164,
    tripType: data.tripType,
    departureAirportIata: first.from.iata,
    arrivalAirportIata: first.to.iata,
    departureDate: first.departureDate,
    cabinClass: data.cabinClass,
    adults: data.adults,
    children: data.children,
    infants: data.infants,
    datesFlexible: data.flexibleDates,
  };
  if (data.email) body.email = data.email;
  // A return date only means something for a round trip.
  if (data.tripType === "ROUND_TRIP" && data.returnDate) body.returnDate = data.returnDate;
  // Every leg of a multi-city trip, in order. (For a one-way or round trip the single leg is already the top-level route.)
  if (data.tripType === "MULTI_CITY") {
    body.segments = data.segments.map((s) => ({ departureAirportIata: s.from.iata, arrivalAirportIata: s.to.iata, departureDate: s.departureDate }));
  }
  const airline = data.preferredAirline?.trim();
  if (airline) body.preferredAirline = airline;
  // The currency belongs to the amount: it is only sent with one (the CRM keeps it with the submission details, never mixed into the number).
  if (data.budget !== undefined) {
    body.approximateBudget = data.budget;
    if (data.budgetCurrency) body.budgetCurrency = data.budgetCurrency;
  }
  const notes = data.notes?.trim();
  if (notes) body.additionalNotes = notes;
  return body;
}
