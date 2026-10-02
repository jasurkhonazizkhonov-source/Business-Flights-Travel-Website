// Internal "New Flight Request" notification — sent to the Business
// Flights Travel team (NOT the customer) after a flight request has
// already been validated and successfully persisted. See
// src/server/actions/submit-flight-request.ts for the call site.
//
// Deliberately NOT "use server"/server-only: every function here is pure
// (no I/O) or takes its I/O (the Mailer) as a parameter, so this whole
// module is directly unit-testable in a plain Node test — same reasoning
// src/lib/anti-spam.ts and src/lib/db-error.ts already document for why
// their logic is extracted out of the "use server" action files instead of
// only being exercised by replaying a build-generated Server Action id.
// Only src/lib/email/mailer.ts (never imported here except by type) touches
// `nodemailer` or reads GMAIL_APP_PASSWORD. This file DOES read
// GMAIL_SENDER_EMAIL (never the password) — the same Gmail address is both
// sender and recipient, so this is simply the one address the feature needs
// to resolve and gate on; see sendFlightRequestNotification() below.
import type { Mailer } from "@/lib/email/mailer";
import { cleanEnvValue, isPlausibleEmail } from "@/lib/email/smtp-helpers";
import { SITE_NAME, SITE_URL, CONTACT_PHONE_DISPLAY, CONTACT_EMAIL, COMPANY_ADDRESS } from "@/lib/constants";

export interface FlightRequestAirport {
  iata: string;
  city: string;
  country: string;
  name: string;
}

export interface FlightRequestSegment {
  from: FlightRequestAirport;
  to: FlightRequestAirport;
  departureDate: string; // "YYYY-MM-DD"
}

// Exactly the fields submit-flight-request.ts already has in hand after
// persisting the Lead — nothing here is re-fetched from the database, and
// nothing is invented: every field is either directly submitted by the
// customer or a value the action itself just computed (phone, airports).
export interface FlightRequestNotificationInput {
  firstName: string;
  lastName: string;
  email: string;
  /** E.164, e.g. "+33783905717" — used for both display and the tel: link. */
  phoneE164: string;
  tripType: "ONE_WAY" | "ROUND_TRIP" | "MULTI_CITY";
  cabinClass: string;
  adults: number;
  children: number;
  infants: number;
  flexibleDates: boolean;
  preferredAirline?: string;
  budget?: number;
  notes?: string;
  segments: FlightRequestSegment[];
  returnDate?: string; // "YYYY-MM-DD", only meaningful for ROUND_TRIP
  submittedAt: Date;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// A literal CR/LF embedded in a value that reaches the email SUBJECT (a
// header, not the body) could inject a fake header line into the raw SMTP
// message. src/lib/validations/flight-request.ts already constrains
// airport IATA codes to exactly 3 letters, but this module is also called
// directly with hand-built input that never passes through that schema
// (see scripts/verify-initialized-schema.ts), so the one place this module
// builds a header value defends itself unconditionally rather than trusting
// the caller.
function subjectSafe(value: string): string {
  // Any control character (CR/LF included) plus the Unicode line/paragraph
  // separators (\p{Zl}, \p{Zp}) — none can legitimately appear in an airport
  // code. Written as Unicode property classes on purpose: a literal
  // separator character inside a regex literal (or a // comment) is itself
  // a line terminator and is a syntax error.
  return value.replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, " ");
}

// The form submits the cabin as an enum value ("PREMIUM_ECONOMY"); the
// internal reader should see the same wording the form shows. An unknown
// value (or a caller that already passes a display string) is shown as-is.
const CABIN_LABEL: Record<string, string> = {
  ECONOMY: "Economy",
  PREMIUM_ECONOMY: "Premium Economy",
  BUSINESS: "Business Class",
  FIRST: "First Class",
};

function cabinLabel(cabinClass: string): string {
  return CABIN_LABEL[cabinClass] ?? cabinClass;
}

