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
import type { ApproximateLocation } from "@/lib/ip-geo";
import type { IpVersion } from "@/lib/client-ip";

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
  /** ISO 4217 code the customer chose for `budget`. Never converted; absent => the amount is shown flagged as having no currency. */
  budgetCurrency?: string;
  notes?: string;
  segments: FlightRequestSegment[];
  returnDate?: string; // "YYYY-MM-DD", only meaningful for ROUND_TRIP
  submittedAt: Date;
  /** What the SERVER learned about the request (never a form field). Every part is optional; nothing absent is shown. */
  submission?: {
    ip?: { address: string; version: IpVersion };
    location?: ApproximateLocation;
    locationSource?: string;
  };
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

// `date` is optional: a one-way or round-trip request's dates live in the
// "Travel Dates" section, while each leg of a multi-city request carries its
// own date on its card.
function flightCard(title: string, from: FlightRequestAirport, to: FlightRequestAirport, date?: { label: string; value: string }): string {
  return (
    `<tr><td style="padding:0 24px 16px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM_100};border:1px solid ${BORDER};border-radius:8px;">` +
    `<tr><td style="padding:14px 18px 8px;"><p style="margin:0;font-size:13px;font-weight:700;color:${NAVY_900};">${escapeHtml(title)}</p></td></tr>` +
    `<tr><td style="padding:0 18px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>` +
    `<td valign="top" style="width:50%;padding:0 8px 14px 0;">` +
    `<p style="margin:0 0 4px;font-size:11px;color:${MUTED};text-transform:uppercase;letter-spacing:.04em;">From</p>${airportBlock(from)}` +
    `</td>` +
    `<td valign="top" style="width:50%;padding:0 0 14px 8px;border-left:1px solid ${BORDER};">` +
    `<p style="margin:0 0 4px;font-size:11px;color:${MUTED};text-transform:uppercase;letter-spacing:.04em;">To</p>${airportBlock(to)}` +
    `</td>` +
    `</tr></table>` +
    `</td></tr>` +
    (date
      ? `<tr><td style="padding:0 18px 14px;border-top:1px solid ${BORDER};">` +
        `<p style="margin:12px 0 0;font-size:12px;color:${MUTED};">${escapeHtml(date.label)}</p>` +
        `<p style="margin:2px 0 0;font-size:14px;font-weight:600;color:${NAVY_950};">${escapeHtml(date.value)}</p>` +
        `</td></tr>`
      : "") +
    `</table></td></tr>`
  );
}

function routeHtml(input: FlightRequestNotificationInput): string {
  const first = input.segments[0];
  if (input.tripType === "MULTI_CITY") {
    return input.segments
      .map((seg, i) => flightCard(`Flight ${i + 1}`, seg.from, seg.to, { label: "Departure Date", value: formatIsoDateLong(seg.departureDate) }))
      .join("");
  }
  return flightCard(input.tripType === "ROUND_TRIP" ? "Round Trip" : "One Way", first.from, first.to);
}

function routePlainText(input: FlightRequestNotificationInput): string {
  const leg = (title: string, from: FlightRequestAirport, to: FlightRequestAirport, date?: string) =>
    `${title}\n` +
    `  From: ${from.iata} — ${from.city}, ${from.country} (${from.name})\n` +
    `  To:   ${to.iata} — ${to.city}, ${to.country} (${to.name})\n` +
    (date ? `  Departure Date: ${date}\n` : "");
  if (input.tripType === "MULTI_CITY") return input.segments.map((seg, i) => leg(`Flight ${i + 1}`, seg.from, seg.to, formatIsoDateLong(seg.departureDate))).join("\n");
  const first = input.segments[0];
  return leg(input.tripType === "ROUND_TRIP" ? "Round Trip" : "One Way", first.from, first.to);
}

