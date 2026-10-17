import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { databaseConnectionString, isAllowedPlaintextDatabaseHost, resolveDatabaseSsl } from "../src/lib/db-tls";

// TLS: what the REAL `pg` driver does with the URL we hand it.
//
// resolveDatabaseSsl() decides on the URL it parses with WHATWG `URL`; the driver parses it again with pg-connection-string and lets
// connection-string values override explicitly passed options. These tests build pg's own ConnectionParameters (the code Prisma's pg
// adapter uses) from exactly what prisma.ts / schema-ready.ts pass, so a disagreement between the two parsers is caught here and not
// in production.
const root = path.resolve(__dirname, "..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ConnectionParameters = require("pg/lib/connection-parameters") as new (config: Record<string, unknown>) => { host?: string; ssl?: unknown };

const DISABLE = { DATABASE_SSL_MODE: "disable" };
const CA = "-----BEGIN CERTIFICATE-----\nAAA\n-----END CERTIFICATE-----";
const baseHost = (h: string | undefined) => (h ?? "").toLowerCase().replace(/^\[|\]$/g, "");

function effective(url: string, env: Record<string, string | undefined>) {
  const ssl = resolveDatabaseSsl({ DATABASE_URL: url, ...env });
  const cp = new ConnectionParameters({ connectionString: databaseConnectionString(url), ssl });
  return { ssl, host: cp.host, driverSsl: cp.ssl };
}

test.describe("database TLS: agreement with the real pg driver and URL-override attempts", () => {
  test("an accepted plaintext URL really connects to an allow-listed host, in plaintext, according to the driver itself", () => {
    for (const url of [
      "postgresql://u:p@db:5432/x",
      "postgresql://u:p@DB:5432/x",
      "postgres://u:p@localhost/x",
      "postgresql://u:p@127.0.0.1:5432/x",
      "postgresql://u:p@[::1]:5432/x",
      "postgresql://u:p@evil.example.com@db:5432/x", // everything before the last @ is userinfo
      "postgresql://u:p%40evil.example.com@db:5432/x",
    ]) {
      const r = effective(url, DISABLE);
      expect(r.ssl, url).toBe(false);
      expect(r.driverSsl, url).toBe(false);
      expect(isAllowedPlaintextDatabaseHost(baseHost(r.host)), `${url} -> driver host ${r.host}`).toBe(true);
    }
  });

  test("every host spelling or override that could point the driver elsewhere is refused outright in plaintext mode", () => {
    for (const url of [
      "postgresql://u:p@db.:5432/x", // trailing dot
      "postgresql://u:p@d%62:5432/x", // percent-encoded name: pg decodes it, WHATWG URL does not
      "postgresql://u:p@db%2eevil.example.com/x",
      "postgresql://u:p@db,evil.example.com/x", // multi-host syntax
      "postgresql://u:p@evil.example.com/x?host=db",
      "postgresql://u:p@db/x?host=evil.example.com",
      "postgresql://u:p@db/x?HOST=evil.example.com",
      "postgresql://u:p@db/x?hostaddr=203.0.113.9",
      "postgresql://db@evil.example.com/x", // db is the USER, not the host
      "postgresql://u:p@db.evil.example.com/x",
      "postgresql://u:p@evil-db/x",
      "postgresql://u:p@10.0.0.5/x",
      "postgresql://u:p@host.docker.internal/x",
      "postgresql://u:p@0.0.0.0/x",
      "postgresql://u:p@[::ffff:127.0.0.1]/x", // IPv4-mapped IPv6 is not on the list
      "postgresql://u:p@127.1/x", // short IPv4 form
      "postgresql://u:p@2130706433/x", // decimal IPv4 form
      "postgresql:///x?host=/var/run/postgresql", // unix socket
      "/var/run/postgresql mydb", // libpq-style socket string
      "host=db dbname=x", // key/value syntax
      "postgresql://u:p@db/x?sslmode=require",
      "postgresql://u:p@db/x?ssl=true",
      "postgresql://u:p@db/x?sslrootcert=/etc/ca.pem",
    ]) {
      expect(() => resolveDatabaseSsl({ DATABASE_URL: url, ...DISABLE }), url).toThrow(/DATABASE_SSL_MODE=disable/);
    }
  });

  test("conflicting settings are refused, never resolved silently", () => {
    const url = "postgresql://u:p@db/x";
    for (const conflict of [{ DATABASE_SSL_CA: CA }, { DATABASE_SSL_VERIFY: "system" }, { DATABASE_SSL_VERIFY: "no" }]) {
      expect(() => resolveDatabaseSsl({ DATABASE_URL: url, ...DISABLE, ...conflict })).toThrow(/conflicts/);
    }
    for (const bad of ["true", "require", "off", "no", "verify-full", "0", "false"]) {
      expect(() => resolveDatabaseSsl({ DATABASE_URL: url, DATABASE_SSL_MODE: bad }), bad).toThrow(/must be "disable"/);
    }
  });

  test("a missing, empty or unparsable DATABASE_URL can never enable plaintext", () => {
    for (const url of [undefined, "", "   ", "not a url", "postgresql://", "://db"]) {
      expect(() => resolveDatabaseSsl({ DATABASE_URL: url, ...DISABLE }), String(url)).toThrow(/DATABASE_SSL_MODE=disable/);
    }
  });

  test("a remote database keeps TLS: default unchanged, verified when a CA or the system store is configured", () => {
    const remote = "postgresql://u:p@db-1234.example.aivencloud.com:12345/x";
    expect(resolveDatabaseSsl({ DATABASE_URL: remote })).toEqual({ rejectUnauthorized: false }); // historical default, deliberately unchanged
    // Verified modes also carry a certificate-name check bound to the real host (see the next test).
    expect(resolveDatabaseSsl({ DATABASE_URL: remote, DATABASE_SSL_VERIFY: "system" })).toMatchObject({ rejectUnauthorized: true, checkServerIdentity: expect.any(Function) });
    expect(resolveDatabaseSsl({ DATABASE_URL: remote, DATABASE_SSL_CA: CA })).toMatchObject({ rejectUnauthorized: true, ca: CA, checkServerIdentity: expect.any(Function) });
  });

  test("the URL cannot override the decision: its ssl* parameters are removed before the driver sees them", () => {
    const remote = "postgresql://u:p@db-1234.example.aivencloud.com:12345/x";
    for (const param of ["ssl=0", "ssl=false", "sslmode=disable", "sslmode=require", "SSLMODE=disable", "sslrootcert=/dev/null", "sslcert=/x", "sslkey=/x", "sslnegotiation=direct", "uselibpqcompat=true"]) {
      const url = `${remote}?${param}`;
      const stripped = databaseConnectionString(url);
      expect(stripped, param).not.toMatch(/ssl|uselibpqcompat/i);
      const cp = new ConnectionParameters({ connectionString: stripped, ssl: resolveDatabaseSsl({ DATABASE_URL: url, DATABASE_SSL_CA: CA }) });
      expect(cp.ssl, param).toMatchObject({ rejectUnauthorized: true, ca: CA });
    }
    // Why the strip exists: left in the URL, `?ssl=0` really does replace a verified configuration with plaintext inside pg.
    expect(new ConnectionParameters({ connectionString: `${remote}?ssl=0`, ssl: { rejectUnauthorized: true, ca: CA } }).ssl).toBe(false);
    // Other parameters and the credentials are untouched.
    expect(databaseConnectionString("postgresql://u:p%40q@db:5432/x?application_name=bft&sslmode=require")).toBe("postgresql://u:p%40q@db:5432/x?application_name=bft");
  });

  test("verified TLS binds the certificate NAME check to the real host - including IP-literal hosts, where pg alone would check \"localhost\"", () => {
    type Check = (servername: string, cert: Record<string, unknown>) => Error | undefined;
    const identity = (url: string) => (resolveDatabaseSsl({ DATABASE_URL: url, DATABASE_SSL_CA: CA }) as unknown as { checkServerIdentity: Check }).checkServerIdentity;
    const cert = (san: string) => ({ subject: { CN: "ignored-when-san-present" }, subjectaltname: san });
    // A DNS name: the certificate must list it, whatever server name the driver passes (the argument is ignored on purpose).
    expect(identity("postgresql://u:p@db:5432/x")("anything", cert("DNS:db"))).toBeUndefined();
    expect(identity("postgresql://u:p@db:5432/x")("db", cert("DNS:localhost"))).toBeInstanceOf(Error);
    expect(identity("postgresql://u:p@DB:5432/x")("db", cert("DNS:db"))).toBeUndefined(); // host names are case-insensitive
    // An IP literal (IPv4 and bracketed IPv6): matched against IP SANs, never against "localhost".
    expect(identity("postgresql://u:p@127.0.0.1:5432/x")("localhost", cert("DNS:localhost"))).toBeInstanceOf(Error);
    expect(identity("postgresql://u:p@127.0.0.1:5432/x")("localhost", cert("DNS:localhost, IP Address:127.0.0.1"))).toBeUndefined();
    expect(identity("postgresql://u:p@[::1]:5432/x")("localhost", cert("DNS:localhost"))).toBeInstanceOf(Error);
    // A percent-encoded host is decoded exactly as the driver decodes it.
    expect(identity("postgresql://u:p@d%62:5432/x")("x", cert("DNS:db"))).toBeUndefined();
    expect(identity("postgresql://u:p@d%62:5432/x")("x", cert("DNS:other"))).toBeInstanceOf(Error);
    // A host= / hostaddr= parameter would make the connection target differ from the verified name: refused in verified modes.
    for (const q of ["?host=evil.example", "?hostaddr=203.0.113.9", "?HOST=evil.example"]) {
      expect(() => resolveDatabaseSsl({ DATABASE_URL: `postgresql://u:p@db:5432/x${q}`, DATABASE_SSL_CA: CA }), q).toThrow(/Verified TLS cannot be combined with a host=/);
    }
    // No parsable URL: nothing to bind to (the server-name check of the driver applies); the unverified default carries no check at all.
    expect(resolveDatabaseSsl({ DATABASE_SSL_CA: CA })).toEqual({ rejectUnauthorized: true, ca: CA });
    expect(resolveDatabaseSsl({ DATABASE_URL: "postgresql://u:p@db/x" })).toEqual({ rejectUnauthorized: false });
  });

  test("both connection paths use the single TLS source, and nothing in src weakens TLS globally", () => {
    for (const f of ["src/lib/prisma.ts", "src/server/schema-ready.ts"]) {
      const code = read(f).split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
      expect(code, f).toContain("databaseConnectionString(");
      expect(code, f).toContain("resolveDatabaseSsl()");
      expect(code, f).not.toMatch(/searchParams\.delete\(\s*["']sslmode/);
    }
    for (const f of ["src/lib/prisma.ts", "src/server/schema-ready.ts", "src/lib/db-tls.ts"]) {
      const code = read(f).split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n");
      expect(code, f).not.toMatch(/NODE_TLS_REJECT_UNAUTHORIZED/);
    }
  });
});
