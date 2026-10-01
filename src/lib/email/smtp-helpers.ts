// Pure, dependency-free helpers factored out of src/lib/email/mailer.ts
// specifically so they're directly unit-testable — mailer.ts is deliberately
// `server-only` (it touches `nodemailer` and the real Gmail credentials),
// which throws when imported outside Next's own webpack pipeline, the same
// reason src/lib/db-error.ts and src/lib/anti-spam.ts document for why
// their own logic lives outside a server-only/"use server" file.

/**
 * Strips ALL whitespace (not just leading/trailing) from an env var value
 * before use. Google's own "App Passwords" page displays the generated
 * password as four groups of four characters separated by spaces (e.g.
 * "abcd efgh ijkl mnop") purely for human readability — the real secret
 * has no spaces, but selecting/copying that displayed text (the natural
 * thing to do) copies the spaces along with it. A plain `.trim()` only
 * strips the ends and would miss this specific, common, real-world
 * mistake entirely. Applied to GMAIL_SENDER_EMAIL too: a valid email
 * address never legitimately contains whitespace, so this is harmless
 * there and only ever fixes a copy-paste artifact.
 */
export function cleanEnvSecret(value: string | undefined): string | undefined {
  return value?.replace(/\s+/g, "");
}

/** Nodemailer/Node network error codes worth one bounded retry — a cold-start DNS/TLS hiccup on a serverless function's first outbound call, not an auth or envelope rejection a retry cannot fix. */
export function isTransientConnectionError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === "ECONNECTION" || code === "ESOCKET" || code === "ETIMEDOUT" || code === "EDNS" || code === "ECONNRESET";
}
