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
// migration mechanism, then ensures the single baseline Business Flights
// Travel Company row exists - BEFORE the app ever starts serving a
// request, not triggered by one.
//
// *** WHY THIS FILE WAS REWRITTEN — READ BEFORE CHANGING THE GATE BELOW ***
// The first version of this script ran `migrate deploy` unconditionally
// against whatever DATABASE_URL happened to be set to. That is exactly
// what caused a real incident: Vercel Production's DATABASE_URL was
// pointing at the wrong (empty) Postgres instance, and this build step
// correctly, faithfully initialized a full CRM-compatible schema there —
// creating a live, working, but completely ORPHANED database that
// customer form submissions silently succeeded into while Compass Tools
// never saw them. The code wasn't buggy; the danger is structural: an
// empty database is indistinguishable from "intentionally fresh
// environment" and "accidentally wrong DATABASE_URL" using schema
// state alone. Fixing that requires an explicit human signal, not
// smarter detection. Hence the DATABASE_AUTO_INIT gate below — it only
// gates the case that's actually ambiguous; a database that already
// shows ANY sign of CRM presence never needs it (see isDatabaseEmpty()).
//
// SAFETY MODEL:
//   - Before touching anything, a read-only query checks whether this
//     database has EITHER a `public."Company"` table OR Prisma's own
//     `public."_prisma_migrations"` tracking table. If either exists,
//     this database has already been through this process (or is the
//     real CRM database) — `migrate deploy` proceeds unconditionally,
//     because on such a database it can only ever be a safe no-op or a
//     safe catch-up of missing migrations (see below), never a
//     first-time schema creation.
//   - If NEITHER exists — this looks like a genuinely empty database,
//     OR a database holding something else entirely that happens to
//     have no table literally named "Company" — initialization only
//     proceeds if `DATABASE_AUTO_INIT=true` is explicitly set in this
//     environment. Without it, this step logs a clear, safe message and
//     does nothing further; the app's existing runtime error handling
//     (a safe, generic customer-facing message; the full category in
//     Vercel's own logs via src/lib/db-error.ts) continues to apply
//     exactly as it did before this file existed. This is what stops a
//     misconfigured/stale DATABASE_URL from silently becoming a working
//     orphan CRM: initializing a database with no prior CRM footprint
//     now requires a deliberate, separate, reviewable configuration
//     change, not just whatever DATABASE_URL happens to be set to.
//   - `prisma migrate deploy` (not `db push`, not `migrate reset`) is
//     the command real CI/CD pipelines use to apply pending migrations.
//     It is Prisma's own idempotent mechanism: an already-fully-migrated
//     database (the real CRM database, the normal case) is a pure no-op
//     ("No pending migrations to apply") — VERIFIED LIVE against the
//     real production database, not simulated. A database with SOME of
//     the 54 migrations already applied gets only the missing ones, in
//     order. It NEVER drops or resets anything, and on a genuine
//     conflict (checksum mismatch, or a table name collision with
//     something unrelated already there) it fails loudly rather than
//     guessing — never destructive, with or without the gate.
//   - This step is best-effort and NON-BLOCKING: if DATABASE_URL isn't
//     set, the database is unreachable, or migrate deploy fails for any
//     reason, this logs a clear (credential-free) message and the build
//     CONTINUES to `next build` regardless. This can only ever help when
//     the database happens to be reachable and either already-CRM or
//     explicitly opted into initialization — never a new way to break
//     the build.
//   - The Company upsert uses the EXACT established convention from
//     compass-tools/prisma/seed.ts's seedCompany() — `id: "default-company"`,
//     `update: {}` — matching the real Company row already in
//     production. Prisma compiles this to a single atomic
//     `INSERT ... ON CONFLICT ... DO UPDATE` statement on Postgres, so
//     it is safe even under concurrent execution (moot in practice: this
//     only ever runs once, sequentially, during one deployment's own
//     build phase, before that deployment starts serving any traffic —
//     no customer request ever triggers it, so the "two users submit at
//     once against a brand-new database" race structurally cannot occur
//     here regardless). It only runs after migrate deploy has succeeded,
//     and only creates a company if none exists with this id — never a
//     second one, and single-company-per-deployment is exactly the
//     architecture this represents (Business Flights Travel, and only
//     Business Flights Travel — see compass-tools/docs/DEPLOYMENT.md).
//   - Nothing here ever logs DATABASE_URL, a username, or a password.
//     Subprocess output is captured (not inherited) specifically so it
//     can be redacted before being printed. `redact` is exported so
//     tests/vercel-build.spec.ts can exercise the exact redaction logic
//     directly, the same reasoning src/lib/db-error.ts documents for
//     its own testability.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REDACT_PATTERN = /(postgres(?:ql)?:\/\/)[^@\s]+@/gi;
export function redact(text) {
  return String(text).replace(REDACT_PATTERN, "$1[redacted]@");
}

