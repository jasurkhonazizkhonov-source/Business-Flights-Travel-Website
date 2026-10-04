import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  buildFlightRequestNotificationEmail,
  buildFlightRequestNotificationSubject,
  formatIsoDateLong,
  formatSubmittedAt,
  sendFlightRequestNotification,
  type FlightRequestNotificationInput,
} from "../src/lib/email/flight-request-notification";
import type { Mailer, MailMessage } from "../src/lib/email/mailer";
import { airportSchema, flightRequestSchema } from "../src/lib/validations/flight-request";
import { deriveLeadId } from "../src/lib/submission-id";

// Everything here exercises src/lib/email/flight-request-notification.ts
// directly — it is deliberately dependency-free (pure template building) or
// takes its I/O (the Mailer) as a parameter, so none of this needs a dev
// server, a browser, or a real SMTP connection. Same reasoning
// tests/anti-spam.spec.ts documents for extracting that logic out of the
// "use server" action file. src/lib/email/mailer.ts (the only module that
// touches `nodemailer` or reads GMAIL_APP_PASSWORD) is never imported here.

const JFK = { iata: "JFK", city: "New York", country: "United States", name: "John F. Kennedy International Airport" };
const CDG = { iata: "CDG", city: "Paris", country: "France", name: "Paris Charles de Gaulle Airport" };
const RUN = { iata: "RUN", city: "Saint-Denis", country: "Réunion", name: "Roland Garros Airport" };

const BASE: FlightRequestNotificationInput = {
  firstName: "Jayan",
  lastName: "Grondin",
  email: "jayan@example.com",
  phoneE164: "+33783905717",
  tripType: "ONE_WAY",
  cabinClass: "Business Class",
  adults: 1,
  children: 0,
  infants: 0,
  flexibleDates: false,
  segments: [{ from: JFK, to: CDG, departureDate: "2026-10-24" }],
  submittedAt: new Date("2026-10-01T16:41:00Z"),
};

// A request the real zod schema accepts, so schema-level tests change exactly
// one field at a time. The date is far in the future so "not in the past"
// never flips this fixture to invalid.
function validRequest() {
  return {
    tripType: "ONE_WAY" as const,
    segments: [{ from: JFK, to: CDG, departureDate: "2099-01-01" }],
    cabinClass: "BUSINESS" as const,
    adults: 1,
    children: 0,
    infants: 0,
    flexibleDates: false,
    firstName: "Jayan",
    lastName: "Grondin",
    email: "jayan@example.com",
    phone: "+14155550123",
  };
}

function fakeMailer(impl?: (m: MailMessage) => void | Promise<void>): { mailer: Mailer; sent: MailMessage[] } {
  const sent: MailMessage[] = [];
  return {
    sent,
    mailer: {
      async send(message) {
        sent.push(message);
        if (impl) await impl(message);
        return { messageId: "fake-message-id", response: "250 2.0.0 OK (fake)", accepted: [message.to], rejected: [] };
      },
    },
  };
}

test.describe("date/time formatting", () => {
  test("formatIsoDateLong renders the UTC calendar date regardless of server timezone", () => {
    expect(formatIsoDateLong("2026-10-24")).toBe("Saturday, October 24, 2026");
    expect(formatIsoDateLong("2026-10-06")).toBe("Tuesday, October 6, 2026");
  });

  test("formatSubmittedAt renders an explicit, literal UTC suffix (never the visitor's browser clock)", () => {
    expect(formatSubmittedAt(new Date("2026-10-01T16:41:00Z"))).toBe("Thursday, October 1, 2026, 4:41 PM UTC");
  });
});

test.describe("subject line", () => {
  test("one-way: origin -> destination with traveler count", () => {
    expect(buildFlightRequestNotificationSubject(BASE)).toBe("New Flight Request — JFK → CDG — 1 Traveler");
  });

  test("plural travelers", () => {
    expect(buildFlightRequestNotificationSubject({ ...BASE, adults: 2 })).toContain("2 Travelers");
  });

  test("multi-city uses the first segment's origin and the LAST segment's destination (the journey's real endpoints, not invented)", () => {
    const multi: FlightRequestNotificationInput = {
      ...BASE,
      tripType: "MULTI_CITY",
      segments: [
        { from: JFK, to: CDG, departureDate: "2026-10-24" },
        { from: CDG, to: RUN, departureDate: "2026-10-26" },
      ],
    };
    expect(buildFlightRequestNotificationSubject(multi)).toBe("New Flight Request — JFK → RUN — 1 Traveler");
  });
});

