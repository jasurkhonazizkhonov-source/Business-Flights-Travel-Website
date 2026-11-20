"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { checkRateLimit } from "@/lib/rate-limit";
import { rateLimitClientKey } from "@/lib/rate-limit-client";
import { isSpamSubmission } from "@/lib/anti-spam";
import { checkPhoneNumber, phoneProblemMessage } from "@/lib/phone";
import { contactMessageSchema, type ContactMessageInput } from "@/lib/validations/contact";
import { postContactInquiry } from "@/lib/crm-api/client";
import { captureSubmissionInfo } from "@/lib/submission-info";
import { createRequestSigner } from "@/lib/crm-api/visitor-context";
import { crmApiConfig } from "@/server/crm-api";

export type SubmitContactMessageResult = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };

const MIN_FORM_FILL_MS = 2000;

function friendlyError(
  message = "We're sorry, something went wrong while sending your message. Please try again or contact our travel specialists directly.",
): SubmitContactMessageResult {
  return { ok: false, error: message };
}

// A general "Contact Us" message is a distinct thing from a flight request: it becomes an inquiry in the Compass Tools CRM's own "Get In Touch"
// inbox (source BUSINESS_FLIGHTS_WEBSITE), not a sales Lead. It is created by the CRM through POST /api/public/contact-inquiry - the CRM's
// ONLY endpoint for this form today, and an UNAUTHENTICATED one (docs/CRM_API_INTEGRATION.md explains the gap and the contract the CRM should
// add). The CRM owns the inquiry, the matching of an existing contact and the staff notification.
//
// The call is attempted exactly ONCE per submit (never retried automatically). The submission carries a `submissionId` - the form's per-mount id
// joined with a hash of what the visitor typed - and the CRM stores one inquiry per id, so when a timeout or a lost answer leaves the outcome unknown
// the VISITOR can press Send again safely: the CRM answers `duplicate: true` instead of storing the message twice. Editing the message changes the
// hash, so a corrected message is a new submission. A CRM that predates the key ignores it and behaves as before. There is NO database fallback.
function contactSubmissionKey(formId: string | undefined, fields: Record<string, string>): string | undefined {
  if (!formId) return undefined;
  const digest = createHash("sha256").update(JSON.stringify(Object.entries(fields).sort(([a], [b]) => (a < b ? -1 : 1)))).digest("hex").slice(0, 16);
  return `${formId}.${digest}`;
}

export async function submitContactMessage(input: ContactMessageInput): Promise<SubmitContactMessageResult> {
  const headerList = await headers();
  const ip = rateLimitClientKey(headerList);

  const { allowed } = checkRateLimit(`contact-message:${ip}`, 8);
  if (!allowed) {
    return friendlyError("You've sent several messages recently. Please wait a few minutes and try again.");
  }

  const parsed = contactMessageSchema.safeParse(input);
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

  // Phone is a required field - validate it's a genuine, complete number (not just non-empty) the same way the flight request form does.
  // "Valid" is the numbering-plan sense (country code, length, an area code in use); it does not mean the number is assigned or reachable.
  const phoneCheck = checkPhoneNumber(data.phone);
  if (!phoneCheck.ok) {
    const message = phoneProblemMessage(phoneCheck, "Please enter a valid phone number, including the complete number.");
    return { ok: false, error: message, fieldErrors: { phone: message } };
  }
  const phone = phoneCheck;

  const api = crmApiConfig("public-inquiry", "contact message");
  if (!api.ok) return friendlyError();

  const submissionId = contactSubmissionKey(data.submissionId, {
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email.toLowerCase(),
    phone: phone.e164,
    subject: data.subject,
    message: data.message,
  });

  // What THIS server observed about the request (trusted proxy headers only - never a form field), signed with LEAD_INGEST_SECRET. The CRM sees only this
  // website's server, so without the signed context it records no IP and no location for the inquiry. Nothing is fabricated: no trusted IP or no
  // geolocation simply means those parts are absent, and the inquiry is still sent.
  const { info: submissionInfo, ipUnavailable } = captureSubmissionInfo(headerList);
  const sign = createRequestSigner(submissionInfo, api.config.ingestSecret);

  const outcome = await postContactInquiry({
    config: api.config,
    sign,
    body: {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: phone.e164,
      subject: data.subject,
      message: data.message,
      ...(submissionId ? { submissionId } : {}),
    },
  });

  if (outcome.status === "ok") {
    // Value-free: whether an IP/location was available and sent, never the address or the place.
    const ipStatus = submissionInfo.ip ? "captured" : `unavailable (${ipUnavailable ?? "unknown"})`;
    console.info(
      `[submitContactMessage] accepted by the CRM (request ${sign ? "signed (v2)" : "not signed: LEAD_INGEST_SECRET is not configured"}; ip ${ipStatus}; location ${submissionInfo.location ? "captured" : "unavailable"})`,
    );
    return { ok: true };
  }

  // Fixed tags only - never the message, the visitor's details or the CRM's reply text.
  switch (outcome.status) {
    case "rejected":
      console.error(`[submitContactMessage] the CRM rejected the message (HTTP ${outcome.httpStatus})`);
      break;
    case "rate_limited":
      console.error("[submitContactMessage] the CRM rate-limited the website's call");
      break;
    case "unavailable":
      console.error(`[submitContactMessage] the CRM could not be reached (${outcome.reason}${outcome.httpStatus ? `, HTTP ${outcome.httpStatus}` : ""}); the message may or may not have been stored`);
      break;
  }
  return friendlyError();
}