const AUTO_INIT_ENV_VAR = "DATABASE_AUTO_INIT";

// Read-only: true only when this database shows NO sign of ever having
// been through this process (no Company table, no Prisma migrations
// tracking table). Deliberately conservative — a database with ANY
// trace of prior CRM presence is treated as non-empty so migrate deploy
// (always safe there) proceeds without needing the explicit flag.
export async function isDatabaseEmptyOfCrmPresence(prisma) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT to_regclass('public."Company"') IS NOT NULL AS company_exists,
            to_regclass('public."_prisma_migrations"') IS NOT NULL AS migrations_table_exists`,
  );
  const row = rows[0];
  return !row.company_exists && !row.migrations_table_exists;
}

async function connectPrisma(databaseUrl) {
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("../src/generated/prisma/client.ts");
  const u = new URL(databaseUrl);
  u.searchParams.delete("sslmode");
  const adapter = new PrismaPg({ connectionString: u.toString(), ssl: { rejectUnauthorized: false } });
  return new PrismaClient({ adapter });
}

function runMigrateDeploy() {
  console.log("[vercel-build] Running `prisma migrate deploy` (idempotent — no-op on an already up-to-date database)...");
  const output = execFileSync("npx", ["prisma", "migrate", "deploy"], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 60_000,
  });
  console.log(redact(output));
  console.log("[vercel-build] migrate deploy completed.");
}

async function upsertBaselineCompany(prisma) {
  // Matches compass-tools/prisma/seed.ts's seedCompany() exactly — same
  // id, same idempotent upsert shape, same defaults. Never touches an
  // existing Company row (update: {}), never creates a second one
  // (upsert is keyed on the fixed id) — this remains a single-company
  // (Business Flights Travel) deployment, not multi-tenant.
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
}

async function tryInitializeDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log("[vercel-build] DATABASE_URL not set — skipping schema/company init, proceeding to build.");
    return;
  }

  const { describeDatabaseTarget } = await import("../src/lib/db-error.ts");
  console.log(`[vercel-build] DATABASE_URL target: ${describeDatabaseTarget()}`);

  let prisma;
  let looksEmpty;
  try {
    prisma = await connectPrisma(databaseUrl);
    looksEmpty = await isDatabaseEmptyOfCrmPresence(prisma);
  } catch (err) {
    console.warn("[vercel-build] Could not check database state — continuing build anyway.", err?.constructor?.name || "");
    if (prisma) await prisma.$disconnect().catch(() => {});
    return;
  }

  if (looksEmpty) {
    const autoInitEnabled = process.env[AUTO_INIT_ENV_VAR] === "true";
    if (!autoInitEnabled) {
      console.warn(
        `[vercel-build] This database has no existing Company table or Prisma migrations history — it looks empty, or ` +
          `unrelated to Business Flights Travel / Compass Tools. Skipping automatic schema initialization because ` +
          `${AUTO_INIT_ENV_VAR} is not set to "true". If this is an intentional brand-new environment for this ` +
          `deployment, set ${AUTO_INIT_ENV_VAR}=true in this environment's variables and redeploy. If this is NOT ` +
          `intentional, DATABASE_URL is likely misconfigured for this deployment — verify it points at the correct ` +
          `Business Flights Travel database before setting ${AUTO_INIT_ENV_VAR}.`,
      );
      await prisma.$disconnect().catch(() => {});
      return;
    }
    console.log(`[vercel-build] Database appears empty and ${AUTO_INIT_ENV_VAR}=true — proceeding with initialization.`);
  } else {
    console.log("[vercel-build] Existing Company table or migrations history found — proceeding (migrate deploy is safe/idempotent here regardless).");
  }

  await prisma.$disconnect().catch(() => {});

  try {
    runMigrateDeploy();
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
    const postMigratePrisma = await connectPrisma(databaseUrl);
    try {
      await upsertBaselineCompany(postMigratePrisma);
    } finally {
      await postMigratePrisma.$disconnect();
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
