import { createHash, randomUUID } from "node:crypto";
import type { BundledMigration } from "@/lib/migration-bundle.generated";
import { SCHEMA_SHAPE, ALL_SCHEMA_TABLES } from "@/lib/schema-shape.generated";

// Runtime schema guard: before a website write depends on the CRM tables,
// verify they exist AND are structurally intact, and — ONLY when explicitly
// permitted — safely bring the database up to the required schema: full
// initialization for a genuinely empty database, or narrow, additive repair
// of specific missing objects on an otherwise-recognizable one.
//
// Deliberately free of `server-only` and of any Prisma client import, and
// written against an abstract SqlRunner, so tests/schema-guard.spec.ts can
// run it against a real (in-process, disposable) PostgreSQL engine.
//
// *** WHY OBJECT-LEVEL REPAIR EXISTS, NOT JUST "MIGRATE DEPLOY" ***
// Prisma's `_prisma_migrations` table records that a migration ran; it says
// nothing about whether the objects that migration created still physically
// exist. If someone manually drops one table (e.g. `Subscriber`) on an
// otherwise-healthy, fully-migrated database, `prisma migrate deploy` sees
// "no pending migrations" and does nothing — the table stays gone. This
// guard queries PostgreSQL's own catalog every time (`information_schema` /
// `pg_catalog`), which is the only thing that can't lie about whether an
// object is actually there. See inspectSchema() below.
//
// SCHEMA_SHAPE (src/lib/schema-shape.generated.ts) is the canonical,
// introspection-derived "what should this table look like" reference — the
// FINAL, fully-migrated form of each required table (columns, primary key,
// indexes, foreign keys), captured by scripts/generate-schema-shape.mjs from
// a disposable engine that had the real 54 migrations applied to it. This
// is deliberately NOT a replay of migration files (which would need fragile
// cross-file dependency tracking - a later migration can add a column/index
// to a table an earlier one created); it's the authoritative end state,
// derived from PostgreSQL's own catalog the same way `pg_dump` is.
//
// SAFETY MODEL (every branch below is covered by a test):
//   healthy            every required table present, structurally intact,
//                       with its expected indexes/constraints -> nothing is
//                       created, altered or reset.
//   empty               zero tables in `public`       -> full initialization
//                       (the real migration history) ONLY when
//                       DATABASE_AUTO_INIT=true. This is the guard against a
//                       wrong/stale DATABASE_URL silently becoming an orphan
//                       CRM (the real incident this gate was first built for).
//   needs_repair        every present table's OWN columns match SCHEMA_SHAPE,
//                       but one or more required tables are entirely missing
//                       and/or an existing required table is missing an
//                       index/unique-constraint/foreign-key/primary-key ->
//                       repaired ONLY when DATABASE_AUTO_INIT=true, and ONLY
//                       the missing objects — existing tables, their data,
//                       and unrelated objects are never touched. THIS
//                       REPAIRS SCHEMA, NOT DATA: a manually-deleted table's
//                       rows are gone; recreating the table does not bring
//                       them back (see repairSchema()'s own comment).
//   unsafe_damage        a required table exists but a REQUIRED column is
//                       missing or has a different type than expected ->
//                       ALWAYS refused, regardless of the opt-in. Changing
//                       an existing column, or guessing at what a modified
//                       table "should" look like, risks real data — this
//                       guard only ever performs additive, purely-safe DDL.
//   partial_unexpected   the database has some required tables AND at least
//                       one table that ISN'T one of ours -> ALWAYS refused.
//                       Table names matching by coincidence isn't enough
//                       evidence this is our database.
//   unrelated           tables exist, NONE are ours -> ALWAYS refused.
//                       Another application's database is never touched.
//
// Concurrency: initialization/repair runs under a Postgres advisory lock —
// the same key Prisma's own `migrate deploy` takes, so this and a build-time
// migrate serialize against each other too — and state is RE-INSPECTED after
// the lock is acquired, so a second concurrent request finds the work done
// and does nothing (or, if the first repair only partly succeeded, finds an
// accurate, current diagnosis to act on next). Each newly-created table is
// recorded as a synthetic entry in Prisma's `_prisma_migrations` table only
// during full empty-database initialization (see applyMigrations) - object-
// level repair does not touch `_prisma_migrations`, since it isn't
// replaying a migration, it's restoring a specific object to its known-good
// shape; migration bookkeeping is intentionally left to `prisma migrate deploy`.
//
// Never destructive: repair only ever runs CREATE TABLE IF NOT EXISTS, CREATE
// INDEX (non-existing names only), and ADD CONSTRAINT (which PostgreSQL
// itself refuses, leaving data untouched, if existing rows would violate
// it) — never DROP, never ALTER COLUMN, never TRUNCATE, never anything that
// can lose or corrupt a byte of existing data. Errors carry only safe text;
// DATABASE_URL, credentials and raw SQL are never included in a message.

