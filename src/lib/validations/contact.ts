import { z } from "zod";
import { checkEmail, emailProblemMessage } from "@/lib/email-validation";
import { CONTACT_SUBJECT_VALUES, CONTACT_SUBJECT_OPTIONS, type ContactSubject } from "./contact-options";

// Values match the subjects the CRM's POST /api/public/contact-inquiry
// accepts (its InquirySubject enum) exactly, as plain string literals — the
// website has no CRM code or database client to import them from.
//
// CONTACT_SUBJECT_VALUES/OPTIONS live in contact-options.ts (no zod import)
// and are re-exported here so this stays the one canonical import path for
// server code and for types — but the client-side contact form should
// import them from contact-options directly (see the comment there) rather
// than from this file, or it'll pull the zod schema below into its bundle
// for nothing.
export { CONTACT_SUBJECT_VALUES, CONTACT_SUBJECT_OPTIONS, type ContactSubject };

export const contactMessageSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  email: z
    .string()
    .trim()
    .min(1, "Email address is required")
    .max(200, "Please enter a valid email address. The address is too long.")
    // The shared rules (src/lib/email-validation.ts), with a specific hint; a subset of what the CRM accepts.
    .superRefine((value, ctx) => {
      const result = checkEmail(value);
      if (!result.ok) ctx.addIssue({ code: "custom", message: emailProblemMessage(result.problem, "Please enter a valid email address.") });
    }),
  // Presence/shape only — the real phone-number check (via libphonenumber-js)
  // happens in submit-contact-message.ts, matching how the flight request
  // form validates phone (see lib/validations/flight-request.ts).
  phone: z.string().trim().min(4, "Please enter a valid phone number, including the complete number.").max(30),
  subject: z.enum(CONTACT_SUBJECT_VALUES, { message: "Please select a subject." }),
  message: z.string().trim().min(10, "Please add a few more details (at least 10 characters).").max(3000),
  website: z.string().max(0, "").optional().or(z.literal("")), // honeypot
  renderedAt: z.number().optional(),
  // Minted once per mounted form (crypto.randomUUID) so a repeat press of Send is recognised as the same submission. Absent where randomUUID is
  // unavailable; the server then simply sends no key.
  submissionId: z
    .string()
    .regex(/^[A-Za-z0-9-]{8,64}$/)
    .optional(),
});

export type ContactMessageInput = z.infer<typeof contactMessageSchema>;
