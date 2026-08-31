"use server";

import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { normalizePhoneNumber } from "@/lib/phone";
import { findAirportByIata } from "@/data/airports";
import { flightRequestSchema, type FlightRequestInput } from "@/lib/validations/flight-request";
import { distributeNewWebsiteLead } from "@/server/lead-distribution";
import { resolveContact } from "@/server/contact";

export type SubmitFlightRequestResult =
  | {
      ok: true;
      summary: {
        tripType: string;
        route: string;
        departureDate: string;
        returnDate?: string;
        passengers: number;
        cabinClass: string;
      };
    }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const MIN_FORM_FILL_MS = 2500;

function friendlyError(message = "We're sorry, something went wrong while submitting your request. Please try again or contact our travel specialists directly."): SubmitFlightRequestResult {
  return { ok: false, error: message };
}

function formatSegmentsForNotes(input: FlightRequestInput): string {
  // The CRM's Lead model (see prisma/schema.prisma) carries a single
  // origin/destination + departure/return date — full multi-segment
  // itineraries only get first-class storage once an agent builds a Quote
  // (Itinerary/FlightSegment). Until then, the complete multi-city request
  // is preserved here in structured, human-readable form so no detail the
  // customer entered is lost before an agent turns it into a quote.
  if (input.tripType !== "MULTI_CITY") return "";
  const lines = input.segments.map(
    (s, i) => `  ${i + 1}. ${s.from.iata} (${s.from.city}) -> ${s.to.iata} (${s.to.city}) on ${s.departureDate}`,
  );
  return `Multi-city itinerary requested:\n${lines.join("\n")}`;
}

export async function submitFlightRequest(input: FlightRequestInput): Promise<SubmitFlightRequestResult> {
  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  const { allowed } = checkRateLimit(`flight-request:${ip}`, 8);
  if (!allowed) {
    return friendlyError("You've submitted several requests recently. Please wait a few minutes and try again, or contact us directly.");
  }

  const parsed = flightRequestSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "form";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: "Please check the highlighted fields and try again.", fieldErrors };
  }
  const data = parsed.data;

  // Honeypot: a real visitor never sees or fills this field.
  if (data.website) {
    return friendlyError();
  }
  // Implausibly fast submission for a human filling a multi-step form.
  if (data.renderedAt && Date.now() - data.renderedAt < MIN_FORM_FILL_MS) {
    return friendlyError();
  }

  const phone = normalizePhoneNumber(data.phone);
  if (!phone) {
    const message = "Please enter a valid phone number, including the complete number, so our travel specialist can reach you.";
    return { ok: false, error: message, fieldErrors: { phone: message } };
  }

  try {
    const firstSegment = data.segments[0];

    // Validate the submitted IATA codes against our own application-owned
    // airport data (src/data/airports.ts) — the same dataset the
    // autocomplete offered them from — rather than trusting client-supplied
    // name/city/country text, or requiring the CRM's Postgres `Airport`
    // table to already happen to contain these rows. `Lead` has a real
    // foreign key to `Airport`, so a row still has to exist there; `upsert`
    // creates it on demand (using our canonical data, not the client's) if
    // this Postgres database hasn't seen this airport before, and keeps an
    // existing row's name/city/country in sync with that same canonical
    // data otherwise. This is what makes flight-request submission work
    // against any compatible Postgres database — including a brand-new one
    // with an empty `Airport` table — not just the specific instance that
    // originally had it pre-seeded.
    const [canonicalFrom, canonicalTo] = await Promise.all([
      findAirportByIata(firstSegment.from.iata),
      findAirportByIata(firstSegment.to.iata),
    ]);
    if (!canonicalFrom || !canonicalTo) {
      return friendlyError("One of the selected airports could not be found. Please reselect your origin and destination.");
    }

    const [fromAirport, toAirport] = await Promise.all([
      prisma.airport.upsert({
        where: { iata: canonicalFrom.iata },
        create: canonicalFrom,
        update: { name: canonicalFrom.name, city: canonicalFrom.city, country: canonicalFrom.country },
      }),
      prisma.airport.upsert({
        where: { iata: canonicalTo.iata },
        create: canonicalTo,
        update: { name: canonicalTo.name, city: canonicalTo.city, country: canonicalTo.country },
      }),
    ]);

    const contactId = await resolveContact({
      firstName: data.firstName,
      lastName: data.lastName,
      e164Phone: phone.e164,
      rawPhone: data.phone,
      email: data.email,
    });

    const notesParts = [data.notes?.trim(), formatSegmentsForNotes(data)].filter(Boolean);

    const lead = await prisma.lead.create({
      data: {
        contactId,
        departureAirportId: fromAirport.id,
        arrivalAirportId: toAirport.id,
        departureDate: new Date(firstSegment.departureDate),
        returnDate: data.returnDate ? new Date(data.returnDate) : undefined,
        tripType: data.tripType,
        cabinClass: data.cabinClass,
        adults: data.adults,
        children: data.children,
        infants: data.infants,
        flexibleDates: data.flexibleDates,
        preferredAirline: data.preferredAirline || undefined,
        budget: data.budget,
        notes: notesParts.length ? notesParts.join("\n\n") : undefined,
        source: "WEBSITE",
        priority: "MEDIUM",
        status: "ATTEMPTING_TO_CONTACT",
        LeadStatusHistory: {
          create: [{ toStatus: "ATTEMPTING_TO_CONTACT" }],
        },
      },
    });

    await prisma.activity.create({
      data: {
        leadId: lead.id,
        contactId,
        actorId: null,
        type: "LEAD_CREATED",
        description: "Lead created from the website flight request form",
      },
    });

    // Best-effort: a queue with nobody active in it right now must never
    // fail the customer's submission.
    await distributeNewWebsiteLead(lead.id).catch((err) => {
      console.error("[submitFlightRequest] distribution failed", err);
    });

    return {
      ok: true,
      summary: {
        tripType: data.tripType,
        route: `${fromAirport.city} (${fromAirport.iata}) → ${toAirport.city} (${toAirport.iata})`,
        departureDate: firstSegment.departureDate,
        returnDate: data.returnDate,
        passengers: data.adults + data.children + data.infants,
        cabinClass: data.cabinClass,
      },
    };
  } catch (err) {
    // Never leak DB/driver errors to the client — log full detail
    // server-side only.
    console.error("[submitFlightRequest] failed", err);
    return friendlyError();
  }
}
