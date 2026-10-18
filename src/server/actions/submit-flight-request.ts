"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { after } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { rateLimitClientKey } from "@/lib/rate-limit-client";
import { isSpamSubmission } from "@/lib/anti-spam";
import { normalizePhoneNumber } from "@/lib/phone";
import { findAirportByIata } from "@/data/airports";
import { flightRequestSchema, type FlightRequestInput } from "@/lib/validations/flight-request";
import { sendFlightRequestNotification, type FlightRequestSegment } from "@/lib/email/flight-request-notification";
import { captureSubmissionInfo } from "@/lib/submission-info";
import { gmailMailer } from "@/lib/email/mailer";
import { postFlightInquiry } from "@/lib/crm-api/client";
import { buildFlightInquiryBody } from "@/lib/crm-api/flight-inquiry";
import { buildVisitorContextHeaders } from "@/lib/crm-api/visitor-context";
import { crmApiConfig } from "@/server/crm-api";

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

// Runs best-effort work after the response. next/server's after() runs it once the response is sent and reports errors thrown inside the
// task - but it throws SYNCHRONOUSLY at the call site where the platform provides no waitUntil. That must never turn an already-saved request
// into an error for the customer, so in that case the work runs before responding instead. Every task passed in catches its own failures.
async function afterResponse(task: () => Promise<unknown>, label: string): Promise<void> {
  try {
    after(task);
  } catch (err) {
    console.error(`[submitFlightRequest] after() is unavailable for ${label}; running it before responding instead`, err);
    await task();
  }
}