test.describe("buildFlightRequestNotificationEmail — HTML + text content", () => {
  test("contains the correct client information, with working mailto/tel links", () => {
    const { html, text } = buildFlightRequestNotificationEmail(BASE);
    expect(html).toContain("Jayan Grondin");
    expect(html).toContain('href="mailto:jayan@example.com"');
    expect(html).toContain('href="tel:+33783905717"');
    expect(html).toContain("jayan@example.com");
    expect(html).toContain("+33783905717");
    expect(text).toContain("Full Name: Jayan Grondin");
    expect(text).toContain("Email Address: jayan@example.com");
    expect(text).toContain("Phone Number: +33783905717");
  });

  test("one-way: a single 'One Way' route card with the airports; the date lives in Travel Dates, not on the card", () => {
    const { html, text } = buildFlightRequestNotificationEmail(BASE);
    expect(html).toContain(">One Way<");
    expect(html).not.toContain("Outbound Flight");
    expect(html).not.toContain("Return Flight");
    expect(html).toContain("JFK");
    expect(html).toContain("New York, United States");
    expect(html).toContain("John F. Kennedy International Airport");
    expect(html).toContain("CDG");
    expect(text).toContain("From: JFK");
    expect(text).toContain("To:   CDG");
    expect(html).toContain("Departure Date");
    expect(text).toContain("Departure Date: Saturday, October 24, 2026");
  });

  test("round trip: one 'Round Trip' route card, and Travel Dates carries BOTH the departure and the return date", () => {
    const roundTrip: FlightRequestNotificationInput = {
      ...BASE,
      tripType: "ROUND_TRIP",
      segments: [{ from: RUN, to: CDG, departureDate: "2026-10-24" }],
      returnDate: "2026-10-06",
    };
    const { html, text } = buildFlightRequestNotificationEmail(roundTrip);
    expect(html).toContain(">Round Trip<");
    expect(html).toContain("Saint-Denis, Réunion");
    expect(text).toContain("Departure Date: Saturday, October 24, 2026");
    expect(text).toContain("Return Date: Tuesday, October 6, 2026");
    expect(html).toContain("Tuesday, October 6, 2026");
  });

  test("multi-city renders one card per submitted segment, each correctly labeled and dated", () => {
    const multi: FlightRequestNotificationInput = {
      ...BASE,
      tripType: "MULTI_CITY",
      segments: [
        { from: JFK, to: CDG, departureDate: "2026-10-24" },
        { from: CDG, to: RUN, departureDate: "2026-10-26" },
      ],
    };
    const { html, text } = buildFlightRequestNotificationEmail(multi);
    expect(html).toContain("Flight 1");
    expect(html).toContain("Flight 2");
    expect(html).toContain("Saturday, October 24, 2026");
    expect(html).toContain("Monday, October 26, 2026");
    expect(text).toContain("Flight 2");
    expect(text).toContain("Departure Date: Monday, October 26, 2026");
    // A multi-city request has no single departure/return date row.
    expect(text).not.toMatch(/^Return Date:/m);
  });

  test("optional fields (flexible dates, preferred airline, budget, notes) render when present, in HTML and text", () => {
    const withExtras: FlightRequestNotificationInput = {
      ...BASE,
      flexibleDates: true,
      preferredAirline: "Air France",
      budget: 8500,
      budgetCurrency: "USD",
      notes: "Prefers aisle seat.\nTraveling for a wedding.",
    };
    const { html, text } = buildFlightRequestNotificationEmail(withExtras);
    expect(html).toContain("Additional Information");
    expect(html).toContain("Flexible Dates");
    expect(html).toContain("Air France");
    expect(html).toContain("USD 8,500");
    expect(html).toContain("Prefers aisle seat.");
    expect(html).toContain("Traveling for a wedding.");
    expect(text).toContain("Flexible Dates: Yes");
    expect(text).toContain("Preferred Airline: Air France");
    expect(text).toContain("Approximate Budget: USD 8,500");
    expect(text).toContain("Prefers aisle seat.\nTraveling for a wedding.");
  });

  test("the budget keeps the customer's own currency — AUD is shown as AUD, never converted or shown as a bare dollar figure", () => {
    const aud = buildFlightRequestNotificationEmail({ ...BASE, budget: 8000, budgetCurrency: "AUD" });
    expect(aud.html).toContain("AUD 8,000");
    expect(aud.text).toContain("Approximate Budget: AUD 8,000");
    expect(aud.html).not.toContain("$");
    expect(aud.text).not.toContain("$");
    for (const [code, amount] of [["EUR", "EUR 1,500"], ["GBP", "GBP 1,500"], ["AED", "AED 1,500"], ["JPY", "JPY 1,500"]] as const) {
      expect(buildFlightRequestNotificationEmail({ ...BASE, budget: 1500, budgetCurrency: code }).text, code).toContain(`Approximate Budget: ${amount}`);
    }
  });

  test("a budget with NO currency is shown plainly and flagged — never assumed to be dollars", () => {
    const { html, text } = buildFlightRequestNotificationEmail({ ...BASE, budget: 8500 });
    expect(text).toContain("Approximate Budget: 8,500 (currency not specified)");
    expect(html).toContain("8,500 (currency not specified)");
    expect(html + text).not.toContain("$");
  });

  test("no budget at all -> no Budget section anywhere", () => {
    const { html, text } = buildFlightRequestNotificationEmail(BASE);
    expect(html).not.toContain(">Budget<");
    expect(text).not.toContain("BUDGET");
  });

  test("travelers: total and adults always; children and infants only when there are some (never an empty zero row)", () => {
    const adultsOnly = buildFlightRequestNotificationEmail({ ...BASE, adults: 3, children: 0, infants: 0 });
    expect(adultsOnly.text).toContain("Total Travelers: 3");
    expect(adultsOnly.text).toContain("Adults: 3");
    expect(adultsOnly.text).not.toContain("Children:");
    expect(adultsOnly.text).not.toContain("Infants:");
    expect(adultsOnly.html).not.toContain(">Children<");
    const mixed = buildFlightRequestNotificationEmail({ ...BASE, adults: 2, children: 1, infants: 1 });
    expect(mixed.text).toContain("Total Travelers: 4");
    expect(mixed.text).toContain("Adults: 2");
    expect(mixed.text).toContain("Children: 1");
    expect(mixed.text).toContain("Infants: 1");
    expect(mixed.html).toContain(">Children<");
    expect(mixed.html).toContain(">Infants<");
  });

  test("sections appear in the agreed order: Route, Travel Dates, Travelers, Cabin & Preferences, Budget, Customer, Additional Information, then Submission", () => {
    const { html, text } = buildFlightRequestNotificationEmail({ ...BASE, budget: 1000, budgetCurrency: "USD", notes: "hello", submission: { ip: { address: "203.0.113.42", version: "v4" } } });
    const order = (s: string, labels: string[]) => labels.map((l) => s.indexOf(l));
    const htmlIdx = order(html, [">Route<", ">Travel Dates<", ">Travelers<", ">Cabin &amp; Preferences<", ">Budget<", ">Customer<", ">Additional Information<", ">Submission &amp; IP Information<"]);
    const textIdx = order(text, ["ROUTE", "TRAVEL DATES", "TRAVELERS", "CABIN & PREFERENCES", "BUDGET", "CUSTOMER", "ADDITIONAL INFORMATION", "SUBMISSION & IP INFORMATION"]);
    for (const idx of [htmlIdx, textIdx]) {
      expect(idx.every((i) => i >= 0), JSON.stringify(idx)).toBe(true);
      expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    }
  });

  test("absent optional fields create NO empty/broken 'Additional Information' section at all", () => {
    const { html, text } = buildFlightRequestNotificationEmail(BASE); // no flexibleDates/airline/budget/notes
    expect(html).not.toContain("Additional Information");
    expect(text).not.toContain("ADDITIONAL INFORMATION");
  });

  test("a notes field is HTML-escaped (never breaks markup or injects tags)", () => {
    const { html } = buildFlightRequestNotificationEmail({ ...BASE, notes: '<script>alert(1)</script> & "quoted"' });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
  });

  test("no HTML, interactivity-free: no <script> tag, no onclick/javascript: handler, anywhere in the output", () => {
    const { html } = buildFlightRequestNotificationEmail(BASE);
    expect(html.toLowerCase()).not.toContain("<script");
    expect(html.toLowerCase()).not.toContain("javascript:");
    expect(html.toLowerCase()).not.toMatch(/\son\w+=/); // no inline event handlers
  });

  test("plain-text fallback is generated and contains the same substantive content as the HTML", () => {
    const { text } = buildFlightRequestNotificationEmail(BASE);
    expect(text.length).toBeGreaterThan(50);
    expect(text).toContain("NEW FLIGHT REQUEST");
    for (const heading of ["ROUTE", "TRAVEL DATES", "TRAVELERS", "CABIN & PREFERENCES", "CUSTOMER", "ACTION REQUIRED", "SUBMISSION DETAILS"]) expect(text, heading).toContain(heading);
    expect(text).toContain("Submitted: Thursday, October 1, 2026, 4:41 PM UTC");
  });

  test("the subject is generated correctly and matches buildFlightRequestNotificationSubject", () => {
    const { subject } = buildFlightRequestNotificationEmail(BASE);
    expect(subject).toBe(buildFlightRequestNotificationSubject(BASE));
  });

  test("never implies a response-time SLA that isn't an established business fact (no invented '30 minutes' promise)", () => {
    const { html, text } = buildFlightRequestNotificationEmail(BASE);
    expect(html).not.toMatch(/30[\s-]*minutes?/i);
    expect(text).not.toMatch(/30[\s-]*minutes?/i);
  });

  test("no database ID, security token, or raw IP address appears anywhere in the generated email", () => {
    const { html, text } = buildFlightRequestNotificationEmail(BASE);
    for (const content of [html, text]) {
      expect(content).not.toMatch(/\bleadId\b|\bcontactId\b/i);
      expect(content).not.toMatch(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/); // no raw IPv4
    }
  });
});