const WEEKDAY_MONTH_DAY_YEAR = { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" } as const;

/** "2026-10-24" -> "Saturday, October 24, 2026" — parsed/formatted in UTC so the calendar date can never shift with server timezone. */
export function formatIsoDateLong(iso: string): string {
  return new Intl.DateTimeFormat("en-US", WEEKDAY_MONTH_DAY_YEAR).format(new Date(`${iso}T00:00:00Z`));
}

/** A real Date -> "Thursday, October 1, 2026, 4:41 PM UTC" — explicit UTC, never the visitor's browser clock, and the literal "UTC" suffix is appended by us rather than left to ICU's locale data (which can render "GMT" instead depending on the runtime). */
export function formatSubmittedAt(date: Date): string {
  const datePart = new Intl.DateTimeFormat("en-US", WEEKDAY_MONTH_DAY_YEAR).format(date);
  const timePart = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" }).format(date);
  return `${datePart}, ${timePart} UTC`;
}

function travelerCount(input: FlightRequestNotificationInput): number {
  return input.adults + input.children + input.infants;
}

function travelerLabel(input: FlightRequestNotificationInput): string {
  const n = travelerCount(input);
  return `${n} ${n === 1 ? "Traveler" : "Travelers"}`;
}

// Adults/children/infants are three separate fields the form actually
// collects — shown here whenever the mix isn't simply "all adults", since
// an infant (lap seat, no fare of its own) or a child materially changes
// what the specialist needs to plan for, and collapsing them into just a
// total would drop information the customer genuinely submitted. Kept out
// of the SUBJECT line (which stays the short traveler count) and out of
// the Trip Summary tile for an adults-only request, so the common case
// doesn't read as redundant ("3 Travelers (3 Adults)").
function travelerBreakdown(input: FlightRequestNotificationInput): string {
  const parts: string[] = [];
  if (input.adults > 0) parts.push(`${input.adults} Adult${input.adults === 1 ? "" : "s"}`);
  if (input.children > 0) parts.push(`${input.children} Child${input.children === 1 ? "" : "ren"}`);
  if (input.infants > 0) parts.push(`${input.infants} Infant${input.infants === 1 ? "" : "s"}`);
  return parts.join(", ");
}

function travelerDisplay(input: FlightRequestNotificationInput): string {
  const label = travelerLabel(input);
  if (input.children === 0 && input.infants === 0) return label; // all-adults: the plain count already says it all
  return `${label} (${travelerBreakdown(input)})`;
}

const TRIP_TYPE_LABEL: Record<FlightRequestNotificationInput["tripType"], string> = {
  ONE_WAY: "One Way",
  ROUND_TRIP: "Round Trip",
  MULTI_CITY: "Multi-City",
};

/** "New Flight Request — JFK → CDG — 2 Travelers". Multi-city uses the first segment's origin and the last segment's destination — the overall journey's endpoints, not invented. IATA codes (not city names) keep it unambiguous and short. */
export function buildFlightRequestNotificationSubject(input: FlightRequestNotificationInput): string {
  const first = input.segments[0];
  const last = input.segments[input.segments.length - 1];
  return `New Flight Request — ${subjectSafe(first.from.iata)} → ${subjectSafe(last.to.iata)} — ${travelerLabel(input)}`;
}

function formatBudget(budget: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(budget);
}

// ---------------------------------------------------------------------------
// HTML building blocks. Table-based layout, inline styles only, no external
// CSS/JS/webfonts/emoji images — the set of email-client-safe constraints
// the task calls for. Colors/typography are the real brand tokens (see
// src/app/globals.css), not invented ones.
// ---------------------------------------------------------------------------
const NAVY_900 = "#0d2340";
const NAVY_950 = "#0a1a30";
const GOLD_500 = "#d29c4a";
const CREAM_50 = "#fbf9f5";
const CREAM_100 = "#f5f1e8";
const BORDER = "#e4ddce";
const MUTED = "#5b6b7d";

function sectionLabel(text: string): string {
  return `<tr><td style="padding:28px 24px 4px;"><p style="margin:0;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${GOLD_500};font-family:Georgia,'Times New Roman',serif;">${escapeHtml(text)}</p></td></tr>`;
}

function fieldRow(label: string, valueHtml: string): string {
  return (
    `<tr><td style="padding:10px 24px;border-bottom:1px solid ${BORDER};">` +
    `<p style="margin:0 0 3px;font-size:12px;color:${MUTED};">${escapeHtml(label)}</p>` +
    `<p style="margin:0;font-size:15px;color:${NAVY_950};word-break:break-word;">${valueHtml}</p>` +
    `</td></tr>`
  );
}

function airportBlock(a: FlightRequestAirport): string {
  return (
    `<p style="margin:0;font-size:17px;font-weight:700;color:${NAVY_950};">${escapeHtml(a.iata)}</p>` +
    `<p style="margin:2px 0 0;font-size:14px;color:${NAVY_950};word-break:break-word;">${escapeHtml(a.city)}, ${escapeHtml(a.country)}</p>` +
    `<p style="margin:1px 0 0;font-size:12px;color:${MUTED};word-break:break-word;">${escapeHtml(a.name)}</p>`
  );
}

function flightCard(title: string, from: FlightRequestAirport, to: FlightRequestAirport, dateLabel: string, dateValue: string): string {
  return (
    `<tr><td style="padding:0 24px 16px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM_100};border:1px solid ${BORDER};border-radius:8px;">` +
    `<tr><td style="padding:14px 18px 8px;"><p style="margin:0;font-size:13px;font-weight:700;color:${NAVY_900};">${escapeHtml(title)}</p></td></tr>` +
    `<tr><td style="padding:0 18px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>` +
    `<td valign="top" style="width:50%;padding:0 8px 14px 0;">` +
    `<p style="margin:0 0 4px;font-size:11px;color:${MUTED};text-transform:uppercase;letter-spacing:.04em;">Departure</p>${airportBlock(from)}` +
    `</td>` +
    `<td valign="top" style="width:50%;padding:0 0 14px 8px;border-left:1px solid ${BORDER};">` +
    `<p style="margin:0 0 4px;font-size:11px;color:${MUTED};text-transform:uppercase;letter-spacing:.04em;">Arrival</p>${airportBlock(to)}` +
    `</td>` +
    `</tr></table>` +
    `</td></tr>` +
    `<tr><td style="padding:0 18px 14px;border-top:1px solid ${BORDER};">` +
    `<p style="margin:12px 0 0;font-size:12px;color:${MUTED};">${escapeHtml(dateLabel)}</p>` +
    `<p style="margin:2px 0 0;font-size:14px;font-weight:600;color:${NAVY_950};">${escapeHtml(dateValue)}</p>` +
    `</td></tr>` +
    `</table></td></tr>`
  );
}

function itineraryHtml(input: FlightRequestNotificationInput): string {
  if (input.tripType === "MULTI_CITY") {
    return input.segments
      .map((seg, i) => flightCard(`Flight ${i + 1}`, seg.from, seg.to, "Departure Date", formatIsoDateLong(seg.departureDate)))
      .join("");
  }
  const outbound = input.segments[0];
  if (input.tripType === "ONE_WAY") {
    return flightCard("Flight", outbound.from, outbound.to, "Departure Date", formatIsoDateLong(outbound.departureDate));
  }
  // ROUND_TRIP: the return leg is the reverse of the outbound segment, on returnDate.
  const outboundCard = flightCard("Outbound Flight", outbound.from, outbound.to, "Departure Date", formatIsoDateLong(outbound.departureDate));
  const returnCard = input.returnDate ? flightCard("Return Flight", outbound.to, outbound.from, "Return Date", formatIsoDateLong(input.returnDate)) : "";
  return outboundCard + returnCard;
}

function additionalInfoHtml(input: FlightRequestNotificationInput): string {
  const rows: string[] = [];
  if (input.flexibleDates) rows.push(fieldRow("Flexible Dates", "Yes — the traveler can shift dates for a better fare"));
  if (input.preferredAirline?.trim()) rows.push(fieldRow("Preferred Airline", escapeHtml(input.preferredAirline.trim())));
  if (typeof input.budget === "number") rows.push(fieldRow("Budget", escapeHtml(formatBudget(input.budget))));
  if (input.notes?.trim()) {
    rows.push(fieldRow("Notes", escapeHtml(input.notes.trim()).replace(/\r?\n/g, "<br>")));
  }
  if (rows.length === 0) return ""; // never render an empty section
  return sectionLabel("Additional Information") + rows.join("");
}

/** Builds the subject, HTML body, and plain-text fallback. Pure — no I/O, fully deterministic given `input`. */
export function buildFlightRequestNotificationEmail(input: FlightRequestNotificationInput): { subject: string; html: string; text: string } {
  const subject = buildFlightRequestNotificationSubject(input);
  const fullName = `${input.firstName} ${input.lastName}`;
  // A plain "mailto:address" (no percent-encoding): the address is already
  // zod-validated (.email()), so it never contains characters that need
  // escaping, and encoding the "@" (e.g. to "%40") is unnecessary and some
  // mail clients handle it less reliably than the plain, literal address.
  //
  // Both are used only inside double-quoted href="…" attributes, so they are
  // HTML-escaped here too: zod/libphonenumber already constrain these values
  // upstream, but this function is also called directly with hand-built
  // input, and a stray `"` must never be able to end the attribute.
  const mailtoHref = escapeHtml(`mailto:${input.email}`);
  const telHref = escapeHtml(`tel:${input.phoneE164.replace(/\s+/g, "")}`);
  const logoUrl = `${SITE_URL}/brand/logo-white.png`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${CREAM_50};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<span style="display:none;max-height:0;overflow:hidden;">New flight request from ${escapeHtml(fullName)}: ${escapeHtml(input.segments[0].from.iata)} to ${escapeHtml(input.segments[input.segments.length - 1].to.iata)}.</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM_50};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid ${BORDER};">

<tr><td style="background:${NAVY_900};padding:28px 24px;text-align:center;">
<img src="${logoUrl}" width="170" alt="${escapeHtml(SITE_NAME)}" style="display:block;margin:0 auto 14px;width:170px;max-width:60%;height:auto;">
<p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">New Flight Request</p>
<p style="margin:6px 0 0;font-size:14px;color:${GOLD_500};">From ${escapeHtml(fullName)}</p>
</td></tr>

${sectionLabel("Trip Summary")}
<tr><td style="padding:4px 24px 8px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td width="33%" valign="top" style="padding:8px 4px;"><p style="margin:0 0 2px;font-size:11px;color:${MUTED};">Trip Type</p><p style="margin:0;font-size:14px;font-weight:600;color:${NAVY_950};">${escapeHtml(TRIP_TYPE_LABEL[input.tripType])}</p></td>
<td width="34%" valign="top" style="padding:8px 4px;"><p style="margin:0 0 2px;font-size:11px;color:${MUTED};">Cabin Class</p><p style="margin:0;font-size:14px;font-weight:600;color:${NAVY_950};">${escapeHtml(cabinLabel(input.cabinClass))}</p></td>
<td width="33%" valign="top" style="padding:8px 4px;"><p style="margin:0 0 2px;font-size:11px;color:${MUTED};">Travelers</p><p style="margin:0;font-size:14px;font-weight:600;color:${NAVY_950};">${escapeHtml(travelerDisplay(input))}</p></td>
</tr></table>
</td></tr>

${sectionLabel("Client Information")}
<tr><td style="padding:4px 24px 8px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDER};border-radius:8px;overflow:hidden;">
${fieldRow("Full Name", escapeHtml(fullName))}
${fieldRow("Email Address", `<a href="${mailtoHref}" style="color:${NAVY_900};text-decoration:underline;">${escapeHtml(input.email)}</a>`)}
${fieldRow("Phone Number", `<a href="${telHref}" style="color:${NAVY_900};text-decoration:underline;">${escapeHtml(input.phoneE164)}</a>`)}
</table>
</td></tr>

${sectionLabel("Flight Itinerary")}
${itineraryHtml(input)}

${additionalInfoHtml(input)}

<tr><td style="padding:24px 24px 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${NAVY_900};border-radius:8px;">
<tr><td style="padding:20px 20px 16px;text-align:center;">
<p style="margin:0 0 14px;font-size:14px;color:#ffffff;">Please respond to this client as soon as possible.<br>Reply to this email or contact the client directly.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>
<td style="padding:0 6px;"><a href="${mailtoHref}" style="display:inline-block;background:${GOLD_500};color:${NAVY_950};font-size:13px;font-weight:700;text-decoration:none;padding:10px 18px;border-radius:6px;">Reply to Client</a></td>
<td style="padding:0 6px;"><a href="${telHref}" style="display:inline-block;background:transparent;border:1px solid #ffffff;color:#ffffff;font-size:13px;font-weight:700;text-decoration:none;padding:10px 18px;border-radius:6px;">Call Client</a></td>
</tr></table>
</td></tr>
</table>
</td></tr>

${sectionLabel("Submission Details")}
<tr><td style="padding:4px 24px 24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDER};border-radius:8px;overflow:hidden;">
${fieldRow("Submitted", escapeHtml(formatSubmittedAt(input.submittedAt)))}
${fieldRow("Source", `${escapeHtml(SITE_NAME)} Website`)}
</table>
</td></tr>

<tr><td style="padding:18px 24px;background:${CREAM_100};border-top:1px solid ${BORDER};text-align:center;">
<p style="margin:0;font-size:11px;color:${MUTED};">${escapeHtml(SITE_NAME)} &middot; ${escapeHtml(COMPANY_ADDRESS)}</p>
<p style="margin:4px 0 0;font-size:11px;color:${MUTED};">${escapeHtml(CONTACT_PHONE_DISPLAY)} &middot; ${escapeHtml(CONTACT_EMAIL)}</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

  const text = buildPlainText(input, fullName);
  return { subject, html, text };
}

