// Imported directly from Prisma's own runtime package rather than through
// src/generated/prisma/client's `Prisma` namespace barrel: that barrel
// re-exports these exact same classes (see
// src/generated/prisma/internal/prismaNamespace.ts - `runtime.PrismaClientKnownRequestError`
// et al., from this exact package) but also pulls in ESM-only generated
// code (`import.meta`) that a plain CJS import can't load - including
// Playwright's Node-based test transform, which is what lets
// tests/db-error.spec.ts exercise this module directly. `instanceof`
// checks below match identically either way, since it's the same class.
//
// Deliberately NOT `import "server-only"` (unlike src/lib/prisma.ts)
// either, even though this is only ever called from server actions: this
// module only imports Prisma's error CLASSES for those `instanceof`
// checks, never the `prisma` client instance or DATABASE_URL itself, so
// there's no secret to guard against leaking into a client bundle - and
// `server-only` throws unconditionally outside Next's own webpack
// pipeline (it relies on bundler-level aliasing a plain Node/Playwright
// import doesn't apply), which would break the same testability.
import {
  PrismaClientInitializationError,
  PrismaClientKnownRequestError,
  PrismaClientRustPanicError,
  PrismaClientUnknownRequestError,
  PrismaClientValidationError,
} from "@prisma/client/runtime/client";

// Turns a caught database/CRM-lookup error into a short, safe-to-log
// summary — enough for a human reading Vercel's runtime logs to tell
// "can't reach the database" apart from "schema mismatch" apart from "no
// Company row seeded" WITHOUT that log line ever containing a connection
// string, credential, or anything else that shouldn't leave this process.
// Every server action already logs the full raw error too (console.error(op,
// err)) — that's fine, since it only ever reaches Vercel's own runtime
// logs, never the client (see each action's catch block) — this exists
// alongside it purely to make the category obvious at a glance instead of
// requiring a human to read and interpret a full stack trace every time.
//
// Prisma's own error classes (PrismaClientKnownRequestError etc.)
// already carry a stable, documented `code` — P1xxx is the connection/
// engine layer (host unreachable, auth failure, TLS, timeout), P2xxx is
// the query layer (constraint violations, missing records), P3xxx is
// migration-related. See https://www.prisma.io/docs/orm/reference/error-reference
export function describeDbError(err: unknown): string {
  if (err instanceof PrismaClientInitializationError) {
    // Thrown when the engine can't even start a connection — wrong host,
    // port, credentials, or the database refusing/timing out the TCP/TLS
    // handshake itself, before any query is attempted.
    return `PrismaClientInitializationError${err.errorCode ? ` (${err.errorCode})` : ""}: connection/engine could not initialize`;
  }
  if (err instanceof PrismaClientKnownRequestError) {
    // A real response from the database, categorized by Prisma's own
    // stable error codes (P1xxx connection, P2xxx query/constraint).
    return `PrismaClientKnownRequestError ${err.code}: ${describeKnownCode(err.code)}`;
  }
  if (err instanceof PrismaClientRustPanicError) {
    return "PrismaClientRustPanicError: query engine crashed";
  }
  if (err instanceof PrismaClientUnknownRequestError) {
    return "PrismaClientUnknownRequestError: database responded with an unrecognized error shape";
  }
  if (err instanceof PrismaClientValidationError) {
    // A code-level bug (wrong field name, missing required arg), not an
    // environment/connectivity issue — the query never reached the database.
    return "PrismaClientValidationError: invalid query shape (application bug, not a connectivity issue)";
  }
  if (err instanceof Error) {
    // Our own thrown errors (see src/lib/prisma.ts, src/server/crm-company.ts)
    // use a distinct, greppable prefix specifically so this branch can name
    // them without string-matching arbitrary message text.
    if (err.message.startsWith("DATABASE_URL is not set")) return "config: DATABASE_URL missing in this runtime";
    if (err.message.startsWith("No Company row found")) return "data: CRM database has no Company row (not bootstrapped)";
    return `${err.name}: ${err.message.slice(0, 200)}`;
  }
  return "unknown non-Error value thrown";
}

function describeKnownCode(code: string): string {
  switch (code) {
    case "P1000":
      return "authentication failed against the database server";
    case "P1001":
      return "can't reach database server (host/port/network)";
    case "P1002":
      return "database server was reached but timed out";
    case "P1008":
      return "operation timed out";
    case "P1010":
      return "access denied for the connected user";
    case "P1011":
      return "TLS connection error";
    case "P1017":
      return "server closed the connection";
    case "P2002":
      return "unique constraint violation";
    case "P2003":
      return "foreign key constraint violation";
    case "P2021":
      // Confirmed in production 2026-09-07: the connected database has no
      // `Company` table at all. Prisma only reaches this code once the
      // connection, auth, and TLS have all already succeeded — this is
      // never a connectivity problem, it means the schema this app expects
      // (prisma/schema.prisma) hasn't been applied to whichever database
      // DATABASE_URL currently points at (wrong database, or a fresh/
      // reset instance that was never migrated).
      return "table does not exist — schema not applied to this database (check DATABASE_URL points at the right instance)";
    case "P2022":
      return "column does not exist — schema drift between prisma/schema.prisma and this database";
    case "P2025":
      return "expected record not found";
    default:
      return "see Prisma error reference for this code";
  }
}