export interface SqlRunner {
  query(sql: string, params?: unknown[]): Promise<Array<Record<string, unknown>>>;
  /** Multi-statement execution (no parameters). */
  exec(sql: string): Promise<void>;
}

// Every table the website's three write paths (plus resolveContact and
// lead-distribution) actually touch — re-derived directly against
// src/server/actions/*.ts and src/server/{contact,lead-distribution}.ts
// (see WEBSITE_REQUIRED_COLUMNS below for the exact column-level audit) —
// the allowlist of objects this application owns and may create/repair.
// A plain literal, NOT derived from SCHEMA_SHAPE: scripts/generate-schema-shape.mjs
// imports THIS constant to know which tables to introspect when building
// SCHEMA_SHAPE, so the dependency must run this direction only — SCHEMA_SHAPE
// deriving REQUIRED_TABLES instead would be circular (the generator would need
// the very file it's about to (re)generate).
export const REQUIRED_TABLES = [
  "Company", "Account", "Contact", "ContactEmail", "ContactPhone",
  "ContactInquiry", "Lead", "LeadStatusHistory", "LeadQueueEntry",
  "Activity", "Airport", "Subscriber", "Notification",
] as const;

// Table names known, from this repository's own migration history comments
// (see prisma/migrations/20260830115639_exchange_and_cancellation_workflow
// and docs/PRODUCTION_READINESS.md's "3 orphaned database tables" note), to
// have legitimately existed in this exact shared production Postgres
// database from a since-removed Google Sheets integration that is NOT part
// of this project's Prisma schema or migration history. Their current
// live status is explicitly documented as unconfirmed (may already be
// dropped by the CRM team, may still be present) — either way, their mere
// presence must never make this guard treat the database as "unrelated" or
// refuse service: that would be a real, self-inflicted outage over tables
// this application has always known about and never owned or touched.
// Excluded from BOTH inspectSchema()'s unexpectedTables detection and any
// repair decision — never created, altered, or dropped by this guard.
const KNOWN_EXTERNAL_TABLES = new Set(["NewsletterSubscriber", "SheetSyncRecord", "SubmissionSequence"]);

