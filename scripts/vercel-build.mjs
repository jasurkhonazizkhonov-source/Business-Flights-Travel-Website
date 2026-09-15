#!/usr/bin/env node
// Vercel's build step for this project (wired via package.json's
// "vercel-build" script — Vercel runs that script instead of "build"
// automatically, zero extra config needed; local/CI builds still use the
// plain "build": "next build" script unchanged, so this file never runs
// outside an actual Vercel deployment).
//
// WHY THIS EXISTS: this website is a pure consumer of the Compass Tools
// CRM's PostgreSQL schema (see prisma/schema.prisma's header comment) - it
// never owned migrations of its own. That's fine when DATABASE_URL points
// at the CRM's real, already-migrated database (the normal case), but
// leaves the site permanently broken (P2021, "table does not exist") if
// it's ever pointed at a genuinely fresh/empty Postgres instance - a new
// staging environment, a disaster-recovery database, etc. This step makes
// that self-healing: it brings prisma/migrations/ (a verbatim copy of
// compass-tools/prisma/migrations/, see that directory) to bear on
// whatever database DATABASE_URL names, using Prisma's own production
// migration mechanism, then ensures the single baseline Company row
// exists - BEFORE the app ever starts serving a request, not triggered by
// one.
//
// SAFETY MODEL - read this before changing anything below:
//   - `prisma migrate deploy` (not `db push`, not `migrate reset`) is the
//     command real CI/CD pipelines use to apply pending migrations. It is
//     Prisma's own idempotent mechanism: an already-fully-migrated
//     database (the normal case - the real CRM database) is a pure no-op
//     ("No pending migrations to apply"). A database with SOME of the 54
//     migrations already applied gets only the missing ones, in order. A
//     completely empty database gets all 54, building the exact schema
//     Compass Tools already uses. It NEVER drops or resets anything, and
//     if it detects a genuine conflict (e.g. a checksum mismatch, or a
//     table name collision with something unrelated already in that
//     database) it fails loudly rather than guessing - never destructive.
//   - This step is best-effort and NON-BLOCKING: if DATABASE_URL isn't
//     set, or the database is unreachable, or migrate deploy fails for
//     any reason, this logs a clear (credential-free) message and the
//     build CONTINUES to `next build` regardless. The app's own lazy
//     Prisma proxy (src/lib/prisma.ts) and every server action's try/catch
//     already handle a missing/unreachable database gracefully at request
//     time - this script only ever adds a head start when the database
//     happens to be reachable at build time, never a new way to break the
//     build.
//   - The Company upsert uses the EXACT established convention from
//     compass-tools/prisma/seed.ts's seedCompany() - `id: "default-company"`,
//     `update: {}` - matching the real Company row already in production.
//     Prisma compiles this to a single atomic `INSERT ... ON CONFLICT ...
//     DO NOTHING`-equivalent statement on Postgres, so it is safe even if
//     two builds somehow ran concurrently (they don't on Vercel - builds
//     for one deployment run once, sequentially - but the guarantee holds
//     regardless). It only ever runs after migrate deploy has succeeded,
//     and only creates a company if none exists - never a second one.
//   - Nothing here ever logs DATABASE_URL, a username, or a password.
//     Subprocess output is captured (not inherited) specifically so it can
//     be redacted before being printed. `redact` and `describeDatabaseTarget`
//     are exported so tests/vercel-build.spec.ts can exercise the exact
//     redaction logic directly, the same reasoning src/lib/db-error.ts
//     documents for its own testability.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REDACT_PATTERN = /(postgres(?:ql)?:\/\/)[^@\s]+@/gi;
export function redact(text) {
  return String(text).replace(REDACT_PATTERN, "$1[redacted]@");
}

async function tryInitializeDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log("[vercel-build] DATABASE_URL not set — skipping schema/company init, proceeding to build.");
    return;
  }

  const { describeDatabaseTarget } = await import("../src/lib/db-error.ts");
  console.log(`[vercel-build] DATABASE_URL target: ${describeDatabaseTarget()}`);
  console.log("[vercel-build] Running `prisma migrate deploy` (idempotent — no-op on an already up-to-date database)...");
  try {
    const output = execFileSync("npx", ["prisma", "migrate", "deploy"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60_000,
    });
    console.log(redact(output));
    console.log("[vercel-build] migrate deploy completed.");
  } catch (err) {
    // Never fail the build over this — see file header. Log a safe,
    // redacted summary and move on; the app's existing runtime error
    // handling covers a database that's still unreachable/un-migrated.
    const stdout = err && typeof err.stdout === "string" ? err.stdout : "";
    const stderr = err && typeof err.stderr === "string" ? err.stderr : "";
    console.warn("[vercel-build] migrate deploy did not complete — continuing build anyway. Details:");
    if (stdout) console.warn(redact(stdout));
    if (stderr) console.warn(redact(stderr));
    return; // don't attempt the Company upsert if the schema step didn't succeed
  }

  try {
    const { PrismaPg } = await import("@prisma/adapter-pg");
    const { PrismaClient } = await import("../src/generated/prisma/client.ts");
    const u = new URL(databaseUrl);
    u.searchParams.delete("sslmode");
    const adapter = new PrismaPg({ connectionString: u.toString(), ssl: { rejectUnauthorized: false } });
    const prisma = new PrismaClient({ adapter });
    try {
      // Matches compass-tools/prisma/seed.ts's seedCompany() exactly —
      // same id, same idempotent upsert shape, same defaults. Never
      // touches an existing Company row (update: {}), never creates a
      // second one (upsert is keyed on the fixed id).
      await prisma.company.upsert({
        where: { id: "default-company" },
        update: {},
        create: {
          id: "default-company",
          name: "Business Flights Travel",
          website: "https://www.businessflights.travel",
          phone: "+1 (000) 000-0000",
          brandColor: "#1c3a5e",
          signatureTemplate: "Best regards,\n{{first_name}} {{last_name}}\n{{phone_number}}",
        },
      });
      console.log("[vercel-build] Company baseline confirmed (existing row left untouched, or created if none existed).");
    } finally {
      await prisma.$disconnect();
    }
  } catch (err) {
    console.warn("[vercel-build] Company baseline check did not complete — continuing build anyway.", err?.constructor?.name || "");
  }
}

async function main() {
  await tryInitializeDatabase();

  console.log("[vercel-build] Running `next build`...");
  execFileSync("npx", ["next", "build"], { stdio: "inherit" });
}

// Only auto-run when executed directly (`node scripts/vercel-build.mjs` /
// the "vercel-build" npm script) — not when imported by a test for its
// exported `redact` function.
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main().catch((err) => {
    console.error("[vercel-build] Build failed:", err?.constructor?.name || err);
    process.exit(1);
  });
}
