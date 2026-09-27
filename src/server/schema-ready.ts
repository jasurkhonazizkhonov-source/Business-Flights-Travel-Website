import "server-only";
import { Client } from "pg";
import { MIGRATION_BUNDLE } from "@/lib/migration-bundle.generated";
import { ensureSchema, type SqlRunner } from "@/lib/schema-guard";

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

let ready: Promise<void> | null = null;

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
      log: (m) => console.warn(m),
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
      console.warn(`[schema-guard] Initialized an empty database: ${result.appliedMigrations.length} migrations applied.`);
    }
    if (result.repaired) {
      // Schema repaired, NOT data recovered — a manually-deleted table's rows
      // are gone regardless; see src/lib/schema-guard.ts's repairObjects() comment.
      console.warn(
        `[schema-guard] Repaired missing managed schema object(s): tables recreated = [${result.tablesRepaired.join(", ")}], objects added = ${result.objectsRepaired}. Pre-existing tables and data were not modified.`,
      );
    }
  } finally {
    await client.end().catch(() => undefined);
  }
}

export function ensureSchemaReady(): Promise<void> {
  if (!ready) {
    ready = verifyOnce().catch((err) => {
      ready = null; // never memoize a failure
      throw err;
    });
  }
  return ready;
}
