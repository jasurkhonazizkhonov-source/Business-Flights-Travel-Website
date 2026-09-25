import { createHash, randomUUID } from "node:crypto";
import type { BundledMigration } from "@/lib/migration-bundle.generated";

// Runtime schema guard: before a website write depends on the CRM tables,
// verify they exist, and — ONLY when explicitly permitted — bring an
// intentionally-empty database up to the CRM's real schema using the real
// migration history (prisma/migrations, embedded via
// migration-bundle.generated.ts), then re-verify before the write proceeds.
//
// Deliberately free of `server-only` and of any Prisma client import, and
// written against an abstract SqlRunner, so tests/schema-guard.spec.ts can
// run it against a real (in-process, disposable) PostgreSQL engine.
//
// SAFETY MODEL (every branch below is covered by a test):
//   healthy     all required tables present  -> nothing is created, altered or
//               reset. (If Prisma's tracking table shows bundled migrations that
//               were never applied, they are applied ONLY with the explicit
//               opt-in; otherwise this just reports them.)
//   empty       zero tables in `public`       -> initialized ONLY when
//               DATABASE_AUTO_INIT=true. Without it: refused with a clear,
//               credential-free administrative error. This is the guard against
//               a wrong/stale DATABASE_URL silently becoming an orphan CRM
//               (the real incident this gate exists for).
//   partial     some CRM tables, not all      -> ALWAYS refused. Never guessed at,
//               never "repaired" by replaying history from scratch.
//   unrelated   tables exist, none are CRM's  -> ALWAYS refused. Another
//               application's database is never written to.
//
// Concurrency: initialization runs under a Postgres advisory lock — the same
// key Prisma's own `migrate deploy` takes, so a runtime init and a build-time
// migrate serialize against each other too — and state is RE-INSPECTED after
// the lock is acquired, so a second concurrent request finds the work done
// and does nothing. Each migration is recorded in Prisma's `_prisma_migrations`
// table in Prisma's own format, so `prisma migrate deploy` afterwards sees a
// normal, fully-tracked database.
//
// Never destructive: only CREATE-style statements from the migration history
// run, only against a database inspected as empty (or Prisma-tracked with
// pending migrations). Errors carry only safe text; DATABASE_URL, credentials
// and raw SQL never appear in a message.

export interface SqlRunner {
  query(sql: string, params?: unknown[]): Promise<Array<Record<string, unknown>>>;
  /** Multi-statement execution (no parameters). */
  exec(sql: string): Promise<void>;
}

/** Every table the website's three write paths (plus lead distribution) touch. */
export const REQUIRED_TABLES = [
  "Company",
  "Account",
  "Contact",
  "ContactEmail",
  "ContactPhone",
  "ContactInquiry",
  "Lead",
  "LeadStatusHistory",
  "LeadQueueEntry",
  "Activity",
  "Airport",
  "Subscriber",
  "Notification",
] as const;

// Same advisory-lock key Prisma's schema engine uses for migrate.
const MIGRATE_ADVISORY_LOCK_KEY = 72707369;

// The single Business Flights Travel company — identical to
// compass-tools/prisma/seed.ts's seedCompany() (fixed id, so the insert is
// idempotent and can never yield a second company).
export const BASELINE_COMPANY = {
  id: "default-company",
  name: "Business Flights Travel",
  website: "https://www.businessflights.travel",
  phone: "+1 (000) 000-0000",
  brandColor: "#1c3a5e",
  signatureTemplate: "Best regards,\n{{first_name}} {{last_name}}\n{{phone_number}}",
} as const;

export type SchemaKind = "healthy" | "empty" | "partial" | "unrelated";

export interface SchemaInspection {
  kind: SchemaKind;
  missing: string[];
  hasMigrationsTable: boolean;
  /** Bundled migrations not recorded as applied (only knowable when Prisma's tracking table exists). */
  pending: string[];
}

export type SchemaNotReadyReason =
  | "empty_init_not_permitted"
  | "partial_schema"
  | "unrelated_database"
  | "init_failed"
  | "verification_failed";

export class SchemaNotReadyError extends Error {
  readonly reason: SchemaNotReadyReason;
  constructor(reason: SchemaNotReadyReason, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SchemaNotReadyError";
    this.reason = reason;
  }
}

export function migrationChecksum(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

export async function inspectSchema(db: SqlRunner, bundle: readonly BundledMigration[]): Promise<SchemaInspection> {
  const tableRows = await db.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
  );
  const tables = new Set(tableRows.map((r) => String(r.table_name)));
  const hasMigrationsTable = tables.has("_prisma_migrations");
  const userTables = [...tables].filter((t) => t !== "_prisma_migrations");

  const missing = REQUIRED_TABLES.filter((t) => !tables.has(t));
  const presentRequired = REQUIRED_TABLES.length - missing.length;

  let pending: string[] = [];
  if (hasMigrationsTable) {
    const applied = new Set(
      (await db.query(`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`)).map(
        (r) => String(r.migration_name),
      ),
    );
    pending = bundle.map((m) => m.name).filter((n) => !applied.has(n));
  }

  let kind: SchemaKind;
  if (missing.length === 0) kind = "healthy";
  else if (userTables.length === 0) kind = "empty";
  else if (presentRequired > 0) kind = "partial";
  else kind = "unrelated";

  return { kind, missing, hasMigrationsTable, pending };
}