// Columns the website's own write paths (subscribe-newsletter,
// submit-contact-message, submit-flight-request, resolveContact,
// distributeNewWebsiteLead — audited directly against src/server/actions/*
// and src/server/{contact,lead-distribution}.ts) actually read or write,
// per required table. Used ONLY to judge "unsafe structural damage" on an
// EXISTING table — never for the recreate-if-missing recipe (which always
// restores a missing table's FULL shape, every CRM column, from
// SCHEMA_SHAPE), and never for which indexes/constraints are eligible for
// safe additive repair (which also always targets the full shape).
// Deliberately narrower than SCHEMA_SHAPE[table].columns: the CRM (Compass
// Tools) owns many columns on these same tables that this website never
// queries (e.g. Account.bookingPermissions/tipPercent/accountsVisible,
// Notification.contactInquiryId) and evolves them independently via its own
// `prisma migrate deploy` — refusing website service over a CRM-internal
// column this app's code never references would be exactly the false
// alarm this guard exists to avoid. Verified: every table below already
// has 100% of these columns at the point it's first created in the real
// migration history, so a CRM-only column added later never appears here.
const WEBSITE_REQUIRED_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  Company: ["id"],
  Account: ["id", "role"],
  Contact: ["id", "companyId", "firstName", "lastName", "primaryPhone", "primaryEmail"],
  ContactEmail: ["id", "contactId", "email", "type", "isPrimary"],
  ContactPhone: ["id", "contactId", "number", "type", "isPrimary"],
  ContactInquiry: ["id", "companyId", "firstName", "lastName", "email", "phone", "subject", "message", "status", "matchedContactId", "updatedAt"],
  Lead: [
    "id", "contactId", "departureAirportId", "arrivalAirportId", "departureDate", "returnDate", "tripType", "cabinClass",
    "adults", "children", "infants", "flexibleDates", "preferredAirline", "budget", "notes", "source", "priority",
    "status", "assignedAgentId", "queueDistributedAt",
  ],
  LeadStatusHistory: ["id", "leadId", "toStatus"],
  LeadQueueEntry: ["id", "accountId", "isActive", "lastAssignedAt", "joinedAt", "leadsAssignedCount"],
  Activity: ["id", "contactId", "leadId", "actorId", "type", "description", "metadata"],
  Airport: ["id", "iata", "name", "city", "country"],
  Subscriber: ["id", "companyId", "email", "status", "source", "unsubscribeToken", "subscribedAt", "unsubscribedAt", "updatedAt"],
  Notification: ["id", "accountId", "leadId", "type", "title", "body"],
};

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

export type SchemaKind = "healthy" | "empty" | "needs_repair" | "unsafe_damage" | "partial_unexpected" | "unrelated";

export interface TableDiagnosis {
  table: string;
  exists: boolean;
  missingColumns: string[];
  mismatchedColumns: Array<{ column: string; expected: string; actual: string }>;
  missingPrimaryKey: boolean;
  missingUniqueConstraints: string[]; // names
  missingIndexes: string[]; // full CREATE INDEX statements still needed
  missingForeignKeys: string[]; // names
}

export interface SchemaInspection {
  kind: SchemaKind;
  missingTables: string[];
  unexpectedTables: string[];
  hasMigrationsTable: boolean;
  /** Bundled migrations not recorded as applied (only knowable when Prisma's tracking table exists). */
  pending: string[];
  /** Per required-and-present table: what (if anything) differs from SCHEMA_SHAPE. Empty when healthy. */
  diagnoses: TableDiagnosis[];
}

export type SchemaNotReadyReason =
  | "empty_init_not_permitted"
  | "repair_not_permitted"
  | "unsafe_structural_damage"
  | "partial_schema"
  | "unrelated_database"
  | "init_failed"
  | "repair_failed"
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

// Extracts the local column list from a single DDL fragment — the first
// parenthesized group right after PRIMARY KEY/UNIQUE/FOREIGN KEY (for an ADD
// CONSTRAINT statement, deliberately NOT the REFERENCES target's own column
// list, which comes later in the same string) or the LAST parenthesized
// group (for a CREATE INDEX statement, where the column list is always the
// final "(...)" before the trailing ";"). Column names are unquoted and
// case-preserved. Returns [] (never blocks anything) if nothing matches —
// this is a best-effort classification aid, not a correctness-critical parse.
function extractDdlColumns(sql: string): string[] {
  const keyed = sql.match(/(?:PRIMARY KEY|UNIQUE|FOREIGN KEY)\s*\(([^)]+)\)/i);
  const group = keyed ? keyed[1] : sql.match(/\(([^()]+)\)\s*;?\s*$/)?.[1];
  if (!group) return [];
  return group.split(",").map((c) => c.trim().replace(/^"|"$/g, "")).filter(Boolean);
}