// ---------------------------------------------------------------------------
// The key/value sections. Built ONCE as data and rendered into both the HTML
// and the plain-text part, so the two can never drift apart, and a field the
// customer left blank simply produces no row (and a section with no rows is
// never rendered at all).
// ---------------------------------------------------------------------------
type Row = { label: string; value: string; href?: string; multiline?: boolean };
type Section = { title: string; rows: Row[]; note?: string };

export const IP_LOCATION_NOTE =
  "Location is approximate and estimated from the IP address. It can be inaccurate (VPNs, proxies, mobile and corporate networks, privacy relays) and does not show where the customer physically is. The IP address itself is the value the server received.";

/** "AUD 8,000" — the customer's own currency, never converted. Without one, the amount is shown plainly and flagged rather than assumed to be dollars. */
export function formatBudget(amount: number, currency?: string): string {
  const plain = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(amount);
  if (currency && /^[A-Z]{3}$/.test(currency)) {
    try {
      const formatted = new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "code", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount);
      return formatted.replace(/\s+/g, " ");
    } catch {
      return `${currency} ${plain}`;
    }
  }
  return `${plain} (currency not specified)`;
}

function buildSections(input: FlightRequestNotificationInput): Section[] {
  const sections: Section[] = [];
  const fullName = `${input.firstName} ${input.lastName}`;

  const dates: Row[] = [{ label: "Trip Type", value: TRIP_TYPE_LABEL[input.tripType] }];
  if (input.tripType !== "MULTI_CITY") {
    dates.push({ label: "Departure Date", value: formatIsoDateLong(input.segments[0].departureDate) });
    if (input.tripType === "ROUND_TRIP" && input.returnDate) dates.push({ label: "Return Date", value: formatIsoDateLong(input.returnDate) });
  }
  if (input.flexibleDates) dates.push({ label: "Flexible Dates", value: "Yes — the traveler can shift dates for a better fare" });
  sections.push({ title: "Travel Dates", rows: dates });

  const travelers: Row[] = [
    { label: "Total Travelers", value: String(travelerCount(input)) },
    { label: "Adults", value: String(input.adults) },
  ];
  if (input.children > 0) travelers.push({ label: "Children", value: String(input.children) });
  if (input.infants > 0) travelers.push({ label: "Infants", value: String(input.infants) });
  sections.push({ title: "Travelers", rows: travelers });

  const cabin: Row[] = [{ label: "Cabin Class", value: cabinLabel(input.cabinClass) }];
  if (input.preferredAirline?.trim()) cabin.push({ label: "Preferred Airline", value: input.preferredAirline.trim() });
  sections.push({ title: "Cabin & Preferences", rows: cabin });

  if (typeof input.budget === "number") {
    sections.push({ title: "Budget", rows: [{ label: "Approximate Budget", value: formatBudget(input.budget, input.budgetCurrency) }] });
  }

  sections.push({
    title: "Customer",
    rows: [
      { label: "Full Name", value: fullName },
      { label: "Email Address", value: input.email, href: `mailto:${input.email}` },
      { label: "Phone Number", value: input.phoneE164, href: `tel:${input.phoneE164.replace(/\s+/g, "")}` },
    ],
  });

  if (input.notes?.trim()) {
    sections.push({ title: "Additional Information", rows: [{ label: "Special Requests / Notes", value: input.notes.trim(), multiline: true }] });
  }
  return sections;
}

