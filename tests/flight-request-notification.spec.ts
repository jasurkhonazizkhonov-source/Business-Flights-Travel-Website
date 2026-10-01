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

function fakeMailer(impl?: (m: MailMessage) => void | Promise<void>): { mailer: Mailer; sent: MailMessage[] } {
  const sent: MailMessage[] = [];
  return {
    sent,
    mailer: {
      async send(message) {
        sent.push(message);
        if (impl) await impl(message);
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

  test("one-way itinerary renders a single, unlabeled 'Flight' card with the correct airports and date", () => {
    const { html, text } = buildFlightRequestNotificationEmail(BASE);
    expect(html).toContain(">Flight<");
    expect(html).not.toContain("Outbound Flight");
    expect(html).not.toContain("Return Flight");
    expect(html).toContain("JFK");
    expect(html).toContain("New York, United States");
    expect(html).toContain("John F. Kennedy International Airport");
    expect(html).toContain("CDG");
    expect(html).toContain("Saturday, October 24, 2026");
    expect(text).toContain("Departure: JFK");
    expect(text).toContain("Arrival:   CDG");
  });

  test("round trip renders BOTH outbound and return itinerary cards, return as the reverse leg on returnDate", () => {
    const roundTrip: FlightRequestNotificationInput = {
      ...BASE,
      tripType: "ROUND_TRIP",
      segments: [{ from: RUN, to: CDG, departureDate: "2026-10-24" }],
      returnDate: "2026-10-06",
    };
    const { html, text } = buildFlightRequestNotificationEmail(roundTrip);
    expect(html).toContain("Outbound Flight");
    expect(html).toContain("Return Flight");
    // outbound: RUN -> CDG; return: CDG -> RUN (reverse)
    const outboundIdx = html.indexOf("Outbound Flight");
    const returnIdx = html.indexOf("Return Flight");
    expect(html.slice(outboundIdx, returnIdx)).toContain("Saint-Denis, Réunion");
    expect(html.slice(returnIdx)).toContain("Tuesday, October 6, 2026"); // return date formatted, in the return section specifically
    expect(text).toContain("Return Flight");
    expect(text).toContain("Tuesday, October 6, 2026");
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
    const { html } = buildFlightRequestNotificationEmail(multi);
    expect(html).toContain("Flight 1");
    expect(html).toContain("Flight 2");
    expect(html).toContain("Saturday, October 24, 2026");
    expect(html).toContain("Monday, October 26, 2026");
  });

  test("optional fields (flexible dates, preferred airline, budget, notes) render when present", () => {
    const withExtras: FlightRequestNotificationInput = {
      ...BASE,
      flexibleDates: true,
      preferredAirline: "Air France",
      budget: 8500,
      notes: "Prefers aisle seat.\nTraveling for a wedding.",
    };
    const { html, text } = buildFlightRequestNotificationEmail(withExtras);
    expect(html).toContain("Additional Information");
    expect(html).toContain("Flexible Dates");
    expect(html).toContain("Air France");
    expect(html).toContain("$8,500");
    expect(html).toContain("Prefers aisle seat.");
    expect(html).toContain("Traveling for a wedding.");
    expect(text).toContain("Preferred Airline: Air France");
    expect(text).toContain("Budget: $8,500");
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
    expect(text).toContain("FLIGHT ITINERARY");
    expect(text).toContain("ACTION REQUIRED");
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
  const prevTo = process.env.FLIGHT_REQUEST_NOTIFICATION_EMAIL;
  test.afterEach(() => {
    if (prevTo === undefined) delete process.env.FLIGHT_REQUEST_NOTIFICATION_EMAIL;
    else process.env.FLIGHT_REQUEST_NOTIFICATION_EMAIL = prevTo;
  });

  test("a valid submission sends exactly one email to the configured recipient", async () => {
    process.env.FLIGHT_REQUEST_NOTIFICATION_EMAIL = "ops@businessflights.travel";
    const { mailer, sent } = fakeMailer();
    const result = await sendFlightRequestNotification(BASE, { mailer });
    expect(result).toEqual({ sent: true });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("ops@businessflights.travel");
    expect(sent[0].subject).toBe(buildFlightRequestNotificationSubject(BASE));
  });

  test("FLIGHT_REQUEST_NOTIFICATION_EMAIL unset: skipped safely, mailer never called, never throws", async () => {
    delete process.env.FLIGHT_REQUEST_NOTIFICATION_EMAIL;
    const { mailer, sent } = fakeMailer();
    const result = await sendFlightRequestNotification(BASE, { mailer });
    expect(result).toEqual({ sent: false, reason: "not_configured" });
    expect(sent).toHaveLength(0);
  });

  test("a mailer failure is caught, never thrown, and reported as send_failed", async () => {
    process.env.FLIGHT_REQUEST_NOTIFICATION_EMAIL = "ops@businessflights.travel";
    const failing: Mailer = { send: async () => { throw new Error("SMTP connection refused"); } };
    const result = await sendFlightRequestNotification(BASE, { mailer: failing });
    expect(result).toEqual({ sent: false, reason: "send_failed" });
  });

  test("a mailer failure's log line never contains the SMTP credentials, even when real-looking secrets are set in the environment", async () => {
    process.env.FLIGHT_REQUEST_NOTIFICATION_EMAIL = "ops@businessflights.travel";
    const prevPass = process.env.GMAIL_APP_PASSWORD;
    const prevUser = process.env.GMAIL_SENDER_EMAIL;
    process.env.GMAIL_APP_PASSWORD = "sekrit-app-password-abcd1234";
    process.env.GMAIL_SENDER_EMAIL = "reservations@businessflights.travel";
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
      expect(allLogs).not.toContain("reservations@businessflights.travel");
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
  test("no NEXT_PUBLIC_* source reference exists for GMAIL_APP_PASSWORD or FLIGHT_REQUEST_NOTIFICATION_EMAIL", () => {
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
      expect(content).not.toMatch(/NEXT_PUBLIC_[A-Z_]*FLIGHT_REQUEST_NOTIFICATION/i);
    }
  });

  test(".env.example documents only variable NAMES — no real email address or password value", () => {
    const content = fs.readFileSync(path.resolve(__dirname, "../.env.example"), "utf8");
    expect(content).toMatch(/^FLIGHT_REQUEST_NOTIFICATION_EMAIL=$/m);
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

  test("the notification call appears after the Lead and Activity are created, and before the success return", () => {
    const leadCreateIdx = source.indexOf("prisma.lead.create");
    const activityCreateIdx = source.indexOf("prisma.activity.create");
    const notifyIdx = source.indexOf("sendFlightRequestNotification(");
    const successReturnIdx = source.indexOf("ok: true,\n      summary:");
    expect(notifyIdx).toBeGreaterThan(leadCreateIdx);
    expect(notifyIdx).toBeGreaterThan(activityCreateIdx);
    expect(successReturnIdx).toBeGreaterThan(notifyIdx);
  });

  test("the notification call is awaited with its own .catch() — a rejection can never propagate to the action's try/catch (which would otherwise turn a successful submission into the generic failure response)", () => {
    const notifyBlock = source.slice(source.indexOf("sendFlightRequestNotification("), source.indexOf("sendFlightRequestNotification(") + 1500);
    expect(notifyBlock).toContain(".catch(");
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
