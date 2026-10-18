"use server";

import { headers } from "next/headers";
import { checkRateLimit } from "@/lib/rate-limit";
import { rateLimitClientKey } from "@/lib/rate-limit-client";
import { isSpamSubmission } from "@/lib/anti-spam";
import { normalizePhoneNumber } from "@/lib/phone";
import { contactMessageSchema, type ContactMessageInput } from "@/lib/validations/contact";
import { postContactInquiry } from "@/lib/crm-api/client";
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
// That endpoint has no idempotency or duplicate guard, so the call is attempted exactly ONCE: a timeout leaves the outcome unknown and the
// visitor sees the friendly error (a second submit could store the message twice, which is the lesser harm than losing it silently).
// There is NO database fallback.
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
  const phone = normalizePhoneNumber(data.phone);
  if (!phone) {
    const message = "Please enter a valid phone number, including the complete number.";
    return { ok: false, error: message, fieldErrors: { phone: message } };
  }

  const api = crmApiConfig("public-inquiry", "contact message");
  if (!api.ok) return friendlyError();

  const outcome = await postContactInquiry({
    config: api.config,
    body: { firstName: data.firstName, lastName: data.lastName, email: data.email, phone: phone.e164, subject: data.subject, message: data.message },
  });

  if (outcome.status === "ok") return { ok: true };

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