function plainTextItinerary(input: FlightRequestNotificationInput): string {
  const leg = (title: string, from: FlightRequestAirport, to: FlightRequestAirport, dateLabel: string, dateValue: string) =>
    `${title}\n` +
    `  Departure: ${from.iata} — ${from.city}, ${from.country} (${from.name})\n` +
    `  Arrival:   ${to.iata} — ${to.city}, ${to.country} (${to.name})\n` +
    `  ${dateLabel}: ${dateValue}\n`;

  if (input.tripType === "MULTI_CITY") {
    return input.segments.map((seg, i) => leg(`Flight ${i + 1}`, seg.from, seg.to, "Departure Date", formatIsoDateLong(seg.departureDate))).join("\n");
  }
  const outbound = input.segments[0];
  if (input.tripType === "ONE_WAY") return leg("Flight", outbound.from, outbound.to, "Departure Date", formatIsoDateLong(outbound.departureDate));
  const out = leg("Outbound Flight", outbound.from, outbound.to, "Departure Date", formatIsoDateLong(outbound.departureDate));
  const ret = input.returnDate ? "\n" + leg("Return Flight", outbound.to, outbound.from, "Return Date", formatIsoDateLong(input.returnDate)) : "";
  return out + ret;
}

function buildPlainText(input: FlightRequestNotificationInput, fullName: string): string {
  const lines: string[] = [];
  lines.push("BUSINESS FLIGHTS TRAVEL — NEW FLIGHT REQUEST");
  lines.push(`From: ${fullName}`);
  lines.push("");
  lines.push("TRIP SUMMARY");
  lines.push(`Trip Type: ${TRIP_TYPE_LABEL[input.tripType]}`);
  lines.push(`Cabin Class: ${cabinLabel(input.cabinClass)}`);
  lines.push(`Travelers: ${travelerDisplay(input)}`);
  lines.push("");
  lines.push("CLIENT INFORMATION");
  lines.push(`Full Name: ${fullName}`);
  lines.push(`Email Address: ${input.email}`);
  lines.push(`Phone Number: ${input.phoneE164}`);
  lines.push("");
  lines.push("FLIGHT ITINERARY");
  lines.push(plainTextItinerary(input));

  const extra: string[] = [];
  if (input.flexibleDates) extra.push("Flexible Dates: Yes — the traveler can shift dates for a better fare");
  if (input.preferredAirline?.trim()) extra.push(`Preferred Airline: ${input.preferredAirline.trim()}`);
  if (typeof input.budget === "number") extra.push(`Budget: ${formatBudget(input.budget)}`);
  if (input.notes?.trim()) extra.push(`Notes: ${input.notes.trim()}`);
  if (extra.length) {
    lines.push("ADDITIONAL INFORMATION");
    lines.push(...extra);
    lines.push("");
  }

  lines.push("ACTION REQUIRED");
  lines.push("Please respond to this client as soon as possible. Reply to this email or contact the client directly.");
  lines.push("");
  lines.push("SUBMISSION DETAILS");
  lines.push(`Submitted: ${formatSubmittedAt(input.submittedAt)}`);
  lines.push(`Source: ${SITE_NAME} Website`);
  lines.push("");
  lines.push(`${SITE_NAME} — ${COMPANY_ADDRESS}`);
  lines.push(`${CONTACT_PHONE_DISPLAY} — ${CONTACT_EMAIL}`);
  return lines.join("\n");
}

