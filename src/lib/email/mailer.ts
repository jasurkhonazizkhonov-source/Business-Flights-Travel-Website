import "server-only";
import nodemailer from "nodemailer";
import { cleanEnvSecret, isTransientConnectionError } from "@/lib/email/smtp-helpers";

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
//                         account (not its normal login password). Needs
//                         2-Step Verification already enabled on the
//                         account (Google won't issue an App Password
//                         otherwise); generate one at
//                         myaccount.google.com/apppasswords. A Google
//                         Workspace account additionally needs its admin to
//                         have SMTP/"less secure apps" access allowed for
//                         App Passwords at the organization level — if the
//                         account is on Workspace and auth still fails
//                         after confirming the password, that organization
//                         policy is the next thing to check (this code has
//                         no way to detect or change that from here).
//
// Both are run through cleanEnvSecret() (src/lib/email/smtp-helpers.ts)
// before use — see that file for why a plain `.trim()` isn't enough.
export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

// `info` is exactly Nodemailer's own SentMessageInfo — the actual SMTP
// server reply (`response`, e.g. "250 2.0.0 OK 1759348...") and the
// envelope Gmail says it accepted (`accepted`/`rejected`). This is the
// closest thing to "proof of SMTP acceptance" the application can observe;
// it is NOT proof the recipient's inbox displayed the message (delivery
// past the SMTP handshake — spam filtering, inbox rules — is invisible to
// the sending application by design of the protocol, as it is for any
// email sender).
export interface Mailer {
  send(message: MailMessage): Promise<{ messageId: string; response: string; accepted: unknown[]; rejected: unknown[] }>;
}

// Lazy, like src/lib/prisma.ts's own client: importing this module must
// never throw just because email isn't configured yet (most of this site
// works with no email sending at all) — only an actual send attempt does.
// Explicit host/port/secure rather than Nodemailer's `service: "gmail"`
// shorthand (which resolves to the exact same smtp.gmail.com:465 values
// internally) — deterministic and directly inspectable here, with no
// hidden well-known-services lookup table to wonder about when diagnosing
// a serverless delivery problem. Timeouts are shortened from Nodemailer's
// defaults (2 minutes) to fail fast well inside a serverless function's own
// execution limit, so a hung connection can't itself silently consume the
// customer-facing request's remaining time budget — a real risk this
// shares with any outbound network call made inside a Server Action.
let cachedTransport: ReturnType<typeof nodemailer.createTransport> | null = null;

function transport() {
  if (cachedTransport) return cachedTransport;
  const user = cleanEnvSecret(process.env.GMAIL_SENDER_EMAIL);
  const pass = cleanEnvSecret(process.env.GMAIL_APP_PASSWORD);
  if (!user || !pass) {
    throw new Error("Email is not configured: GMAIL_SENDER_EMAIL and GMAIL_APP_PASSWORD must both be set (server-side only; see docs/ENVIRONMENT.md).");
  }
  cachedTransport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000,
  });
  return cachedTransport;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The real sender used in production. Never imported by a test — tests give
// sendFlightRequestNotification a fake `Mailer` instead, so no test ever
// loads `nodemailer`, reads GMAIL_APP_PASSWORD, or touches the network.
export const gmailMailer: Mailer = {
  async send(message) {
    const from = cleanEnvSecret(process.env.GMAIL_SENDER_EMAIL); // re-read, not captured, in case transport() hasn't run yet this instance
    const attemptSend = () =>
      transport().sendMail({
        from: `"Business Flights Travel" <${from}>`,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
    let info;
    try {
      info = await attemptSend();
    } catch (err) {
      // One bounded retry, ONLY for transient connection-category failures
      // (a cold-start DNS/TLS hiccup is the realistic case on a serverless
      // function's first outbound call) — never for an authentication or
      // envelope rejection, which a retry cannot fix and would only delay
      // reporting. Still well inside a serverless function's own execution
      // budget even in the worst case (two 10s-ceiling attempts, not two
      // full Nodemailer-default 2-minute attempts).
      if (!isTransientConnectionError(err)) throw err;
      await sleep(500);
      info = await attemptSend();
    }
    return { messageId: info.messageId, response: info.response, accepted: info.accepted, rejected: info.rejected };
  },
};