// The flight request is created by the Compass Tools CRM, through its authenticated website API (POST /api/v1/website/flight-inquiries; contract:
// docs/CRM_API_INTEGRATION.md). The CRM owns everything about the Lead: contact matching, status and history, the creation activity, company
// attribution, the itinerary legs, the visitor-details record and queue distribution. This website keeps only what is the website's own: the
// public form's validation, rate limit and spam checks, the customer-facing result, and the internal notification email.
//
// There is NO database fallback. If the CRM cannot be reached the customer is told so and nothing is stored here; the same form keeps the
// same submission key, so pressing "submit" again after the CRM is back is safe.
export async function submitFlightRequest(input: FlightRequestInput): Promise<SubmitFlightRequestResult> {
  const headerList = await headers();
  const ip = rateLimitClientKey(headerList);

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

  // Honeypot + timing check - see src/lib/anti-spam.ts for what this rejects and why.
  if (isSpamSubmission({ website: data.website, renderedAt: data.renderedAt, minFillMs: MIN_FORM_FILL_MS })) {
    return friendlyError();
  }

  const phone = normalizePhoneNumber(data.phone);
  if (!phone) {
    const message = "Please enter a valid phone number, including the complete number, so our travel specialist can reach you.";
    return { ok: false, error: message, fieldErrors: { phone: message } };
  }

  // What this server itself can tell about the request: the full IP (only from the headers the platform in front of the app sets - never a
  // form field) and the platform's approximate location. It goes to the CRM only inside the signed visitor context, and into the internal email.
  const { info: submissionInfo, ipUnavailable } = captureSubmissionInfo(headerList);

  const startedAt = performance.now();

  // The airports are checked against the application-owned dataset (src/data/airports.ts) - the one the autocomplete offered them from - not
  // against client-supplied name/city/country text. The CRM resolves the IATA codes itself.
  const firstSegment = data.segments[0];
  const [canonicalFrom, canonicalTo] = await Promise.all([findAirportByIata(firstSegment.from.iata), findAirportByIata(firstSegment.to.iata)]);
  if (!canonicalFrom || !canonicalTo) {
    return friendlyError("One of the selected airports could not be found. Please reselect your origin and destination.");
  }

  const api = crmApiConfig("flight-inquiry", "flight request");
  if (!api.ok) return friendlyError();

  // The submission key the form minted is the Idempotency-Key: every attempt of this submission - the automatic retry Next.js makes of a failed
  // Server Action POST, a retry inside postFlightInquiry, the visitor pressing submit again - carries the same key, and the CRM turns them into
  // ONE lead. A caller without a key (an older cached client bundle) gets a fresh one for this call only, which still makes the retries inside
  // this call safe.
  const idempotencyKey = data.submissionId ?? randomUUID();

  const outcome = await postFlightInquiry({
    config: api.config,
    body: buildFlightInquiryBody(data, phone.e164),
    idempotencyKey,
    visitorHeaders: buildVisitorContextHeaders(submissionInfo, api.config.ingestSecret),
  });
  const ms = Math.round(performance.now() - startedAt);

  if (outcome.status !== "created" && outcome.status !== "duplicate") {
    // Fixed tags and codes only - never the request, the customer's details, the key, or the CRM's message text.
    switch (outcome.status) {
      case "misconfigured":
        console.error(`[submitFlightRequest] the CRM refused the website's credential or route (HTTP ${outcome.httpStatus}); check CRM_API_URL / CRM_API_KEY and that the CRM is reached over its private network`);
        break;
      case "rejected":
        console.error(`[submitFlightRequest] the CRM rejected the request (HTTP ${outcome.httpStatus}, ${outcome.code}${outcome.fieldPaths.length ? `, fields: ${outcome.fieldPaths.join(", ")}` : ""})`);
        break;
      case "unavailable":
        console.error(`[submitFlightRequest] the CRM could not be reached after ${outcome.attempts} attempt(s) (${outcome.reason}${outcome.httpStatus ? `, HTTP ${outcome.httpStatus}` : ""}) in ${ms}ms`);
        break;
    }
    if (outcome.status === "rejected" && outcome.httpStatus === 409) {
      // The same submission key was already used for a DIFFERENT request (the visitor changed the form after an attempt whose answer was lost).
      return friendlyError("We've already received a request from this page. Please reload the page to send a new one, or contact our travel specialists directly.");
    }
    return friendlyError();
  }

  const route = `${canonicalFrom.city} (${canonicalFrom.iata}) → ${canonicalTo.city} (${canonicalTo.iata})`;
  const summary = {
    tripType: data.tripType,
    route,
    departureDate: firstSegment.departureDate,
    returnDate: data.returnDate,
    passengers: data.adults + data.children + data.infants,
    cabinClass: data.cabinClass,
  };
  // Never the address itself - only whether one was captured and, if not, the value-free reason (see src/lib/client-ip.ts).
  const ipStatus = submissionInfo.ip ? "captured" : `unavailable (${ipUnavailable ?? "unknown"})`;
  console.info(
    `[submitFlightRequest] accepted by the CRM in ${ms}ms (attempts: ${outcome.attempts}; visitor context ${api.config.ingestSecret ? "signed" : "not configured"}; ip ${ipStatus}; location ${submissionInfo.location ? "captured" : "unavailable"})${outcome.status === "duplicate" ? " - duplicate of an already-received submission" : ""}`,
  );

  // The CRM already has the request (a repeat of the same submission was answered as such): the customer gets the same success. No second
  // email is sent, because the CRM's reply cannot tell us whether the first one was: `duplicate` only says the lead exists, and the CRM never
  // learns whether this website's email was sent. Known limitation: if the first attempt's reply was lost, or the visitor pressed submit
  // again after an error, that email is never sent (the CRM still has the lead and offers it to an agent). Making it retryable needs a
  // CRM-side signal - see docs/CRM_API_INTEGRATION.md, "Internal notification e-mail and repeats".
  if (outcome.status === "duplicate") return { ok: true, summary };

  // Internal-only notification to the Business Flights Travel team - NOT the customer-facing response, which is unchanged either way. Queued
  // AFTER the CRM has the lead, so an email failure can never roll back (or appear to roll back) a successful submission; it runs after the
  // response because the SMTP path has a real worst-case latency (~20s, src/lib/email/mailer.ts) that must never make the customer wait.
  const emailSegments: FlightRequestSegment[] = data.segments.map((seg, i) => (i === 0 ? { from: canonicalFrom, to: canonicalTo, departureDate: seg.departureDate } : seg));
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
}