type LogLevel = "info" | "warn" | "error";

export type SendFlightRequestNotificationResult =
  | { sent: true; messageId: string }
  | { sent: false; reason: "not_configured" | "send_failed"; category?: NodemailerErrorCategory };

// Nodemailer's own stable error `code` values (see its SMTP transport
// source) translated into a human-readable category — specifically so a
// real production failure's log line names the actual failure mode
// (auth vs. connection vs. envelope vs. something else) instead of forcing
// whoever reads it to go decode a raw Nodemailer error by hand. This is
// the "safe SMTP connection verification" this module provides: never a
// public endpoint, never anything beyond this one structured log line, and
// never anything that touches process.env or the raw error object itself
// (which Nodemailer error classes do NOT embed credentials in, but this
// still only ever forwards `message`/`code`/`command`/`responseCode` —
// protocol metadata, not configuration).
type NodemailerErrorCategory =
  | "authentication_failed" // EAUTH — wrong GMAIL_SENDER_EMAIL/GMAIL_APP_PASSWORD, or the account's own security policy rejected it
  | "connection_failed" // ECONNECTION / ESOCKET / ETIMEDOUT / EDNS / ECONNRESET — could not reach (or stay connected to) smtp.gmail.com; src/lib/email/mailer.ts already retries this category once before it ever reaches here
  | "envelope_rejected" // EENVELOPE, OR a "successful" sendMail() that still reports the recipient in `rejected` — Gmail accepted the connection but refused the sender or every recipient address
  | "message_rejected" // EMESSAGE — Gmail rejected the message itself (e.g. content policy)
  | "configuration_invalid" // GMAIL_SENDER_EMAIL (after cleaning) doesn't look like an email address at all — caught before spending an SMTP round-trip on a doomed send
  | "other";