async function diagnoseTable(db: SqlRunner, table: string, exists: boolean): Promise<TableDiagnosis> {
  const shape = SCHEMA_SHAPE[table as keyof typeof SCHEMA_SHAPE];
  const base: TableDiagnosis = { table, exists, missingColumns: [], mismatchedColumns: [], missingPrimaryKey: false, missingUniqueConstraints: [], missingIndexes: [], missingForeignKeys: [] };
  if (!exists) return base;

  const liveCols = new Map(
    (
      await db.query(
        `SELECT a.attname AS name, pg_catalog.format_type(a.atttypid, a.atttypmod) AS type
         FROM pg_attribute a WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped`,
        [`"${table}"`],
      )
    ).map((r) => [String(r.name), String(r.type)]),
  );
  // Only the columns this website's own code actually reads/writes gate
  // "unsafe damage" — see WEBSITE_REQUIRED_COLUMNS's comment for why the
  // full SCHEMA_SHAPE column list (the entire CRM schema for this table)
  // would be too broad and cause false refusals over CRM-only columns.
  const requiredCols = WEBSITE_REQUIRED_COLUMNS[table] ?? shape.columns.map((c) => c.name);
  const byName = new Map(shape.columns.map((c) => [c.name, c.type]));
  for (const name of requiredCols) {
    const expectedType = byName.get(name);
    if (!expectedType) continue; // defensive: allowlist entry not in SCHEMA_SHAPE, nothing to compare against
    if (!liveCols.has(name)) base.missingColumns.push(name);
    else if (liveCols.get(name) !== expectedType) base.mismatchedColumns.push({ column: name, expected: expectedType, actual: String(liveCols.get(name)) });
  }

  // An index/constraint only gates "needs_repair" on an EXISTING table (and
  // thus only becomes eligible for standalone repair) if EVERY column it
  // covers is one the website actually depends on (WEBSITE_REQUIRED_COLUMNS)
  // — same reasoning as the column check above. A CRM-only index/FK (e.g.
  // Notification's contactInquiryId index, added by a CRM-only migration
  // long after Notification itself was created) must not block "healthy" or
  // get flagged just because this guard's SCHEMA_SHAPE happens to record the
  // table's FULL, final CRM shape. This never limits full-table recreation
  // (see repairObjects: a newly-created table always gets its complete
  // shape, every index/constraint, regardless of this scoping).
  const isWebsiteRelevant = (sql: string) => {
    const cols = extractDdlColumns(sql);
    return cols.length > 0 && cols.every((c) => requiredCols.includes(c));
  };

  const liveConstraints = new Set(
    (await db.query(`SELECT conname FROM pg_constraint WHERE conrelid = $1::regclass`, [`"${table}"`])).map((r) => String(r.conname)),
  );
  if (shape.primaryKey && !liveConstraints.has(shape.primaryKey.name) && isWebsiteRelevant(shape.primaryKey.sql)) base.missingPrimaryKey = true;
  for (const uq of shape.uniqueConstraints) if (!liveConstraints.has(uq.name) && isWebsiteRelevant(uq.sql)) base.missingUniqueConstraints.push(uq.name);
  for (const fk of shape.foreignKeys) if (!liveConstraints.has(fk.name) && isWebsiteRelevant(fk.sql)) base.missingForeignKeys.push(fk.name);

  const liveIndexNames = new Set((await db.query(`SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = $1`, [table])).map((r) => String(r.indexname)));
  for (const idxSql of shape.indexes) {
    const nameMatch = idxSql.match(/INDEX "([^"]+)"/);
    if (nameMatch && !liveIndexNames.has(nameMatch[1]) && isWebsiteRelevant(idxSql)) base.missingIndexes.push(idxSql);
  }

  return base;
}