async function withMigrateLock<T>(db: SqlRunner, fn: () => Promise<T>): Promise<T> {
  await db.query(`SELECT pg_advisory_lock($1)`, [MIGRATE_ADVISORY_LOCK_KEY]);
  try {
    return await fn();
  } finally {
    await db.query(`SELECT pg_advisory_unlock($1)`, [MIGRATE_ADVISORY_LOCK_KEY]).catch(() => undefined);
  }
}

const CREATE_MIGRATIONS_TABLE = `CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id" VARCHAR(36) PRIMARY KEY NOT NULL,
  "checksum" VARCHAR(64) NOT NULL,
  "finished_at" TIMESTAMPTZ,
  "migration_name" VARCHAR(255) NOT NULL,
  "logs" TEXT,
  "rolled_back_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
)`;

async function applyMigrations(db: SqlRunner, migrations: readonly BundledMigration[]): Promise<string[]> {
  await db.exec(CREATE_MIGRATIONS_TABLE);
  const applied: string[] = [];
  for (const m of migrations) {
    try {
      await db.exec(m.sql);
    } catch (err) {
      throw new SchemaNotReadyError(
        "init_failed",
        `Schema initialization stopped at migration "${m.name}". The database was left as-is at that point (earlier migrations remain applied and recorded); it will be reported as partial until resolved by an administrator.`,
        { cause: err },
      );
    }
    await db.query(
      `INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","started_at","applied_steps_count") VALUES ($1,$2,now(),$3,now(),1)`,
      [randomUUID(), migrationChecksum(m.sql), m.name],
    );
    applied.push(m.name);
  }
  return applied;
}

async function seedBaselineCompany(db: SqlRunner): Promise<boolean> {
  // Only when the table holds no company at all — an existing company (whatever
  // its id) is never joined by a second one.
  const [row] = await db.query(`SELECT count(*)::int AS n FROM "Company"`);
  if (Number(row?.n ?? 0) > 0) return false;
  const c = BASELINE_COMPANY;
  await db.query(
    `INSERT INTO "Company" ("id","name","website","phone","brandColor","signatureTemplate","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,now()) ON CONFLICT ("id") DO NOTHING`,
    [c.id, c.name, c.website, c.phone, c.brandColor, c.signatureTemplate],
  );
  return true;
}

export interface EnsureSchemaResult {
  kind: SchemaKind;
  initialized: boolean;
  appliedMigrations: string[];
  companySeeded: boolean;
  pendingNotApplied: string[];
}

export async function ensureSchema(args: {
  db: SqlRunner;
  bundle: readonly BundledMigration[];
  autoInit: boolean;
  log?: (message: string) => void;
}): Promise<EnsureSchemaResult> {
  const { db, bundle, autoInit } = args;
  const log = args.log ?? (() => undefined);

  const first = await inspectSchema(db, bundle);

  if (first.kind === "partial") {
    throw new SchemaNotReadyError(
      "partial_schema",
      `The connected database has some, but not all, of the required CRM tables (missing: ${first.missing.join(", ")}). It is not being modified automatically; an administrator must resolve this.`,
    );
  }
  if (first.kind === "unrelated") {
    throw new SchemaNotReadyError(
      "unrelated_database",
      "The connected database does not contain the expected Business Flights Travel / Compass Tools schema and holds other tables. It will not be initialized or modified. Verify DATABASE_URL points at the correct database.",
    );
  }

  if (first.kind === "empty") {
    if (!autoInit) {
      throw new SchemaNotReadyError(
        "empty_init_not_permitted",
        "The connected database is empty and DATABASE_AUTO_INIT is not set to \"true\", so it was not initialized. If this is an intentional brand-new database, set DATABASE_AUTO_INIT=true; otherwise DATABASE_URL is likely misconfigured.",
      );
    }
    return withMigrateLock(db, async () => {
      // Re-check under the lock: a concurrent request may have finished the job.
      const again = await inspectSchema(db, bundle);
      if (again.kind === "partial" || again.kind === "unrelated") {
        throw new SchemaNotReadyError("partial_schema", "The database changed state during initialization and is no longer empty; stopping without modifying it.");
      }
      let appliedMigrations: string[] = [];
      if (again.kind === "empty") {
        log("[schema-guard] Empty database + DATABASE_AUTO_INIT=true — applying the real migration history.");
        appliedMigrations = await applyMigrations(db, bundle);
      }
      const companySeeded = await seedBaselineCompany(db);
      const verified = await inspectSchema(db, bundle);
      if (verified.kind !== "healthy") {
        throw new SchemaNotReadyError("verification_failed", `Schema verification after initialization failed (missing: ${verified.missing.join(", ")}).`);
      }
      return { kind: "healthy" as const, initialized: appliedMigrations.length > 0, appliedMigrations, companySeeded, pendingNotApplied: [] };
    });
  }

  // healthy
  if (autoInit && first.hasMigrationsTable && first.pending.length > 0) {
    return withMigrateLock(db, async () => {
      const again = await inspectSchema(db, bundle);
      const pendingMigrations = bundle.filter((m) => again.pending.includes(m.name));
      const appliedMigrations = pendingMigrations.length ? await applyMigrations(db, pendingMigrations) : [];
      const companySeeded = await seedBaselineCompany(db);
      return { kind: "healthy" as const, initialized: false, appliedMigrations, companySeeded, pendingNotApplied: [] };
    });
  }
  const companySeeded = autoInit ? await withMigrateLock(db, () => seedBaselineCompany(db)) : false;
  return { kind: "healthy", initialized: false, appliedMigrations: [], companySeeded, pendingNotApplied: first.pending };
}