test.describe("sendFlightRequestNotification — mailer wiring, never throws", () => {
  const prevSender = process.env.GMAIL_SENDER_EMAIL;
  test.afterEach(() => {
    if (prevSender === undefined) delete process.env.GMAIL_SENDER_EMAIL;
    else process.env.GMAIL_SENDER_EMAIL = prevSender;
  });

  test("a valid submission sends exactly one email to the configured recipient", async () => {
    process.env.GMAIL_SENDER_EMAIL = "ops@businessflights.travel";
    const { mailer, sent } = fakeMailer();
    const result = await sendFlightRequestNotification(BASE, { mailer });
    expect(result).toEqual({ sent: true, messageId: "fake-message-id" });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("ops@businessflights.travel");
    expect(sent[0].subject).toBe(buildFlightRequestNotificationSubject(BASE));
  });

  test("Reply-To is set to the CUSTOMER's email — hitting Reply in Gmail must reach the client, not loop back to the same GMAIL_SENDER_EMAIL inbox that sent/received it", async () => {
    process.env.GMAIL_SENDER_EMAIL = "ops@businessflights.travel";
    const { mailer, sent } = fakeMailer();
    await sendFlightRequestNotification(BASE, { mailer });
    expect(sent[0].replyTo).toBe(BASE.email);
    expect(sent[0].replyTo).not.toBe(sent[0].to);
  });

  test("GMAIL_SENDER_EMAIL unset: skipped safely, mailer never called, never throws", async () => {
    delete process.env.GMAIL_SENDER_EMAIL;
    const { mailer, sent } = fakeMailer();
    const result = await sendFlightRequestNotification(BASE, { mailer });
    expect(result).toEqual({ sent: false, reason: "not_configured" });
    expect(sent).toHaveLength(0);
  });

  test("a mailer failure is caught, never thrown, and reported as send_failed", async () => {
    process.env.GMAIL_SENDER_EMAIL = "ops@businessflights.travel";
    const failing: Mailer = { send: async () => { throw new Error("SMTP connection refused"); } };
    const result = await sendFlightRequestNotification(BASE, { mailer: failing });
    expect(result).toEqual({ sent: false, reason: "send_failed", category: "other" });
  });

  test("a GMAIL_SENDER_EMAIL that doesn't look like an email (after cleaning) is caught BEFORE any SMTP attempt — mailer is never called", async () => {
    process.env.GMAIL_SENDER_EMAIL = "not-a-valid-email-address";
    const { mailer, sent } = fakeMailer();
    const result = await sendFlightRequestNotification(BASE, { mailer });
    expect(result).toEqual({ sent: false, reason: "send_failed", category: "configuration_invalid" });
    expect(sent).toHaveLength(0);
  });

  test("an empty-string GMAIL_SENDER_EMAIL (after cleaning strips it to nothing, e.g. it was just quote marks) is also caught as configuration_invalid", async () => {
    process.env.GMAIL_SENDER_EMAIL = '""';
    const { mailer, sent } = fakeMailer();
    const result = await sendFlightRequestNotification(BASE, { mailer });
    expect(result).toEqual({ sent: false, reason: "send_failed", category: "configuration_invalid" });
    expect(sent).toHaveLength(0);
  });

  test("GMAIL_SENDER_EMAIL configured with surrounding quotes or internal whitespace is cleaned and still reaches the mailer correctly, AS BOTH sender and recipient", async () => {
    process.env.GMAIL_SENDER_EMAIL = '"ops@businessflights.travel"';
    const { mailer, sent } = fakeMailer();
    const result = await sendFlightRequestNotification(BASE, { mailer });
    expect(result).toEqual({ sent: true, messageId: "fake-message-id" });
    expect(sent[0].to).toBe("ops@businessflights.travel"); // quotes stripped before reaching the mailer; same address used as the recipient
  });

  test("sender and recipient resolve to the SAME configured Gmail address — there is no separate notification-recipient variable", async () => {
    process.env.GMAIL_SENDER_EMAIL = "team@businessflights.travel";
    const { mailer, sent } = fakeMailer();
    await sendFlightRequestNotification(BASE, { mailer });
    expect(sent[0].to).toBe("team@businessflights.travel");
  });

  test("THE KEY NEW CASE — sendMail() resolves without throwing, but reports the recipient in `rejected`: this must NOT be reported as sent, since a non-throwing resolve is not by itself proof of acceptance", async () => {
    process.env.GMAIL_SENDER_EMAIL = "ops@businessflights.travel";
    const rejectingButNotThrowing: Mailer = {
      send: async (message) => ({
        messageId: "fake-message-id",
        response: "250 2.1.5 OK but recipient address rejected",
        accepted: [],
        rejected: [message.to],
      }),
    };
    const logs: string[] = [];
    const result = await sendFlightRequestNotification(BASE, { mailer: rejectingButNotThrowing, log: (m) => logs.push(m) });
    expect(result).toEqual({ sent: false, reason: "send_failed", category: "envelope_rejected" });
    expect(logs.join("\n")).toContain("rejected the recipient");
  });

  test("a Nodemailer EAUTH error is categorized as authentication_failed — the real Gmail App Password / account auth failure mode", async () => {
    process.env.GMAIL_SENDER_EMAIL = "ops@businessflights.travel";
    const failing: Mailer = {
      send: async () => {
        const err = new Error("Invalid login: 535-5.7.8 Username and Password not accepted") as Error & { code: string };
        err.code = "EAUTH";
        throw err;
      },
    };
    const result = await sendFlightRequestNotification(BASE, { mailer: failing });
    expect(result).toEqual({ sent: false, reason: "send_failed", category: "authentication_failed" });
  });

  test("a Nodemailer connection error (ETIMEDOUT/ECONNECTION/ESOCKET) is categorized as connection_failed", async () => {
    process.env.GMAIL_SENDER_EMAIL = "ops@businessflights.travel";
    for (const code of ["ETIMEDOUT", "ECONNECTION", "ESOCKET", "EDNS", "ECONNRESET"]) {
      const failing: Mailer = {
        send: async () => {
          const err = new Error("could not connect") as Error & { code: string };
          err.code = code;
          throw err;
        },
      };
      const result = await sendFlightRequestNotification(BASE, { mailer: failing });
      expect(result).toEqual({ sent: false, reason: "send_failed", category: "connection_failed" });
    }
  });

  test("a successful send logs the SMTP response/messageId as safe acceptance evidence, not just a boolean", async () => {
    process.env.GMAIL_SENDER_EMAIL = "ops@businessflights.travel";
    const { mailer } = fakeMailer();
    const logs: string[] = [];
    const result = await sendFlightRequestNotification(BASE, { mailer, log: (m) => logs.push(m) });
    expect(result).toEqual({ sent: true, messageId: "fake-message-id" });
    expect(logs.join("\n")).toContain("SMTP accepted the message");
    expect(logs.join("\n")).toContain("fake-message-id");
  });

  test("a mailer failure's log line never contains the SMTP App Password, even when a real-looking secret is set in the environment", async () => {
    const prevPass = process.env.GMAIL_APP_PASSWORD;
    const prevUser = process.env.GMAIL_SENDER_EMAIL;
    process.env.GMAIL_APP_PASSWORD = "sekrit-app-password-abcd1234";
    process.env.GMAIL_SENDER_EMAIL = "reservations@businessflights.travel"; // the one address, used as both sender and recipient
    try {
      const failing: Mailer = {
        send: async () => {
          const err = new Error("Invalid login: 535-5.7.8 Username and Password not accepted") as Error & { code: string; command: string };
          err.code = "EAUTH";
          err.command = "AUTH PLAIN";
          throw err;
        },
      };
      const logs: string[] = [];
      await sendFlightRequestNotification(BASE, { mailer: failing, log: (m) => logs.push(m) });
      const allLogs = logs.join("\n");
      expect(allLogs).not.toContain("sekrit-app-password-abcd1234");
      expect(allLogs).toContain("EAUTH"); // safe SMTP protocol metadata is fine to log
    } finally {
      if (prevPass === undefined) delete process.env.GMAIL_APP_PASSWORD;
      else process.env.GMAIL_APP_PASSWORD = prevPass;
      if (prevUser === undefined) delete process.env.GMAIL_SENDER_EMAIL;
      else process.env.GMAIL_SENDER_EMAIL = prevUser;
    }
  });

  test("no credentials appear in the generated email content itself, even when real-looking secrets are set in the environment", async () => {
    const prevPass = process.env.GMAIL_APP_PASSWORD;
    process.env.GMAIL_APP_PASSWORD = "sekrit-app-password-abcd1234";
    try {
      const { html, text } = buildFlightRequestNotificationEmail(BASE);
      expect(html).not.toContain("sekrit-app-password-abcd1234");
      expect(text).not.toContain("sekrit-app-password-abcd1234");
    } finally {
      if (prevPass === undefined) delete process.env.GMAIL_APP_PASSWORD;
      else process.env.GMAIL_APP_PASSWORD = prevPass;
    }
  });
});