export async function inspectSchema(db: SqlRunner, bundle: readonly BundledMigration[]): Promise<SchemaInspection> {
  const tableRows = await db.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
  );
  const tables = new Set(tableRows.map((r) => String(r.table_name)));
  const hasMigrationsTable = tables.has("_prisma_migrations");
  const userTables = [...tables].filter((t) => t !== "_prisma_migrations");

  const missingTables = REQUIRED_TABLES.filter((t) => !tables.has(t));
  // A table only counts as "unexpected"/foreign if it's NEITHER a
  // REQUIRED_TABLES member NOR any other legitimate Compass Tools CRM table
  // (ALL_SCHEMA_TABLES — the full ~40-table schema the real migration
  // bundle creates; Booking/Quote/Task/etc. are entirely real and expected,
  // the website just never queries them directly) NOR a KNOWN_EXTERNAL_TABLES
  // entry (a since-removed integration's tables, documented as possibly
  // still present in the real shared production database).
  const knownTables = new Set<string>([...ALL_SCHEMA_TABLES, ...KNOWN_EXTERNAL_TABLES]);
  const unexpectedTables = userTables.filter((t) => !knownTables.has(t));

  let pending: string[] = [];
  if (hasMigrationsTable) {
    const applied = new Set(
      (await db.query(`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`)).map(
        (r) => String(r.migration_name),
      ),
    );
    pending = bundle.map((m) => m.name).filter((n) => !applied.has(n));
  }

  const diagnoses = await Promise.all(REQUIRED_TABLES.map((t) => diagnoseTable(db, t, tables.has(t))));
  const hasUnsafeDamage = diagnoses.some((d) => d.missingColumns.length > 0 || d.mismatchedColumns.length > 0);
  const needsObjectRepair = diagnoses.some(
    (d) => !d.exists || d.missingPrimaryKey || d.missingUniqueConstraints.length > 0 || d.missingIndexes.length > 0 || d.missingForeignKeys.length > 0,
  );

  let kind: SchemaKind;
  if (userTables.length === 0) kind = "empty";
  // Nothing this app owns is present at all (whether or not the database
  // is genuinely empty of userTables — e.g. only KNOWN_EXTERNAL_TABLES, or
  // only tables belonging to a wholly different application, are present)
  // -> never treat this as "ready to safely initialize"; that is exactly
  // the wrong-DATABASE_URL scenario this guard exists to refuse.
  else if (missingTables.length === REQUIRED_TABLES.length) kind = "unrelated";
  else if (unexpectedTables.length > 0) kind = "partial_unexpected";
  else if (hasUnsafeDamage) kind = "unsafe_damage";
  else if (needsObjectRepair) kind = "needs_repair";
  else kind = "healthy";

  return { kind, missingTables, unexpectedTables, hasMigrationsTable, pending, diagnoses };
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
        `Schema initialization stopped at migration "${m.name}". The database was left as-is at that point (earlier migrations remain applied and recorded); it will be reported as needing repair until resolved.`,
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

