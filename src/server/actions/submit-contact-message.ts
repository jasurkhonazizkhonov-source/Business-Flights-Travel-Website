"use server";

import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { normalizePhoneNumber } from "@/lib/phone";
import { contactMessageSchema, type ContactMessageInput } from "@/lib/validations/contact";
import { resolveContact } from "@/server/contact";
import { CRM_COMPANY_ID } from "@/lib/constants";

export type SubmitContactMessageResult = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };

const MIN_FORM_FILL_MS = 2000;

function friendlyError(
  message = "We're sorry, something went wrong while sending your message. Please try again or contact our travel specialists directly.",
): SubmitContactMessageResult {
  return { ok: false, error: message };
}

// A general "Contact Us" inquiry is a distinct thing from a flight request —
// it goes into the CRM's own ContactInquiry model (prisma/schema.prisma),
// not the sales Lead/queue pipeline. It's still linked to the same Contact
// record a flight request would resolve to (via matchedContactId), so an
// agent looking at a contact sees every inquiry and lead together, but the
// CRM's own inquiry inbox/workflow is what handles routing and response
// from here — the website does not assign it to an agent itself.
export async function submitContactMessage(input: ContactMessageInput): Promise<SubmitContactMessageResult> {
  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

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

  if (data.website) return friendlyError();
  if (data.renderedAt && Date.now() - data.renderedAt < MIN_FORM_FILL_MS) return friendlyError();

  // Phone is a required field — validate it's a genuine, complete number
  // (not just non-empty) the same way the flight request form does.
  const phone = normalizePhoneNumber(data.phone);
  if (!phone) {
    const message = "Please enter a valid phone number, including the complete number.";
    return { ok: false, error: message, fieldErrors: { phone: message } };
  }

  try {
    const contactId = await resolveContact({
      firstName: data.firstName,
      lastName: data.lastName,
      e164Phone: phone.e164,
      rawPhone: data.phone,
      email: data.email,
    });

    const inquiry = await prisma.contactInquiry.create({
      data: {
        companyId: CRM_COMPANY_ID,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: phone.e164,
        subject: data.subject,
        message: data.message,
        status: "NEW",
        matchedContactId: contactId,
        updatedAt: new Date(),
      },
    });

    await prisma.activity.create({
      data: {
        contactId,
        actorId: null,
        type: "CONTACT_INQUIRY_CREATED",
        description: "Contact inquiry submitted from the website",
        metadata: { inquiryId: inquiry.id, subject: data.subject },
      },
    });

    return { ok: true };
  } catch (err) {
    console.error("[submitContactMessage] failed", err);
    return friendlyError();
  }
}