test.describe("no secret-shaped NEXT_PUBLIC_* variable, and credentials stay server-only", () => {
  test("no NEXT_PUBLIC_* source reference exists for GMAIL_APP_PASSWORD or GMAIL_SENDER_EMAIL", () => {
    const root = path.resolve(__dirname, "..");
    const files = [
      "src/lib/email/mailer.ts",
      "src/lib/email/flight-request-notification.ts",
      "src/server/actions/submit-flight-request.ts",
      ".env.example",
    ];
    for (const f of files) {
      const content = fs.readFileSync(path.join(root, f), "utf8");
      expect(content).not.toMatch(/NEXT_PUBLIC_[A-Z_]*GMAIL/i);
    }
  });

  test("FLIGHT_REQUEST_NOTIFICATION_EMAIL is no longer referenced anywhere in source — the same GMAIL_SENDER_EMAIL is used for both sender and recipient", () => {
    const root = path.resolve(__dirname, "..");
    const files = [
      "src/lib/email/mailer.ts",
      "src/lib/email/smtp-helpers.ts",
      "src/lib/email/flight-request-notification.ts",
      "src/server/actions/submit-flight-request.ts",
    ];
    for (const f of files) {
      const content = fs.readFileSync(path.join(root, f), "utf8");
      expect(content).not.toContain("FLIGHT_REQUEST_NOTIFICATION_EMAIL");
    }
  });

  test(".env.example documents only variable NAMES — no real email address or password value, and no longer lists FLIGHT_REQUEST_NOTIFICATION_EMAIL", () => {
    const content = fs.readFileSync(path.resolve(__dirname, "../.env.example"), "utf8");
    expect(content).not.toContain("FLIGHT_REQUEST_NOTIFICATION_EMAIL");
    expect(content).toMatch(/^GMAIL_SENDER_EMAIL=$/m);
    expect(content).toMatch(/^GMAIL_APP_PASSWORD=$/m);
  });

  test("mailer.ts is the only file importing the 'nodemailer' package", () => {
    const root = path.resolve(__dirname, "..");
    const matches: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "test-results" || entry.name === ".git") continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name) && fs.readFileSync(full, "utf8").includes('"nodemailer"')) matches.push(path.relative(root, full).replace(/\\/g, "/"));
      }
    };
    walk(path.join(root, "src"));
    expect(matches).toEqual(["src/lib/email/mailer.ts"]);
  });
});

test.describe("submit-flight-request.ts call-site ordering (structural regression guard)", () => {
  // The action itself isn't invoked directly in this suite — it calls
  // next/headers() and needs a real request context, the same reason
  // isSpamSubmission was extracted rather than tested via the action (see
  // tests/anti-spam.spec.ts's header comment). This guards the ONE property
  // that matters and that a pure-function test of the email module can't:
  // that the notification call site sits strictly AFTER validation,
  // anti-spam, and persistence, and strictly BEFORE the success return —
  // never in the catch block, never before the Lead is saved.
  const source = fs.readFileSync(path.resolve(__dirname, "../src/server/actions/submit-flight-request.ts"), "utf8");

  test("the notification call appears after schema validation and the anti-spam check", () => {
    const validationIdx = source.indexOf("flightRequestSchema.safeParse");
    const antiSpamIdx = source.indexOf("isSpamSubmission(");
    const notifyIdx = source.indexOf("sendFlightRequestNotification(");
    expect(validationIdx).toBeGreaterThan(-1);
    expect(antiSpamIdx).toBeGreaterThan(validationIdx);
    expect(notifyIdx).toBeGreaterThan(antiSpamIdx);
  });

  test("the notification call appears after the Lead (with its LEAD_CREATED activity, written in the same transaction) is created, and before the success return", () => {
    const leadCreateIdx = source.indexOf("await createWebsiteLead(");
    const activityInLeadIdx = source.indexOf('type: "LEAD_CREATED"');
    const notifyIdx = source.indexOf("sendFlightRequestNotification(", source.lastIndexOf("afterResponse("));
    const successReturnIdx = source.lastIndexOf("return { ok: true, summary };");
    expect(leadCreateIdx).toBeGreaterThan(-1);
    expect(activityInLeadIdx).toBeGreaterThan(leadCreateIdx); // nested inside the Lead's create, not a separate later statement
    expect(source).not.toContain("prisma.activity.create");
    expect(notifyIdx).toBeGreaterThan(leadCreateIdx);
    expect(successReturnIdx).toBeGreaterThan(notifyIdx);
  });

  test("the notification call has its own .catch() — a rejection can never propagate to the action's try/catch (which would otherwise turn a successful submission into the generic failure response)", () => {
    const callIdx = source.indexOf("sendFlightRequestNotification(", source.lastIndexOf("await afterResponse("));
    const notifyBlock = source.slice(callIdx, callIdx + 1500);
    expect(notifyBlock).toContain(".catch(");
  });

  test("the notification call is deferred via next/server's after() rather than awaited inline — the customer's response must never block on Gmail being slow or unreachable", () => {
    expect(source).toContain('import { after } from "next/server"');
    // The LAST after(): the first one schedules queue distribution (below).
    const afterIdx = source.lastIndexOf("afterResponse(");
    expect(afterIdx).toBeGreaterThan(-1);
    // Searched FROM afterIdx, not from the start of the file — an earlier
    // comment elsewhere in this file also contains the literal substring
    // "sendFlightRequestNotification(" (e.g. "...itself never throws (see
    // that file)"), which a plain source.indexOf() would match first.
    const notifyIdx = source.indexOf("sendFlightRequestNotification(", afterIdx);
    expect(notifyIdx).toBeGreaterThan(afterIdx);
    expect(notifyIdx - afterIdx).toBeLessThan(50); // the notification call is the thing after() wraps, not something unrelated
  });

  test("the notification call does NOT appear inside the action's own catch block (never sent for a failed/rejected submission)", () => {
    const catchBlockIdx = source.lastIndexOf("} catch (err) {");
    const notifyIdx = source.indexOf("sendFlightRequestNotification(");
    expect(notifyIdx).toBeLessThan(catchBlockIdx); // notification call is in the try block, well before the catch
  });

  test("ensureSchemaReady() (schema/database readiness) runs before the notification call", () => {
    const readyIdx = source.indexOf("ensureSchemaReady()");
    const notifyIdx = source.indexOf("sendFlightRequestNotification(");
    expect(readyIdx).toBeGreaterThan(-1);
    expect(notifyIdx).toBeGreaterThan(readyIdx);
  });
});