// Additive, narrow repair of exactly the missing objects a set of table
// diagnoses identified — never touches a table/object that already exists
// correctly. THIS RESTORES SCHEMA, NOT DATA: if a table was manually
// dropped, its rows are already gone; recreating the table gives the
// website somewhere to write NEW rows again, it does not un-delete the old
// ones. Only PostgreSQL/Aiven backups or point-in-time recovery can do that
// — this function cannot and does not claim to.
//
// Two-phase so foreign keys (which reference another table's primary key)
// are only added once every table's own primary key exists, regardless of
// how many tables in this batch were missing at once:
//   phase 1: CREATE TABLE (if missing) + its own primary key
//   phase 2: indexes, then unique constraints, then foreign keys
async function repairObjects(db: SqlRunner, diagnoses: readonly TableDiagnosis[]): Promise<{ tablesCreated: string[]; objectsAdded: number }> {
  const tablesCreated: string[] = [];
  let objectsAdded = 0;
  const run = async (label: string, sql: string) => {
    try {
      await db.exec(sql);
      objectsAdded++;
    } catch (err) {
      throw new SchemaNotReadyError("repair_failed", `Repair failed while adding ${label}. No existing data was modified by this attempt.`, { cause: err });
    }
  };

  for (const d of diagnoses) {
    if (d.exists) continue;
    const shape = SCHEMA_SHAPE[d.table as keyof typeof SCHEMA_SHAPE];
    await run(`table "${d.table}"`, shape.createTable);
    if (shape.primaryKey) await run(`primary key on "${d.table}"`, shape.primaryKey.sql);
    tablesCreated.push(d.table);
  }
  for (const d of diagnoses) {
    const shape = SCHEMA_SHAPE[d.table as keyof typeof SCHEMA_SHAPE];
    const wasCreated = tablesCreated.includes(d.table);
    const indexesNeeded = wasCreated ? shape.indexes : d.missingIndexes;
    for (const idxSql of indexesNeeded) await run(`index on "${d.table}"`, idxSql);
    if (wasCreated || d.missingPrimaryKey) {
      // primary key for a just-created table was already added above; this only covers
      // the (rare) case of an EXISTING table that is somehow missing just its primary key.
      if (!wasCreated && d.missingPrimaryKey && shape.primaryKey) await run(`primary key on "${d.table}"`, shape.primaryKey.sql);
    }
    const uniquesNeeded = wasCreated ? shape.uniqueConstraints.map((c) => c.name) : d.missingUniqueConstraints;
    for (const name of uniquesNeeded) {
      const c = shape.uniqueConstraints.find((u) => u.name === name);
      if (c) await run(`unique constraint "${name}" on "${d.table}"`, c.sql);
    }
  }
  for (const d of diagnoses) {
    const shape = SCHEMA_SHAPE[d.table as keyof typeof SCHEMA_SHAPE];
    const wasCreated = tablesCreated.includes(d.table);
    const fksNeeded = wasCreated ? shape.foreignKeys.map((c) => c.name) : d.missingForeignKeys;
    for (const name of fksNeeded) {
      const c = shape.foreignKeys.find((f) => f.name === name);
      if (c) await run(`foreign key "${name}" on "${d.table}"`, c.sql);
    }
  }
  return { tablesCreated, objectsAdded };
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
  repaired: boolean;
  tablesRepaired: string[];
  objectsRepaired: number;
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
  const empty = (over: Partial<EnsureSchemaResult> = {}): EnsureSchemaResult => ({
    kind: "healthy",
    initialized: false,
    appliedMigrations: [],
    repaired: false,
    tablesRepaired: [],
    objectsRepaired: 0,
    companySeeded: false,
    pendingNotApplied: [],
    ...over,
  });

  const first = await inspectSchema(db, bundle);

  if (first.kind === "unsafe_damage") {
    const details = first.diagnoses
      .filter((d) => d.missingColumns.length || d.mismatchedColumns.length)
      .map((d) => `${d.table}: ${[...d.missingColumns.map((c) => `missing column ${c}`), ...d.mismatchedColumns.map((c) => `column ${c.column} is ${c.actual}, expected ${c.expected}`)].join("; ")}`)
      .join(" | ");
    throw new SchemaNotReadyError(
      "unsafe_structural_damage",
      `A required table has a structural difference that cannot be safely auto-repaired (${details}). No automatic change was made. An administrator must resolve this manually.`,
    );
  }
  if (first.kind === "partial_unexpected") {
    throw new SchemaNotReadyError(
      "partial_schema",
      `The connected database has some required tables (missing: ${first.missingTables.join(", ") || "none"}) alongside tables this application does not recognize (${first.unexpectedTables.join(", ")}). Too ambiguous to safely repair automatically; not modified.`,
    );
  }
  if (first.kind === "unrelated") {
    throw new SchemaNotReadyError(
      "unrelated_database",
      "The connected database does not contain the expected Business Flights Travel / Compass Tools schema and holds other tables. It will not be initialized or modified. Verify DATABASE_URL points at the correct database.",
    );
  }

  // EMPTY (zero tables) and NEEDS_REPAIR (some/all required tables or their
  // indexes/constraints missing, nothing unsafe or unrecognized) share one
  // handler: both require the same opt-in, both re-inspect the ACTUAL
  // database again once the advisory lock is held (never trust the
  // unlocked, outer `first` snapshot for what to do — only for whether to
  // even try), and a race can flip one into the other between those two
  // inspections (a concurrent request may finish full init while this one
  // waited for the lock, or vice versa) — so the locked branch below acts
  // on `again`, not `first`, and handles every kind it might now find.
  if (first.kind === "empty" || first.kind === "needs_repair") {
    if (!autoInit) {
      if (first.kind === "empty") {
        throw new SchemaNotReadyError(
          "empty_init_not_permitted",
          "The connected database is empty and DATABASE_AUTO_INIT is not set to \"true\", so it was not initialized. If this is an intentional brand-new database, set DATABASE_AUTO_INIT=true; otherwise DATABASE_URL is likely misconfigured.",
        );
      }
      const summary = [
        ...first.missingTables.map((t) => `missing table ${t}`),
        ...first.diagnoses
          .filter((d) => d.exists)
          .flatMap((d) => [
            ...(d.missingIndexes.length ? [`${d.table}: missing index(es)`] : []),
            ...d.missingUniqueConstraints.map((n) => `${d.table}: missing unique constraint ${n}`),
            ...d.missingForeignKeys.map((n) => `${d.table}: missing foreign key ${n}`),
            ...(d.missingPrimaryKey ? [`${d.table}: missing primary key`] : []),
          ]),
      ].join("; ");
      throw new SchemaNotReadyError(
        "repair_not_permitted",
        `The connected database is missing managed schema objects this application owns (${summary}) and DATABASE_AUTO_INIT is not set to "true", so nothing was repaired. Existing data is untouched. Set DATABASE_AUTO_INIT=true to allow safe, additive repair of these specific objects.`,
      );
    }
    return withMigrateLock(db, async () => {
      const again = await inspectSchema(db, bundle);
      if (again.kind === "unsafe_damage" || again.kind === "partial_unexpected" || again.kind === "unrelated") {
        throw new SchemaNotReadyError("partial_schema", "The database's condition changed before initialization/repair could run; stopping without modifying it.");
      }
      let appliedMigrations: string[] = [];
      let tablesRepaired: string[] = [];
      let objectsRepaired = 0;
      if (again.kind === "empty") {
        log("[schema-guard] Empty database + DATABASE_AUTO_INIT=true — applying the real migration history.");
        appliedMigrations = await applyMigrations(db, bundle);
      } else if (again.kind === "needs_repair") {
        log(`[schema-guard] Missing managed schema objects detected + DATABASE_AUTO_INIT=true — repairing (missing tables: ${again.missingTables.join(", ") || "none"}).`);
        const result = await repairObjects(db, again.diagnoses);
        tablesRepaired = result.tablesCreated;
        objectsRepaired = result.objectsAdded;
      }
      // else: already healthy — a concurrent request finished the work
      // while this one waited for the lock. Nothing to do but seed/verify.
      const companySeeded = await seedBaselineCompany(db);
      const verified = await inspectSchema(db, bundle);
      if (verified.kind !== "healthy") {
        throw new SchemaNotReadyError("verification_failed", "Schema verification after initialization/repair still reports issues; not marking healthy. Safe to retry on the next request.");
      }
      return empty({
        initialized: appliedMigrations.length > 0,
        appliedMigrations,
        repaired: tablesRepaired.length > 0 || objectsRepaired > 0,
        tablesRepaired,
        objectsRepaired,
        companySeeded,
      });
    });
  }

  // healthy — every required table present and structurally correct.
  if (autoInit && first.hasMigrationsTable && first.pending.length > 0) {
    return withMigrateLock(db, async () => {
      const again = await inspectSchema(db, bundle);
      const pendingMigrations = bundle.filter((m) => again.pending.includes(m.name));
      const appliedMigrations = pendingMigrations.length ? await applyMigrations(db, pendingMigrations) : [];
      const companySeeded = await seedBaselineCompany(db);
      return empty({ appliedMigrations, companySeeded });
    });
  }
  const companySeeded = autoInit ? await withMigrateLock(db, () => seedBaselineCompany(db)) : false;
  return empty({ companySeeded, pendingNotApplied: first.pending });
}
