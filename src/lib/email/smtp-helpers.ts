// Pure, dependency-free helpers factored out of src/lib/email/mailer.ts
// specifically so they're directly unit-testable — mailer.ts is deliberately
// `server-only` (it touches `nodemailer` and the real Gmail credentials),
// which throws when imported outside Next's own webpack pipeline, the same
// reason src/lib/db-error.ts and src/lib/anti-spam.ts document for why
// their own logic lives outside a server-only/"use server" file.

// Every straight and "smart"/curly quote character a value could plausibly
// be pasted with, if whoever set the Vercel env var copied it including
// surrounding quotes (common habit coming from a shell `export KEY="value"`
// or a JSON config, where quoting is the norm) or whatever typed the
// quotes autocorrected them into curly ones.
const QUOTE_CHARS = /["'‘’“”]/g;

/**
 * Strips ALL whitespace (not just leading/trailing — Google's own "App
 * Passwords" page displays the generated password as four groups of four
 * characters separated by spaces, e.g. "abcd efgh ijkl mnop", purely for
 * human readability; the real secret has no spaces, but selecting/copying
 * that displayed text — the natural thing to do — copies the spaces along
 * with it, and a plain `.trim()` only strips the ends) AND every quote
 * character, from anywhere in the value. None of GMAIL_SENDER_EMAIL,
 * GMAIL_APP_PASSWORD, or FLIGHT_REQUEST_NOTIFICATION_EMAIL can ever
 * legitimately contain whitespace or a quote character, so stripping both
 * unconditionally can only ever fix a copy-paste artifact, never change a
 * correctly-entered value.
 */
export function cleanEnvValue(value: string | undefined): string | undefined {
  return value?.replace(/\s+/g, "").replace(QUOTE_CHARS, "");
}

/** A deliberately lightweight "does this look like an email address at all" check — not full RFC 5322 validation, just enough to catch an empty string, a stray fallback value, or an obviously malformed address BEFORE spending an SMTP round-trip attempting to send to it. */
export function isPlausibleEmail(value: string | undefined): value is string {
  return !!value && /^[^\s@"'<>]+@[^\s@"'<>]+\.[^\s@"'<>]+$/.test(value);
}

/** Nodemailer/Node network error codes worth one bounded retry — a cold-start DNS/TLS hiccup on a serverless function's first outbound call, not an auth or envelope rejection a retry cannot fix. */
export function isTransientConnectionError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === "ECONNECTION" || code === "ESOCKET" || code === "ETIMEDOUT" || code === "EDNS" || code === "ECONNRESET";
}
