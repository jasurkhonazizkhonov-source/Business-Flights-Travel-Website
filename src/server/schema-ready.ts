import "server-only";
import { Client } from "pg";
import { MIGRATION_BUNDLE } from "@/lib/migration-bundle.generated";
import { ensureSchema, type SqlRunner } from "@/lib/schema-guard";
import { describeDatabaseTarget } from "@/lib/db-error";
import { createReadinessCache, isMissingSchemaObjectError } from "@/lib/readiness-cache";

// Runtime wiring for src/lib/schema-guard.ts — see that file for the full
// safety model. Called from getCrmCompanyId() (src/server/crm-company.ts),
// which every website write path (newsletter, contact, flight request)
// already goes through first, so the schema is verified BEFORE any insert
// and a first-ever submission against an intentionally-new database is
// written normally, in the same request, without the visitor resubmitting.
//
// One short-lived connection per cold instance (not per request): the
// result is memoized in-process once the schema is verified. A failure is
// NOT memoized, so an administrator fixing DATABASE_URL / setting
// DATABASE_AUTO_INIT takes effect on the next request without a redeploy.
// The connection budget on the shared Postgres is small, so this uses a
// single plain client and always closes it.

// A verified-healthy result is trusted for this long per instance, then re-inspected
// (see src/lib/readiness-cache.ts). The database stays authoritative: a table
// dropped later is noticed within this window, or immediately after a write
// fails with a missing-relation error (noteWriteFailure below).
const REVALIDATE_MS = 5 * 60 * 1000;

function connectionOptions(): { connectionString: string; ssl: { rejectUnauthorized: boolean }; connectionTimeoutMillis: number } {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    // Same message/prefix src/lib/prisma.ts throws, so describeDbError
    // categorizes both identically.
    throw new Error("DATABASE_URL is not set. Add it to .env (server-side only, never NEXT_PUBLIC_*).");
  }
  const u = new URL(databaseUrl);
  u.searchParams.delete("sslmode"); // same Aiven TLS handling as src/lib/prisma.ts
  return { connectionString: u.toString(), ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 };
}

async function verifyOnce(): Promise<void> {
  const client = new Client(connectionOptions());
  await client.connect();
  try {
    const runner: SqlRunner = {
      query: async (sql, params) => (await client.query(sql, params as unknown[] | undefined)).rows,
      exec: async (sql) => {
        await client.query(sql);
      },
    };
    const result = await ensureSchema({
      db: runner,
      bundle: MIGRATION_BUNDLE,
      autoInit: process.env.DATABASE_AUTO_INIT === "true",
      log: (m) => console.warn(`${m} | db target: ${describeDatabaseTarget()}`),
    });
    if (result.pendingNotApplied.length > 0) {
      // Healthy schema, but the bundled history lists migrations this database
      // hasn't recorded. Not blocking (the required tables exist and this may
      // simply be a CRM database ahead of/behind this bundle) — surfaced once.
      console.warn(
        `[schema-guard] ${result.pendingNotApplied.length} bundled migration(s) are not recorded as applied in this database; not applying them (DATABASE_AUTO_INIT is not "true").`,
      );
    }
    if (result.initialized) {
      console.warn(`[schema-guard] Initialized an empty database: ${result.appliedMigrations.length} migrations applied. | db target: ${describeDatabaseTarget()}`);
    }
    if (result.repaired) {
      // Schema repaired, NOT data recovered — a manually-deleted table's rows
      // are gone regardless; see src/lib/schema-guard.ts's repairObjects() comment.
      console.warn(
        `[schema-guard] Repaired missing managed schema object(s): tables recreated = [${result.tablesRepaired.join(", ")}], objects added = ${result.objectsRepaired}. Pre-existing tables and data were not modified. | db target: ${describeDatabaseTarget()}`,
      );
    }
  } finally {
    await client.end().catch(() => undefined);
  }
}

const cache = createReadinessCache({ ttlMs: REVALIDATE_MS, verify: verifyOnce });

export function ensureSchemaReady(): Promise<void> {
  return cache.ensure();
}

/** Call from a write path's catch block: a missing table/column error drops the memo so the next request re-inspects (and, if permitted, repairs). */
export function noteWriteFailure(err: unknown): void {
  if (isMissingSchemaObjectError(err)) cache.invalidate();
}
