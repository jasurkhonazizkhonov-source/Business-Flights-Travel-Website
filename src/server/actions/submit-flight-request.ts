"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { isSpamSubmission } from "@/lib/anti-spam";
import { describeDbError, describeDatabaseTarget } from "@/lib/db-error";
import { normalizePhoneNumber } from "@/lib/phone";
import { findAirportByIata } from "@/data/airports";
import { flightRequestSchema, type FlightRequestInput } from "@/lib/validations/flight-request";
import { distributeNewWebsiteLead } from "@/server/lead-distribution";
import { resolveContact } from "@/server/contact";
import { ensureSchemaReady, noteWriteFailure } from "@/server/schema-ready";
import { sendFlightRequestNotification, formatBudget, type FlightRequestSegment } from "@/lib/email/flight-request-notification";
import { captureSubmissionInfo } from "@/lib/submission-info";
import { saveLeadSubmissionInfo } from "@/server/save-submission-info";
import { gmailMailer } from "@/lib/email/mailer";
import { deriveLeadId } from "@/lib/submission-id";
import { createWebsiteLead } from "@/server/create-website-lead";

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

// Runs best-effort work after the response. next/server's after() hands it to
// the platform's waitUntil (Vercel keeps the function alive for it, up to the
// page's maxDuration) and reports errors thrown inside the task — but it
// throws SYNCHRONOUSLY at the call site where the platform provides no
// waitUntil. That must never turn an already-saved request into an error for
// the customer, so in that case the work runs before responding instead.
// Every task passed in catches its own failures.
async function afterResponse(task: () => Promise<unknown>, label: string): Promise<void> {
  try {
    after(task);
  } catch (err) {
    console.error(`[submitFlightRequest] after() is unavailable for ${label}; running it before responding instead`, err);
    await task();
  }
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

  // Honeypot + timing check — see src/lib/anti-spam.ts for what this
  // rejects and why (including the missing-renderedAt bug this guards
  // against a regression of).
  if (isSpamSubmission({ website: data.website, renderedAt: data.renderedAt, minFillMs: MIN_FORM_FILL_MS })) {
    return friendlyError();
  }

  const phone = normalizePhoneNumber(data.phone);
  if (!phone) {
    const message = "Please enter a valid phone number, including the complete number, so our travel specialist can reach you.";
    return { ok: false, error: message, fieldErrors: { phone: message } };
  }

  // What the server itself can tell about this request: the full IP address
  // (only from the headers the platform in front of the app sets — never a
  // form field) and the platform's approximate location. Unknown stays unknown.
  const { info: submissionInfo, ipUnavailable } = captureSubmissionInfo(headerList);

  // Step timings (milliseconds only — never any customer data) go to the
  // server log so a slow request can be attributed to a step instead of
  // guessed at; the database is far from the function (see docs/ENVIRONMENT.md),
  // so every sequential round trip counts.
  const startedAt = performance.now();
  const timings: Record<string, number> = {};
  let lapAt = startedAt;
  const lap = (label: string) => {
    const now = performance.now();
    timings[label] = Math.round(now - lapAt);
    lapAt = now;
  };

  try {
    // This action writes Airport rows before it ever reaches getCrmCompanyId(),
    // so the schema is verified here first (memoized per instance; see
    // src/lib/schema-guard.ts). On an intentionally-new database with
    // DATABASE_AUTO_INIT=true this initializes it and the request continues.
    await ensureSchemaReady();
    lap("schema");

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

    lap("airports");

    const contactId = await resolveContact({
      firstName: data.firstName,
      lastName: data.lastName,
      e164Phone: phone.e164,
      rawPhone: data.phone,
      email: data.email,
    });

    // The Lead's `budget` column holds the NUMBER only. When the customer
    // chose a currency other than USD, say so in the notes so the amount is
    // never read as dollars by whoever opens the Lead.
    const budgetNote =
      data.budget !== undefined && data.budgetCurrency && data.budgetCurrency !== "USD"
        ? `Budget entered by the customer: ${formatBudget(data.budget, data.budgetCurrency)} (the Budget field holds the number only; it is in ${data.budgetCurrency}, not USD).`
        : "";
    const notesParts = [data.notes?.trim(), formatSegmentsForNotes(data), budgetNote].filter(Boolean);

    lap("contact");

    // The Lead, its status history and its LEAD_CREATED activity are written
    // in ONE transaction. When the form sent a submission key, the Lead's
    // primary key is derived from it, so a retried/duplicated POST of the
    // same submission lands on the same row instead of creating a second
    // Lead (see src/lib/submission-id.ts and src/server/create-website-lead.ts).
    const created = await createWebsiteLead(
      prisma,
      {
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
        Activity: {
          create: [{ contactId, actorId: null, type: "LEAD_CREATED", description: "Lead created from the website flight request form" }],
        },
      },
      data.submissionId ? deriveLeadId(data.submissionId) : undefined,
    );
    lap("lead");

    const summary = {
      tripType: data.tripType,
      route: `${fromAirport.city} (${fromAirport.iata}) → ${toAirport.city} (${toAirport.iata})`,
      departureDate: firstSegment.departureDate,
      returnDate: data.returnDate,
      passengers: data.adults + data.children + data.infants,
      cabinClass: data.cabinClass,
    };
    // Never the address itself — only whether one was captured and, if not, the
    // value-free reason (see src/lib/client-ip.ts).
    const ipStatus = submissionInfo.ip ? "captured" : `unavailable (${ipUnavailable ?? "unknown"})`;
    console.info(
      `[submitFlightRequest] persisted in ${Math.round(performance.now() - startedAt)}ms (steps, ms: ${JSON.stringify(timings)}; ip ${ipStatus}; location ${submissionInfo.location ? "captured" : "unavailable"})${created.duplicate ? " — duplicate of an already-saved submission" : ""}`,
    );

    // What the server itself learned about the request (full IP + approximate
    // location) is stored against the Lead for the CRM's permission-gated
    // section. Best-effort and after the response: it is a separate table, so
    // it can never block, fail or roll back the submission — if it cannot be
    // saved (e.g. the CRM's migration has not reached this database yet) the
    // category and the Lead id (an internal id, not customer data) are logged
    // and the notification email still carries the values.
    //
    // It is an upsert with an empty update, so it is safe to run again for the
    // same Lead: a retried POST of the same submission (the `duplicate` case
    // below) therefore also attempts it, which heals a first attempt that
    // failed, and can never create a second row or overwrite the first.
    const saveSubmissionInfo = () =>
      afterResponse(
        () =>
          saveLeadSubmissionInfo(prisma, created.id, submissionInfo, data.budget !== undefined ? data.budgetCurrency : undefined).then(
            () => undefined,
            (err) => console.error(`[submitFlightRequest] submission info not saved for lead ${created.id}: ${describeDbError(err)}`),
          ),
        "submission info",
      );

    // The same submission already saved this Lead (a retried or repeated
    // POST): the customer's request IS saved, so they get the same success —
    // but the Lead was already queued and announced the first time, so
    // neither happens again (only the idempotent submission-info write may).
    if (created.duplicate) {
      await saveSubmissionInfo();
      return { ok: true, summary };
    }

    await saveSubmissionInfo();

    // Best-effort queue assignment. It is not needed for the customer's
    // response (an unassigned Lead is simply picked up later by the CRM's own
    // distributor), and it is the single largest block of sequential
    // database round trips in this request — 9 to 15 of them, measured by
    // replaying this exact code against a real engine — so it runs after the
    // response instead of before it. A queue with nobody active in it, or a
    // failure here, must never touch the customer's submission.
    await afterResponse(
      () =>
      distributeNewWebsiteLead(created.id).then(
        (r) => console.info(`[submitFlightRequest] lead distribution: ${r.assigned ? "assigned" : r.reason}`),
        (err) => console.error("[submitFlightRequest] distribution failed", err),
      ),
      "lead distribution",
    );

    // Internal-only notification to the Business Flights Travel team — NOT
    // the customer-facing response below, which is unchanged either way.
    // Queued AFTER the Lead is already persisted, so an email failure can
    // never roll back (or appear to roll back) a successful submission;
    // sendFlightRequestNotification() itself never throws (see that file),
    // and this still never fails the customer's response even if it did.
    // Deferred via next/server's after() rather than awaited inline: the
    // SMTP path has a real worst-case latency (connect timeout + one
    // bounded retry, ~20s — see src/lib/email/mailer.ts) that must never
    // make the customer's own request hang just because Gmail is slow or
    // unreachable. after() still runs this to completion on the server
    // (e.g. Vercel keeps the function alive for it) — it just never
    // delays the response below.
    const emailSegments: FlightRequestSegment[] = data.segments.map((seg, i) =>
      i === 0 ? { from: fromAirport, to: toAirport, departureDate: seg.departureDate } : seg,
    );
    await afterResponse(
      () =>
      sendFlightRequestNotification(
        {
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          phoneE164: phone.e164,
          tripType: data.tripType,
          cabinClass: data.cabinClass,
          adults: data.adults,
          children: data.children,
          infants: data.infants,
          flexibleDates: data.flexibleDates,
          preferredAirline: data.preferredAirline,
          budget: data.budget,
          budgetCurrency: data.budgetCurrency,
          notes: data.notes,
          segments: emailSegments,
          returnDate: data.returnDate,
          submittedAt: submissionInfo.capturedAt,
          submission: { ip: submissionInfo.ip, location: submissionInfo.location, locationSource: submissionInfo.locationSource },
        },
        { mailer: gmailMailer },
      ).catch((err) => {
        console.error("[submitFlightRequest] internal notification email failed", err);
      }),
      "internal notification",
    );

    return { ok: true, summary };
  } catch (err) {
    // Never leak DB/driver errors to the client — log full detail
    // server-side only. The categorized line first makes the failure mode
    // (connectivity vs. constraint vs. config vs. app bug — see
    // src/lib/db-error.ts) scannable in Vercel's runtime logs without
    // having to parse the full stack trace on the line after it.
    noteWriteFailure(err);
    console.error(`[submitFlightRequest] failed: ${describeDbError(err)} | db target: ${describeDatabaseTarget()}`, err);
    return friendlyError();
  }
}
