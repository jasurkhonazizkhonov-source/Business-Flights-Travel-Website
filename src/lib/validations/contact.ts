import { z } from "zod";

// Values match the CRM's InquirySubject enum (ContactInquiry model,
// prisma/schema.prisma) exactly, as plain string literals rather than an
// import from the generated Prisma client — this file is shared with the
// client-side contact form, and importing the generated client into a
// browser bundle pulls in Node-only internals that break the build.
export const CONTACT_SUBJECT_VALUES = [
  "GENERAL_INQUIRY",
  "FLIGHT_REQUEST_HELP",
  "EXISTING_BOOKING",
  "CORPORATE_TRAVEL",
  "OTHER",
] as const;
export type ContactSubject = (typeof CONTACT_SUBJECT_VALUES)[number];

export const CONTACT_SUBJECT_OPTIONS: { value: ContactSubject; label: string }[] = [
  { value: "GENERAL_INQUIRY", label: "General Inquiry" },
  { value: "FLIGHT_REQUEST_HELP", label: "Flight Request Help" },
  { value: "EXISTING_BOOKING", label: "Existing Booking" },
  { value: "CORPORATE_TRAVEL", label: "Corporate Travel" },
  { value: "OTHER", label: "Other" },
];

export const contactMessageSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  email: z
    .string()
    .trim()
    .min(1, "Email address is required")
    .email("Please enter a valid email address.")
    .max(200),
  // Presence/shape only — the real phone-number check (via libphonenumber-js)
  // happens in submit-contact-message.ts, matching how the flight request
  // form validates phone (see lib/validations/flight-request.ts).
  phone: z.string().trim().min(4, "Please enter a valid phone number, including the complete number.").max(30),
  subject: z.enum(CONTACT_SUBJECT_VALUES, { message: "Please select a subject." }),
  message: z.string().trim().min(10, "Please add a few more details (at least 10 characters).").max(3000),
  website: z.string().max(0, "").optional().or(z.literal("")), // honeypot
  renderedAt: z.number().optional(),
});

export type ContactMessageInput = z.infer<typeof contactMessageSchema>;