test.describe("security: subject/header injection via airport codes", () => {
  // Only a MULTI_CITY request's later segments can carry a customer-shaped
  // airport object into buildFlightRequestNotificationSubject() without
  // ever passing through findAirportByIata()'s canonical-data lookup (see
  // src/server/actions/submit-flight-request.ts) — segment 0 always goes
  // through that lookup first. These two layers are each tested directly.

  test("the zod schema rejects an iata value that is 3 code units but not 3 letters (e.g. a 3-character string containing a newline)", () => {
    const result = airportSchema.safeParse({ iata: "A\nB", city: "X", name: "X", country: "X" });
    expect(result.success).toBe(false);
  });

  test("the zod schema still accepts and uppercases a normal lowercase iata code", () => {
    const result = airportSchema.safeParse({ iata: "jfk", city: "New York", name: "JFK", country: "United States" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.iata).toBe("JFK");
  });

  test("buildFlightRequestNotificationSubject strips embedded CR/LF from airport codes even when called directly with input that never passed through the zod schema (e.g. scripts/verify-initialized-schema.ts)", () => {
    const malicious: FlightRequestNotificationInput = {
      ...BASE,
      tripType: "MULTI_CITY",
      segments: [
        { from: JFK, to: CDG, departureDate: "2026-10-24" },
        { from: CDG, to: { iata: "A\r\nBcc:attacker@evil.com", city: "X", country: "X", name: "X" }, departureDate: "2026-10-26" },
      ],
    };
    const subject = buildFlightRequestNotificationSubject(malicious);
    expect(subject).not.toMatch(/[\r\n]/);
    expect(subject).not.toContain("A\r\nBcc:attacker@evil.com"); // the raw CR/LF-bearing value must not survive unmodified
  });
});

test.describe("security: Message-ID stability across the one bounded SMTP retry (duplicate-email prevention)", () => {
  // mailer.ts is deliberately never imported by a test (it is `server-only`
  // and touches the real nodemailer/Gmail credentials — see its own file
  // header and smtp-helpers.ts's). This is a structural regression guard
  // in the same spirit as the "submit-flight-request.ts call-site ordering"
  // checks above: it protects a behavioral property a unit test of this
  // untestable file can't, by making sure the code shape that property
  // depends on doesn't silently drift.
  const mailerSource = fs.readFileSync(path.resolve(__dirname, "../src/lib/email/mailer.ts"), "utf8");

  test("the Message-ID is generated once, before attemptSend is defined — not inside it — so the one bounded retry reuses the same id instead of minting a new one per attempt", () => {
    const messageIdIdx = mailerSource.indexOf("const messageId =");
    const attemptSendDefIdx = mailerSource.indexOf("const attemptSend =");
    const retryCallIdx = mailerSource.lastIndexOf("attemptSend()");
    expect(messageIdIdx).toBeGreaterThan(-1);
    expect(attemptSendDefIdx).toBeGreaterThan(messageIdIdx);
    expect(retryCallIdx).toBeGreaterThan(attemptSendDefIdx);
  });

  test("the generated messageId is actually passed into sendMail(), not just computed and discarded", () => {
    const sendMailBlock = mailerSource.slice(mailerSource.indexOf("transport().sendMail({"), mailerSource.indexOf("transport().sendMail({") + 400);
    expect(sendMailBlock).toContain("messageId,");
  });

  test("the From header uses the display name \"Business Flights Travel\" wrapping the same GMAIL_SENDER_EMAIL-derived address used as the recipient — never a different or hardcoded address", () => {
    expect(mailerSource).toContain('from: `"Business Flights Travel" <${from}>`');
    expect(mailerSource).toContain("cleanEnvValue(process.env.GMAIL_SENDER_EMAIL)");
  });
});

test.describe("client-side double-submit guard (duplicate Lead / duplicate notification prevention)", () => {
  // Behaviourally verified in a real browser (dev server, fetch stubbed so
  // nothing reached the database): Next.js QUEUES a second Server Action
  // rather than dropping it, so without a guard two submit events in one tick
  // ran two actions (3 POSTs vs the 2 a single failing submit produces);
  // with the ref guard, three submit events produced the single-submit
  // count. A Node unit test can't drive that race, so this structural check
  // protects the shape the guard depends on — a REF (updated synchronously),
  // not the `pending` state value a handler closure would read stale.
  const formSource = fs.readFileSync(path.resolve(__dirname, "../src/components/flight-form/FlightRequestForm.tsx"), "utf8");

  test("handleSubmit returns early on a ref guard, before validation or any submitFlightRequest call", () => {
    const handleSubmitIdx = formSource.indexOf("function handleSubmit(");
    const guardIdx = formSource.indexOf("if (submittingRef.current) return;");
    const validateIdx = formSource.indexOf("validateClientSide()", handleSubmitIdx);
    expect(handleSubmitIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeGreaterThan(handleSubmitIdx);
    expect(guardIdx).toBeLessThan(validateIdx);
  });

  test("the ref is set only once validation passed, and ALWAYS released in a finally (a failed request must not lock the form)", () => {
    const setIdx = formSource.indexOf("submittingRef.current = true;");
    const validateIdx = formSource.indexOf("validateClientSide()");
    const finallyIdx = formSource.indexOf("submittingRef.current = false;");
    expect(setIdx).toBeGreaterThan(validateIdx);
    expect(finallyIdx).toBeGreaterThan(setIdx);
    expect(formSource.slice(setIdx, finallyIdx)).toContain("finally");
  });
});

test.describe("deployment runtime for the deferred notification", () => {
  test("every page that hosts the flight request form sets maxDuration above the SMTP worst case (~21s), since after() work is bounded by it", () => {
    for (const page of ["../src/app/flights/page.tsx", "../src/app/page.tsx"]) {
      const source = fs.readFileSync(path.resolve(__dirname, page), "utf8");
      const m = source.match(/export const maxDuration = (\d+);/);
      expect(m, `${page} must export maxDuration`).not.toBeNull();
      expect(Number(m![1])).toBeGreaterThanOrEqual(30);
    }
  });

  test("the notification module and the action never opt into the edge runtime (nodemailer needs Node sockets)", () => {
    for (const f of ["../src/server/actions/submit-flight-request.ts", "../src/lib/email/mailer.ts", "../src/app/flights/page.tsx", "../src/app/page.tsx"]) {
      expect(fs.readFileSync(path.resolve(__dirname, f), "utf8")).not.toMatch(/runtime\s*=\s*["']edge["']/);
    }
  });
});

test.describe("Reply-To", () => {
  const prevSender = process.env.GMAIL_SENDER_EMAIL;
  test.beforeEach(() => {
    process.env.GMAIL_SENDER_EMAIL = "ops@businessflights.travel";
  });
  test.afterEach(() => {
    if (prevSender === undefined) delete process.env.GMAIL_SENDER_EMAIL;
    else process.env.GMAIL_SENDER_EMAIL = prevSender;
  });

  for (const [label, bad] of [
    ["CR/LF (header injection)", "a@b.com\r\nBcc: attacker@evil.com"],
    ["a second recipient after a comma — Nodemailer passes an address list through as-is", "a@b.com, attacker@evil.com"],
    ["a semicolon list", "a@b.com;attacker@evil.com"],
    ["no @ at all", "not-an-email"],
    ["an empty string", ""],
  ] as const) {
    test(`an unusable customer email (${label}) omits Reply-To but the notification is STILL sent`, async () => {
      const { mailer, sent } = fakeMailer();
      const result = await sendFlightRequestNotification({ ...BASE, email: bad }, { mailer });
      expect(result.sent).toBe(true);
      expect(sent).toHaveLength(1);
      expect(sent[0].replyTo).toBeUndefined();
      expect(sent[0].to).toBe("ops@businessflights.travel"); // the customer value can never reach To
    });
  }

  test("the customer's email can never override To, and Reply-To is the exact validated address", async () => {
    const { mailer, sent } = fakeMailer();
    await sendFlightRequestNotification({ ...BASE, email: "client+tag@example.org" }, { mailer });
    expect(sent[0].to).toBe("ops@businessflights.travel");
    expect(sent[0].replyTo).toBe("client+tag@example.org");
  });

  test("the zod schema itself rejects the same malicious customer emails before they ever reach the notification", () => {
    for (const bad of ["a@b.com\r\nBcc: attacker@evil.com", "a@b.com, attacker@evil.com", "a@b.com;attacker@evil.com", "a b@c.com"]) {
      const r = flightRequestSchema.safeParse({ ...validRequest(), email: bad });
      expect(r.success, bad).toBe(false);
    }
  });
});

test.describe("HTML + text safety across every customer-controlled field", () => {
  const PAYLOADS = [
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "<test>",
    '"double" and \'single\' quotes',
    "A & B &amp; C",
    "line one\nline two\r\nline three",
    "emoji 🚀✈️ unicode café 日本語",
  ];

  for (const payload of PAYLOADS) {
    test(`payload ${JSON.stringify(payload).slice(0, 40)} is inert in the HTML in every text field and readable in the plain text`, () => {
      const input: FlightRequestNotificationInput = {
        ...BASE,
        firstName: payload,
        lastName: payload,
        preferredAirline: payload,
        notes: payload,
        tripType: "MULTI_CITY",
        segments: [
          { from: JFK, to: CDG, departureDate: "2026-10-24" },
          { from: { iata: "CDG", city: payload, country: payload, name: payload }, to: { iata: "RUN", city: payload, country: payload, name: payload }, departureDate: "2026-10-26" },
        ],
      };
      const { html, text } = buildFlightRequestNotificationEmail(input);
      // No payload tag/attribute survives as markup…
      expect(html).not.toContain("<script>alert");
      expect(html).not.toMatch(/<img[^>]*onerror/i);
      expect(html).not.toContain("<test>");
      expect(html).not.toMatch(/<[a-z]+[^>]*\sonerror\s*=/i);
      // …and the set of real tags is exactly what the template itself emits.
      const tagNames = new Set([...html.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*)/g)].map((m) => m[1].toLowerCase()));
      expect([...tagNames].filter((t) => !["html", "head", "meta", "title", "body", "span", "table", "tr", "td", "p", "img", "br", "a"].includes(t))).toEqual([]);
      // Plain text keeps the characters verbatim (it is not HTML-escaped).
      expect(text).toContain(payload.trim());
      expect(text).not.toContain("&lt;");
    });
  }

  test("a customer email or phone that tries to break out of the double-quoted href attribute cannot add an attribute", () => {
    const { html } = buildFlightRequestNotificationEmail({ ...BASE, email: 'x"onmouseover="alert(1)@evil.com', phoneE164: '+1"onclick="alert(1)' });
    expect(html).not.toContain('x"onmouseover');
    expect(html).not.toContain('+1"onclick');
    expect(html).not.toMatch(/\sonmouseover\s*=/i);
    expect(html).not.toMatch(/\sonclick\s*=/i);
  });

  test("very long notes stay inside the table layout (wrapping styles present, no unbounded fixed widths)", () => {
    const { html } = buildFlightRequestNotificationEmail({ ...BASE, notes: "W".repeat(2000), firstName: "N".repeat(80), lastName: "M".repeat(80) });
    expect(html).toContain("word-break:break-word");
    expect(html).toContain("max-width:600px");
    expect(html).not.toMatch(/width:\s*[7-9]\d\dpx|width:\s*\d{4,}px/);
  });
});

test.describe("subject", () => {
  test("keeps the real arrows/dashes and strips every control and Unicode line-separator character from the airport codes", () => {
    // Built from char codes (NUL, BEL, ESC, NEL, LS, PS) so no raw control
    // or separator character ever has to live in this source file.
    const evil = { iata: "A" + String.fromCharCode(0, 7, 27, 0x85, 0x2028, 0x2029) + "B", city: "X", country: "X", name: "X" };
    const subject = buildFlightRequestNotificationSubject({ ...BASE, tripType: "MULTI_CITY", segments: [{ from: JFK, to: CDG, departureDate: "2026-10-24" }, { from: CDG, to: evil, departureDate: "2026-10-26" }] });
    expect(subject.startsWith("New Flight Request — JFK → ")).toBe(true);
    expect(subject).not.toMatch(/[\p{Cc}\p{Zl}\p{Zp}]/u);
  });
});

test.describe("cabin wording", () => {
  test("the enum value the action really passes is shown as the label the form uses, in HTML and text", () => {
    for (const [enumValue, label] of [["ECONOMY", "Economy"], ["PREMIUM_ECONOMY", "Premium Economy"], ["BUSINESS", "Business Class"], ["FIRST", "First Class"]] as const) {
      const { html, text } = buildFlightRequestNotificationEmail({ ...BASE, cabinClass: enumValue });
      expect(html).toContain(`>${label}<`);
      expect(text).toContain(`Cabin Class: ${label}`);
      expect(html).not.toContain(`>${enumValue}<`);
      expect(text).not.toContain(`Cabin Class: ${enumValue}`);
    }
  });
  test("an unknown value (or an already-formatted label) is shown as given rather than hidden", () => {
    expect(buildFlightRequestNotificationEmail({ ...BASE, cabinClass: "Business Class" }).html).toContain(">Business Class<");
  });
});

test.describe("one-way vs round-trip and traveler combinations", () => {
  test("one-way never shows a return date; round-trip shows it", () => {
    const oneWay = buildFlightRequestNotificationEmail(BASE);
    expect(oneWay.html).not.toMatch(/Return (Date|Flight)/);
    expect(oneWay.text).not.toMatch(/Return (Date|Flight)/);
    const rt = buildFlightRequestNotificationEmail({ ...BASE, tripType: "ROUND_TRIP", returnDate: "2026-11-05" });
    expect(rt.html).toContain("Return Date");
    expect(rt.text).toContain("Return Date: Thursday, November 5, 2026");
  });
  test("1/0/0 shows the total and adults only; 2/2/1 shows every non-zero count", () => {
    const one = buildFlightRequestNotificationEmail(BASE).text;
    expect(one).toContain("Total Travelers: 1\nAdults: 1\n");
    const five = buildFlightRequestNotificationEmail({ ...BASE, adults: 2, children: 2, infants: 1 }).text;
    expect(five).toContain("Total Travelers: 5\nAdults: 2\nChildren: 2\nInfants: 1");
  });
  test("every submitted, non-empty piece of the request is present in BOTH parts", () => {
    const full: FlightRequestNotificationInput = { ...BASE, flexibleDates: true, preferredAirline: "Air France", budget: 4200, budgetCurrency: "AUD", notes: "Window seat", adults: 2, children: 1, infants: 1, tripType: "ROUND_TRIP", returnDate: "2026-11-05", cabinClass: "FIRST" };
    const { html, text } = buildFlightRequestNotificationEmail(full);
    for (const part of ["Jayan Grondin", "jayan@example.com", "+33783905717", "JFK", "CDG", "John F. Kennedy International Airport", "Saturday, October 24, 2026", "Thursday, November 5, 2026", "Air France", "AUD 4,200", "Window seat", "First Class", "Children", "Infants", "Flexible Dates"]) {
      expect(html, `html is missing ${part}`).toContain(part);
      expect(text, `text is missing ${part}`).toContain(part);
    }
  });
});

test.describe("logging: levels, and no customer data", () => {
  const prevSender = process.env.GMAIL_SENDER_EMAIL;
  test.afterEach(() => {
    if (prevSender === undefined) delete process.env.GMAIL_SENDER_EMAIL;
    else process.env.GMAIL_SENDER_EMAIL = prevSender;
  });
  const PII: FlightRequestNotificationInput = { ...BASE, firstName: "Zelda", lastName: "Quillfeather", email: "zelda.q@example.org", phoneE164: "+442079460958", notes: "my secret passport note 123" };
  const noPii = (lines: string[]) => {
    const all = lines.join("\n");
    for (const needle of ["Zelda", "Quillfeather", "zelda.q@example.org", "+442079460958", "passport"]) expect(all).not.toContain(needle);
  };

  test("a successful send is logged at info level, never error, with the message id and SMTP response", async () => {
    process.env.GMAIL_SENDER_EMAIL = "ops@businessflights.travel";
    const entries: Array<[string, string | undefined]> = [];
    await sendFlightRequestNotification(PII, { mailer: fakeMailer().mailer, log: (m, level) => entries.push([m, level]) });
    expect(entries).toHaveLength(1);
    expect(entries[0][1]).toBe("info");
    expect(entries[0][0]).toContain("fake-message-id");
    expect(entries[0][0]).toContain("250 2.0.0 OK");
    noPii(entries.map((e) => e[0]));
  });

  test("failures (thrown, rejected-recipient, invalid config) are logged at error level; an unset variable at warn — none contain customer data", async () => {
    const entries: Array<[string, string | undefined]> = [];
    const log = (m: string, level?: string) => entries.push([m, level]);
    process.env.GMAIL_SENDER_EMAIL = "ops@businessflights.travel";
    await sendFlightRequestNotification(PII, { mailer: { send: async () => { throw Object.assign(new Error("Invalid login"), { code: "EAUTH", command: "AUTH PLAIN" }); } }, log });
    await sendFlightRequestNotification(PII, { mailer: { send: async (m) => ({ messageId: "id", response: "550", accepted: [], rejected: [m.to] }) }, log });
    process.env.GMAIL_SENDER_EMAIL = "nonsense";
    await sendFlightRequestNotification(PII, { mailer: fakeMailer().mailer, log });
    delete process.env.GMAIL_SENDER_EMAIL;
    await sendFlightRequestNotification(PII, { mailer: fakeMailer().mailer, log });
    expect(entries.map((e) => e[1])).toEqual(["error", "error", "error", "warn"]);
    noPii(entries.map((e) => e[0]));
  });

  test("ETLS (a TLS failure) is classified as a connection failure, not 'other'", async () => {
    process.env.GMAIL_SENDER_EMAIL = "ops@businessflights.travel";
    const r = await sendFlightRequestNotification(BASE, { mailer: { send: async () => { throw Object.assign(new Error("Error initiating TLS"), { code: "ETLS" }); } }, log: () => {} });
    expect(r).toEqual({ sent: false, reason: "send_failed", category: "connection_failed" });
  });
});

test.describe("input bounds on client-supplied airport text", () => {
  test("airportSchema accepts the longest real airport values and rejects absurd lengths", () => {
    expect(airportSchema.safeParse({ iata: "AAA", city: "c".repeat(42), name: "n".repeat(90), country: "k".repeat(44) }).success).toBe(true);
    expect(airportSchema.safeParse({ iata: "AAA", city: "c".repeat(121), name: "n", country: "k" }).success).toBe(false);
    expect(airportSchema.safeParse({ iata: "AAA", city: "c", name: "n".repeat(100_000), country: "k" }).success).toBe(false);
  });
});

test.describe("server-side idempotency and request latency (structural + pure parts; the database behaviour is proven in tests/schema-init-e2e.spec.ts)", () => {
  const actionSource = fs.readFileSync(path.resolve(__dirname, "../src/server/actions/submit-flight-request.ts"), "utf8");
  const formSource = fs.readFileSync(path.resolve(__dirname, "../src/components/flight-form/FlightRequestForm.tsx"), "utf8");

  test("deriveLeadId is deterministic, cuid-shaped, and different for every key", () => {
    const a = deriveLeadId("7b1d2f64-0c9e-4a3b-8d55-1f0a9c3e2b10");
    expect(a).toBe(deriveLeadId("7b1d2f64-0c9e-4a3b-8d55-1f0a9c3e2b10"));
    expect(a).toMatch(/^c[0-9a-f]{24}$/);
    expect(deriveLeadId("0d8c4a77-5e21-47aa-9b0c-6a1e3f9d8c21")).not.toBe(a);
    expect(new Set(Array.from({ length: 500 }, () => deriveLeadId(crypto.randomUUID()))).size).toBe(500);
  });

  test("submissionId must be a UUID (it is hashed into a primary key) but stays optional", () => {
    expect(flightRequestSchema.safeParse(validRequest()).success).toBe(true);
    expect(flightRequestSchema.safeParse({ ...validRequest(), submissionId: "7b1d2f64-0c9e-4a3b-8d55-1f0a9c3e2b10" }).success).toBe(true);
    for (const bad of ["x", "", "7b1d2f64-0c9e-4a3b-8d55", "'; DROP TABLE \"Lead\"; --", "7b1d2f64-0c9e-4a3b-8d55-1f0a9c3e2b10\n"]) {
      expect(flightRequestSchema.safeParse({ ...validRequest(), submissionId: bad }).success, JSON.stringify(bad)).toBe(false);
    }
  });

  test("the form mints ONE key per mounted form and sends it with the payload", () => {
    expect(formSource).toMatch(/const \[submissionId\] = useState\(\(\) => globalThis\.crypto\?\.randomUUID\?\.\(\)\);/);
    expect(formSource).toMatch(/renderedAt,\s*submissionId,\s*\};/);
  });

  test("the Lead is created through the idempotent helper with a derived id, and a duplicate returns success BEFORE queueing or notifying", () => {
    const createIdx = actionSource.indexOf("await createWebsiteLead(");
    const deriveIdx = actionSource.indexOf("deriveLeadId(data.submissionId)");
    const dupIdx = actionSource.indexOf("if (created.duplicate) return { ok: true, summary };");
    const firstAfterIdx = actionSource.indexOf("await afterResponse(");
    expect(createIdx).toBeGreaterThan(-1);
    expect(deriveIdx).toBeGreaterThan(createIdx);
    expect(dupIdx).toBeGreaterThan(deriveIdx);
    expect(firstAfterIdx).toBeGreaterThan(dupIdx); // no after() work is registered on the duplicate path
  });

  test("queue distribution runs in after() (not awaited inline), after the Lead exists, and its failure is caught and logged", () => {
    const distIdx = actionSource.indexOf("distributeNewWebsiteLead(created.id)");
    const afterIdx = actionSource.lastIndexOf("afterResponse(", distIdx);
    const returnIdx = actionSource.lastIndexOf("return { ok: true, summary };");
    expect(distIdx).toBeGreaterThan(-1);
    expect(distIdx - afterIdx).toBeLessThan(60);
    expect(actionSource).not.toMatch(/await distributeNewWebsiteLead\(/);
    expect(actionSource.slice(distIdx, distIdx + 400)).toContain("distribution failed");
    expect(returnIdx).toBeGreaterThan(distIdx);
  });

  test("the step-timing log line carries only numbers and fixed labels — no customer field is interpolated into it", () => {
    const line = actionSource.split("\n").find((l) => l.includes("[submitFlightRequest] persisted in"))!;
    expect(line).toBeTruthy();
    for (const field of ["data.", "email", "phone", "firstName", "lastName", "notes"]) expect(line).not.toContain(field);
  });
});

test.describe("Gmail configuration matrix (the credential combinations the deployment can actually be in)", () => {
  const prevSender = process.env.GMAIL_SENDER_EMAIL;
  test.afterEach(() => {
    if (prevSender === undefined) delete process.env.GMAIL_SENDER_EMAIL;
    else process.env.GMAIL_SENDER_EMAIL = prevSender;
  });
  const mailerSource = fs.readFileSync(path.resolve(__dirname, "../src/lib/email/mailer.ts"), "utf8");

  test("sender missing (with or without a password): skipped as not_configured, the mailer is never called", async () => {
    delete process.env.GMAIL_SENDER_EMAIL;
    const { mailer, sent } = fakeMailer();
    expect(await sendFlightRequestNotification(BASE, { mailer, log: () => {} })).toEqual({ sent: false, reason: "not_configured" });
    expect(sent).toHaveLength(0);
  });

  test("password missing: the mailer's own ECONFIG error is classified configuration_invalid, never 'other', and the log names the failure without any value", async () => {
    process.env.GMAIL_SENDER_EMAIL = "ops@businessflights.travel";
    const logs: string[] = [];
    const notConfigured: Mailer = { send: async () => { throw Object.assign(new Error("Email is not configured: GMAIL_APP_PASSWORD must be set"), { code: "ECONFIG" }); } };
    expect(await sendFlightRequestNotification(BASE, { mailer: notConfigured, log: (m) => logs.push(m) })).toEqual({ sent: false, reason: "send_failed", category: "configuration_invalid" });
    expect(logs.join("\n")).toContain("configuration_invalid");
  });

  test("mailer.ts throws that ECONFIG error, naming only the variable NAMES that are missing", () => {
    expect(mailerSource).toContain('code: "ECONFIG"');
    expect(mailerSource).toContain('!user && "GMAIL_SENDER_EMAIL"');
    expect(mailerSource).toContain('!pass && "GMAIL_APP_PASSWORD"');
  });

  test("invalid sender -> configuration_invalid before any SMTP attempt; bad credentials -> authentication_failed; unreachable SMTP -> connection_failed", async () => {
    const { mailer, sent } = fakeMailer();
    process.env.GMAIL_SENDER_EMAIL = "definitely not an address";
    expect(await sendFlightRequestNotification(BASE, { mailer, log: () => {} })).toMatchObject({ category: "configuration_invalid" });
    expect(sent).toHaveLength(0);
    process.env.GMAIL_SENDER_EMAIL = "ops@businessflights.travel";
    const throwing = (code: string): Mailer => ({ send: async () => { throw Object.assign(new Error("x"), { code }); } });
    expect(await sendFlightRequestNotification(BASE, { mailer: throwing("EAUTH"), log: () => {} })).toMatchObject({ category: "authentication_failed" });
    expect(await sendFlightRequestNotification(BASE, { mailer: throwing("ETIMEDOUT"), log: () => {} })).toMatchObject({ category: "connection_failed" });
    expect(await sendFlightRequestNotification(BASE, { mailer: throwing("EENVELOPE"), log: () => {} })).toMatchObject({ category: "envelope_rejected" });
    expect(await sendFlightRequestNotification(BASE, { mailer: throwing("EMESSAGE"), log: () => {} })).toMatchObject({ category: "message_rejected" });
  });
});

test.describe("after() can never turn a saved request into a customer-facing error", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/server/actions/submit-flight-request.ts"), "utf8");
  test("after() is called in exactly one place — inside afterResponse(), in a try whose catch runs the task before responding (next/server's after() throws synchronously where the platform has no waitUntil)", () => {
    // Code only: lines that START with `after(` — the comments mention after() too.
    expect(source.match(/^\s*after\(/gm)).toHaveLength(1);
    expect(source).not.toMatch(/^\s*after\(\(\) =>/m);
    const helper = source.slice(source.indexOf("async function afterResponse("), source.indexOf("export async function submitFlightRequest("));
    expect(helper).toMatch(/try \{\s*after\(task\);\s*\} catch \(err\) \{[\s\S]*await task\(\);/);
  });
  test("both best-effort tasks (queue distribution, internal notification) go through that helper and catch their own failures", () => {
    expect(source.match(/await afterResponse\(/g)).toHaveLength(3); // queue distribution, submission info, internal notification
    expect(source).toMatch(/distribution failed/);
    expect(source).toMatch(/submission info not saved/);
    expect(source).toMatch(/internal notification email failed/);
  });
});
