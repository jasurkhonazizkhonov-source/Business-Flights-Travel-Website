// How this website connects to PostgreSQL over TLS — and whether it can prove it is talking to the real server.
//
// The same settings, with the same meaning and the same refusals, as the Compass Tools CRM's src/lib/db-tls.ts, because both
// applications connect to the same database and an operator should configure them the same way.
//
//   DATABASE_SSL_MODE    "disable": do NOT use TLS for this connection. Only for a PostgreSQL container on a private Docker network
//                        that does not offer TLS (docs/DEPLOYMENT_VPS.md). It is an explicit opt-in that must pass three checks, so it
//                        can never weaken a connection to an unintended host by accident:
//                          1. the value is exactly "disable" (anything else is refused, never guessed at);
//                          2. DATABASE_SSL_CA and DATABASE_SSL_VERIFY are not also set (a contradictory configuration is refused,
//                             not resolved silently);
//                          3. the host in DATABASE_URL is on a short, EXACT allow-list (PLAINTEXT_ALLOWED_HOSTS) and the URL carries
//                             no host= / hostaddr= query parameter that would make the driver connect somewhere else.
//                        This is a typo/misconfiguration guard, NOT proof of a private network: a name matching the list could still
//                        be made to resolve elsewhere by the container's DNS, hosts file or network. Keeping PostgreSQL on an internal
//                        Docker network with no published port is a separate, required control (docs/DEPLOYMENT_VPS.md).
//   DATABASE_SSL_CA      A PEM certificate (chain) for the database's certificate authority — for Aiven, the project CA certificate.
//                        When set, the server certificate AND host name are verified against it.
//   DATABASE_SSL_VERIFY  "system": verify against Node's built-in trust store (a provider whose CA is publicly trusted).
//   (none of these)      Encrypted but NOT identity-verified — the historical behaviour of this site, kept as the default so a
//                        deployment (Vercel today) does not break the moment this ships. A network attacker who can intercept the
//                        connection could impersonate the database. Prefer DATABASE_SSL_CA for any database that is not on a private
//                        network.
//
// Nothing here ever returns or logs the certificate, host name or connection string.
import { checkServerIdentity, type PeerCertificate } from "node:tls";

/** What the resolver reads: process.env, or any plain object in a test. */
export type EnvLike = Readonly<Record<string, string | undefined>>;
export type DatabaseSsl = false | { rejectUnauthorized: boolean; ca?: string; checkServerIdentity?: (servername: string, cert: PeerCertificate) => Error | undefined };
export type DatabaseTlsMode = "disabled" | "verified_ca" | "verified_system" | "unverified";

/** .env / dashboard values often carry the PEM with literal "\n" sequences. */
function normalizePem(raw: string): string {
  return raw.replace(/\\n/g, "\n").trim();
}

function sslModeSetting(env: EnvLike): string {
  return env.DATABASE_SSL_MODE?.trim().toLowerCase() ?? "";
}

/**
 * The ONLY hosts for which DATABASE_SSL_MODE=disable is accepted — an exact allow-list, deliberately not a pattern:
 *  - `db`          the PostgreSQL service name used by the Compass Tools compose project (the CRM's database container);
 *  - `localhost`, `127.0.0.1`, `::1`   loopback, for a developer running a non-TLS PostgreSQL on their own machine.
 * Deliberately NOT accepted: other single-label names, `*.internal`, `host.docker.internal` (the Docker HOST — a wider trust boundary),
 * private-range IP addresses (any machine on a shared LAN), and anything with a trailing dot, whitespace, port or brackets around a
 * name. No DNS lookup is done. To use plaintext against another host, change this list in a reviewed commit.
 */
const PLAINTEXT_ALLOWED_HOSTS: ReadonlySet<string> = new Set(["db", "localhost", "127.0.0.1", "::1"]);

/** Whether `rawHost` — as `new URL(...).hostname` reports it — is on PLAINTEXT_ALLOWED_HOSTS. */
export function isAllowedPlaintextDatabaseHost(rawHost: string): boolean {
  if (typeof rawHost !== "string") return false;
  let host = rawHost.toLowerCase();
  if (host.startsWith("[") && host.endsWith("]") && host.includes(":")) host = host.slice(1, -1);
  return PLAINTEXT_ALLOWED_HOSTS.has(host);
}

/**
 * The host the driver will actually connect to, or null when that cannot be determined with certainty. The `pg` driver lets a `host=`
 * (or libpq's `hostaddr=`) query parameter OVERRIDE the host in the URL's authority, so a URL like
 * `postgresql://u:p@db/x?host=attacker.example` names `db` here but connects to attacker.example. Such a URL is refused outright.
 */
function databaseHost(env: EnvLike): string | null {
  const url = env.DATABASE_URL?.trim();
  if (!url) return null;
  try {
    const parsed = new URL(url);
    for (const key of parsed.searchParams.keys()) {
      const name = key.toLowerCase();
      if (name === "host" || name === "hostaddr") return null;
    }
    return parsed.hostname;
  } catch {
    return null; // never echo the value — it carries credentials
  }
}

/** Query parameters that `pg` turns into TLS settings. Matched case-insensitively and by prefix, a superset of what pg reads today. */
function isTlsQueryParameter(name: string): boolean {
  const n = name.toLowerCase();
  return n.startsWith("ssl") || n === "uselibpqcompat";
}

