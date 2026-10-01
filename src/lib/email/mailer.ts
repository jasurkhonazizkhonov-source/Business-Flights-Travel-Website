import "server-only";
import nodemailer from "nodemailer";

// Thin, server-only Gmail SMTP sender. Deliberately the only module in this
// feature that touches `nodemailer` or reads the auth env vars — every
// other module (flight-request-notification.ts, its tests) depends only on
// the small `Mailer` interface below, never on Gmail/SMTP/Nodemailer
// directly, so sending can be faked in tests without a real network call
// and a future switch of provider only touches this one file.
//
// Two env vars, both server-side only, never NEXT_PUBLIC_*:
//   GMAIL_SENDER_EMAIL  — the Gmail account authenticating and sending (SMTP
//                         "from"/username). This project had no existing
//                         sender/account email variable to reuse (checked:
//                         no nodemailer/SMTP/mailer code existed anywhere in
//                         this repo before this feature) — Gmail SMTP auth
//                         requires a specific account, so one new variable
//                         is unavoidable. Named to sit clearly alongside
//                         GMAIL_APP_PASSWORD rather than inventing an
//                         unrelated name.
//   GMAIL_APP_PASSWORD  — the Google-generated App Password for that
//                         account (not its normal login password).
export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

// Lazy, like src/lib/prisma.ts's own client: importing this module must
// never throw just because email isn't configured yet (most of this site
// works with no email sending at all) — only an actual send attempt does.
let cachedTransport: ReturnType<typeof nodemailer.createTransport> | null = null;

function transport() {
  if (cachedTransport) return cachedTransport;
  const user = process.env.GMAIL_SENDER_EMAIL;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error("Email is not configured: GMAIL_SENDER_EMAIL and GMAIL_APP_PASSWORD must both be set (server-side only; see docs/ENVIRONMENT.md).");
  }
  cachedTransport = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  return cachedTransport;
}

// The real sender used in production. Never imported by a test — tests give
// sendFlightRequestNotification a fake `Mailer` instead, so no test ever
// loads `nodemailer`, reads GMAIL_APP_PASSWORD, or touches the network.
export const gmailMailer: Mailer = {
  async send(message) {
    const from = process.env.GMAIL_SENDER_EMAIL; // re-read, not captured, in case transport() hasn't run yet this instance
    await transport().sendMail({
      from: `"Business Flights Travel" <${from}>`,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
  },
};