function categorizeNodemailerError(code: unknown): NodemailerErrorCategory {
  switch (code) {
    case "EAUTH":
      return "authentication_failed";
    case "ECONNECTION":
    case "ESOCKET":
    case "ETIMEDOUT":
    case "EDNS":
    case "ECONNRESET":
    case "ETLS": // TLS handshake/close failure on the same connection — not retried (see isTransientConnectionError), but still a connection-class failure
      return "connection_failed";
    case "EENVELOPE":
      return "envelope_rejected";
    case "EMESSAGE":
      return "message_rejected";
    default:
      return "other";
  }
}

/**
 * Sends the internal notification. NEVER throws — a failure here must never
 * roll back, or appear to roll back, an already-persisted Flight Request
 * (see the file header and submit-flight-request.ts's call site). Returns
 * a result object purely so callers/tests can observe what happened;
 * production code does not need to branch on it.
 */
export async function sendFlightRequestNotification(
  input: FlightRequestNotificationInput,
  options: { mailer: Mailer; log?: (message: string, level?: LogLevel) => void },
): Promise<SendFlightRequestNotificationResult> {
  // Runs after the customer's response (see submit-flight-request.ts), so
  // this log line is the ONLY trace of the outcome: a successful send must
  // not be filed under "error" in the platform's log filters, and a real
  // failure must be. No customer data is ever put in any of these lines —
  // only the sender address, SMTP protocol metadata and a failure category.
  const log =
    options.log ??
    ((m: string, level: LogLevel = "info") => {
      console[level](m);
    });
  // The same Gmail address is both sender and recipient — there is no
  // separate notification-recipient variable. This file reads
  // GMAIL_SENDER_EMAIL (never GMAIL_APP_PASSWORD, which stays exclusively
  // in src/lib/email/mailer.ts) only to resolve that one address and to
  // decide whether the feature is configured at all; mailer.ts re-reads the
  // same variable independently to build the actual `from` header, so the
  // two can never drift apart — both always clean the same raw value the
  // same way (see src/lib/email/smtp-helpers.ts).
  const rawSender = process.env.GMAIL_SENDER_EMAIL;
  if (!rawSender) {
    // Not an error: the feature is simply unconfigured for this environment
    // (e.g. a fresh deployment before an admin has set it up). Never blocks
    // or alters the customer's own successful response.
    log("[flight-request-notification] GMAIL_SENDER_EMAIL is not set — skipping internal notification.", "warn");
    return { sent: false, reason: "not_configured" };
  }
  // Cleaned the same way mailer.ts cleans it for the sender role: a
  // trailing newline or surrounding quotes pasted into Vercel's dashboard is
  // an easy, common mistake. Validated BEFORE attempting to send — an
  // obviously malformed value (empty after cleaning, missing an "@", etc.)
  // is caught here with a clear diagnostic rather than spending a real SMTP
  // round-trip on a doomed send that Gmail would reject anyway.
  const cleanedTo = cleanEnvValue(rawSender);
  const cleanedToLength = cleanedTo?.length ?? 0;
  if (!isPlausibleEmail(cleanedTo)) {
    log(`[flight-request-notification] GMAIL_SENDER_EMAIL is set but does not look like a valid email address — skipping internal notification. (length after cleaning: ${cleanedToLength})`, "error");
    return { sent: false, reason: "send_failed", category: "configuration_invalid" };
  }
  const to = cleanedTo;
  try {
    const { subject, html, text } = buildFlightRequestNotificationEmail(input);
    // The email's own body tells the reader to "Reply to this email" to
    // reach the client — Reply-To makes that literally true. Without it,
    // Gmail's own Reply action would otherwise go back to `to` (the same
    // GMAIL_SENDER_EMAIL address), since FROM and TO are the same inbox.
    // `input.email` is zod-validated (.email()) before this module sees it;
    // isPlausibleEmail() is re-checked here because this function is also
    // called directly with hand-built input, and the value becomes a header.
    // If it fails (or contains an apostrophe, which that check also
    // rejects), Reply-To is simply omitted — the notification still goes
    // out, and the body's own mailto: link still reaches the customer.
    const replyTo = isPlausibleEmail(input.email) ? input.email : undefined;
    const info = await options.mailer.send({ to, subject, html, text, replyTo });
    // Nodemailer can resolve `sendMail()` successfully (not throw) while
    // still reporting the recipient in `rejected` rather than `accepted` —
    // e.g. the connection and authentication both succeeded but Gmail
    // refused this specific address. A non-throwing resolve is therefore
    // NOT by itself proof of acceptance; `rejected` must be empty too.
    if (info.rejected.length > 0) {
      log(
        `[flight-request-notification] SMTP did not throw, but rejected the recipient: messageId=${info.messageId} rejected=${JSON.stringify(info.rejected)} response="${info.response}"`,
        "error",
      );
      return { sent: false, reason: "send_failed", category: "envelope_rejected" };
    }
    // This is evidence of SMTP ACCEPTANCE (Gmail's own server reply), not
    // proof the recipient's inbox displayed the message — nothing past the
    // SMTP handshake (spam filtering, inbox rules) is observable from here,
    // for any email sender on any provider. `response`/`accepted` are the
    // server's own reply text and the addresses it accepted — safe,
    // non-secret protocol metadata.
    log(
      `[flight-request-notification] SMTP accepted the message: messageId=${info.messageId} accepted=${JSON.stringify(info.accepted)} response="${info.response}"`,
      "info",
    );
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    // Safe, credential-free diagnostic only: never the raw error object (which
    // could carry transport/config details), never process.env, just the
    // message/standard SMTP protocol fields a Nodemailer error exposes.
    const e = err as { message?: unknown; code?: unknown; command?: unknown; responseCode?: unknown } | null;
    const message = typeof e?.message === "string" ? e.message.slice(0, 300) : "unknown error";
    const code = typeof e?.code === "string" || typeof e?.code === "number" ? e.code : undefined;
    const command = typeof e?.command === "string" ? ` command=${e.command}` : "";
    const category = categorizeNodemailerError(code);
    log(`[flight-request-notification] Failed to send internal notification (${category}): ${message}${code ? ` code=${code}` : ""}${command}`, "error");
    return { sent: false, reason: "send_failed", category };
  }
}
