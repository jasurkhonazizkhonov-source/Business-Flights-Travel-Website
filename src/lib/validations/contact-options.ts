// Plain runtime constants the client-side contact form needs — split out
// of contact.ts for the same reason as flight-request-options.ts: contact.ts
// imports zod to build contactMessageSchema, and any client component that
// imported even one plain value from that file pulled zod (unused at
// runtime there) into its bundle along with it. This file has zero
// dependencies. contact.ts re-exports these same values so the server/schema
// side keeps one canonical import path.
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