/**
 * The connection string to hand to the driver: DATABASE_URL with every TLS-affecting query parameter removed.
 *
 * `pg` copies EVERY query parameter into its config and lets connection-string values override explicitly passed options, so a
 * stray `?ssl=0`, `?sslmode=...`, `?sslrootcert=...` or `?sslnegotiation=...` would silently replace the decision made in
 * resolveDatabaseSsl(). Removing them makes that function the single source of truth for TLS, in every mode.
 */
export function databaseConnectionString(url: string): string {
  const u = new URL(url);
  for (const key of [...u.searchParams.keys()]) if (isTlsQueryParameter(key)) u.searchParams.delete(key);
  return u.toString();
}

function urlCarriesTlsParameters(env: EnvLike): boolean {
  const url = env.DATABASE_URL?.trim();
  if (!url) return false;
  try {
    for (const key of new URL(url).searchParams.keys()) if (isTlsQueryParameter(key)) return true;
  } catch {
    /* an unparsable URL is refused elsewhere */
  }
  return false;
}

/** The host name from DATABASE_URL exactly as the driver will use it (percent-decoded, IPv6 brackets removed), or undefined if there is no parsable URL. */
function connectionTargetHost(env: EnvLike): string | undefined {
  const url = env.DATABASE_URL?.trim();
  if (!url) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined; // never echo the value - it carries credentials
  }
  for (const key of parsed.searchParams.keys()) {
    const name = key.toLowerCase();
    if (name === "host" || name === "hostaddr") {
      throw new Error("Verified TLS cannot be combined with a host= / hostaddr= parameter in DATABASE_URL: the certificate could not be tied to the host actually connected to. Remove the parameter.");
    }
  }
  let host = parsed.hostname;
  try {
    host = decodeURIComponent(host);
  } catch {
    /* keep the raw value; the certificate check will simply fail */
  }
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}

/**
 * Bind certificate NAME verification to the host actually connected to.
 *
 * The `pg` driver pre-connects a plain socket and hands it to TLS. For a DNS name it sets the TLS server name, so the name in the
 * certificate is checked; for an IP-LITERAL host it sets none, and Node then falls back to checking the certificate against
 * "localhost" - so a certificate that is valid for the CA but NOT for the address connected to was accepted (reproduced against a real
 * server: CA-verified connection to 127.0.0.1 succeeded with a certificate valid only for the name "localhost"). Calling Node's own
 * checkServerIdentity with the real host closes that gap for names (SAN DNS) and for IP addresses (SAN IP) alike.
 */
function withBoundIdentity(base: { rejectUnauthorized: boolean; ca?: string }, env: EnvLike): DatabaseSsl {
  const host = connectionTargetHost(env);
  if (!host) return base;
  return { ...base, checkServerIdentity: (_servername: string, cert: PeerCertificate) => checkServerIdentity(host, cert) };
}

export function getDatabaseTlsMode(env: EnvLike = process.env): DatabaseTlsMode {
  if (sslModeSetting(env) === "disable") return "disabled";
  const ca = env.DATABASE_SSL_CA?.trim();
  if (ca && /-----BEGIN CERTIFICATE-----/.test(normalizePem(ca))) return "verified_ca";
  if (env.DATABASE_SSL_VERIFY?.trim().toLowerCase() === "system") return "verified_system";
  return "unverified";
}

export function resolveDatabaseSsl(env: EnvLike = process.env): DatabaseSsl {
  const requested = sslModeSetting(env);
  if (requested) {
    if (requested !== "disable") {
      throw new Error('DATABASE_SSL_MODE must be "disable" (or unset); any other value is refused so TLS settings are never guessed.');
    }
    if (env.DATABASE_SSL_CA?.trim() || env.DATABASE_SSL_VERIFY?.trim()) {
      throw new Error("DATABASE_SSL_MODE=disable conflicts with DATABASE_SSL_CA / DATABASE_SSL_VERIFY. Remove one: disable TLS only for the private Docker database, verify TLS for a remote one.");
    }
    if (urlCarriesTlsParameters(env)) {
      throw new Error("DATABASE_SSL_MODE=disable conflicts with an ssl* / sslmode parameter inside DATABASE_URL. Remove the URL parameter so the TLS decision is made in one place.");
    }
    const host = databaseHost(env);
    if (host === null || !isAllowedPlaintextDatabaseHost(host)) {
      throw new Error("DATABASE_SSL_MODE=disable is only allowed when DATABASE_URL is a valid URL whose host is exactly one of: db, localhost, 127.0.0.1, ::1 (and it sets no host= / hostaddr= parameter). Refusing to send an unencrypted connection to any other host.");
    }
    return false;
  }

  const mode = getDatabaseTlsMode(env);
  if (mode === "verified_ca") return withBoundIdentity({ rejectUnauthorized: true, ca: normalizePem(env.DATABASE_SSL_CA!) }, env);
  if (mode === "verified_system") return withBoundIdentity({ rejectUnauthorized: true }, env);
  // A DATABASE_SSL_CA that is set but is not a PEM certificate must not be silently ignored.
  if (env.DATABASE_SSL_CA?.trim()) throw new Error("DATABASE_SSL_CA is set but is not a PEM certificate (expected -----BEGIN CERTIFICATE-----)");
  return { rejectUnauthorized: false };
}