function buildSubmissionSection(input: FlightRequestNotificationInput): Section {
  const ip = input.submission?.ip;
  const location = input.submission?.location;
  const rows: Row[] = [];
  if (ip) {
    rows.push({ label: "IP Address", value: ip.address });
    rows.push({ label: "IP Version", value: ip.version === "v6" ? "IPv6" : "IPv4" });
  }
  if (location) {
    // One labelled row per field, each prefixed "Approximate" — never a
    // single "Customer Location" line — and only the ones actually obtained.
    if (location.city) rows.push({ label: "Approximate City", value: location.city });
    if (location.region ?? location.regionCode) rows.push({ label: "Approximate Region", value: (location.region ?? location.regionCode) as string });
    if (location.country ?? location.countryCode) rows.push({ label: "Approximate Country", value: (location.country ?? location.countryCode) as string });
    if (location.country && location.countryCode) rows.push({ label: "Country Code", value: location.countryCode });
    if (location.timeZone) rows.push({ label: "Time Zone", value: location.timeZone });
    if (input.submission?.locationSource) rows.push({ label: "Location Source", value: input.submission.locationSource });
  }
  rows.push({ label: "Submitted", value: formatSubmittedAt(input.submittedAt) });
  rows.push({ label: "Source", value: `${SITE_NAME} Website` });
  return {
    title: ip || location ? "Submission & IP Information" : "Submission Details",
    rows,
    note: location || ip ? IP_LOCATION_NOTE : undefined,
  };
}

function sectionHtml(section: Section): string {
  if (section.rows.length === 0) return "";
  const rows = section.rows.map((r) => {
    const valueHtml = r.multiline ? escapeHtml(r.value).replace(/\r?\n/g, "<br>") : escapeHtml(r.value);
    // href is only ever built from an already-validated email / E.164 number, and is
    // HTML-escaped anyway so a stray quote can never end the attribute.
    const withLink = r.href ? `<a href="${escapeHtml(r.href)}" style="color:${NAVY_900};text-decoration:underline;">${valueHtml}</a>` : valueHtml;
    return fieldRow(r.label, withLink);
  });
  const note = section.note ? `<tr><td style="padding:8px 24px 0;"><p style="margin:0;font-size:11px;line-height:1.5;color:${MUTED};">${escapeHtml(section.note)}</p></td></tr>` : "";
  return (
    sectionLabel(section.title) +
    `<tr><td style="padding:4px 24px 8px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDER};border-radius:8px;overflow:hidden;">` +
    rows.join("\n") +
    `</table></td></tr>` +
    note
  );
}

function sectionText(section: Section): string {
  if (section.rows.length === 0) return "";
  const lines = [section.title.toUpperCase(), ...section.rows.map((r) => `${r.label}: ${r.value}`)];
  if (section.note) lines.push("", section.note);
  return lines.join("\n");
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
  const sections = buildSections(input);
  const submission = buildSubmissionSection(input);

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

${sectionLabel("Route")}
${routeHtml(input)}

${sections.map(sectionHtml).join("\n")}

<tr><td style="padding:24px 24px 8px;">
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

${sectionHtml(submission)}
<tr><td style="padding:0 0 16px;font-size:0;line-height:0;">&nbsp;</td></tr>

<tr><td style="padding:18px 24px;background:${CREAM_100};border-top:1px solid ${BORDER};text-align:center;">
<p style="margin:0;font-size:11px;color:${MUTED};">${escapeHtml(SITE_NAME)} &middot; ${escapeHtml(COMPANY_ADDRESS)}</p>
<p style="margin:4px 0 0;font-size:11px;color:${MUTED};">${escapeHtml(CONTACT_PHONE_DISPLAY)} &middot; ${escapeHtml(CONTACT_EMAIL)}</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    "BUSINESS FLIGHTS TRAVEL — NEW FLIGHT REQUEST",
    `From: ${fullName}`,
    "",
    "ROUTE",
    routePlainText(input),
    ...sections.map(sectionText).filter(Boolean).flatMap((s) => [s, ""]),
    "ACTION REQUIRED",
    "Please respond to this client as soon as possible. Reply to this email or contact the client directly.",
    "",
    sectionText(submission),
    "",
    `${SITE_NAME} — ${COMPANY_ADDRESS}`,
    `${CONTACT_PHONE_DISPLAY} — ${CONTACT_EMAIL}`,
  ].join("\n");
  return { subject, html, text };
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
    case "ECONFIG": // thrown by mailer.ts when GMAIL_SENDER_EMAIL or GMAIL_APP_PASSWORD is missing
      return "configuration_invalid";
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
