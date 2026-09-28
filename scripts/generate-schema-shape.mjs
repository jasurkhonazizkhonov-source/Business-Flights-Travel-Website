#!/usr/bin/env node
// Regenerates src/lib/schema-shape.generated.ts — the canonical, per-table
// DDL used to repair ONE missing managed table (or its indexes/constraints)
// without needing to replay migration history or guess at column types.
//
// WHY THIS EXISTS (see src/lib/schema-guard.ts for the full story): Prisma's
// `_prisma_migrations` table can say every migration is applied while a
// table it created has since been deleted by hand — migration history is
// not authoritative for "does this table physically exist with the right
// shape." Repairing that safely needs a description of each table's FINAL,
// fully-migrated form — not a replay of 54 migration files in order, which
// would require fragile cross-file dependency tracking (a later migration
// might add a column/index/FK to a table an earlier one created).
//
// This script builds that description by applying the REAL migration
// history (prisma/migrations, via migration-bundle.generated.ts) to a
// disposable, in-process, real PostgreSQL 17 engine (PGlite), then asks
// PostgreSQL's own catalog to describe the result — the same technique
// `pg_dump` itself uses internally (`pg_catalog.format_type`,
// `pg_get_constraintdef`, `pg_indexes.indexdef`) — so the output is exactly
// what Postgres considers correct, not a hand-rolled type mapping.
//
// Only REQUIRED_TABLES (schema-guard.ts's allowlist of objects this
// application actually owns) get a full per-table repair recipe. Nothing
// here is ever run automatically — schema-guard.ts decides, per request,
// whether repair is safe and permitted; this file only supplies the "what
// would recreate it" half of that decision.
//
// Run via `npm run bundle:schema-shape` (tsx, NOT plain `node`): importing
// REQUIRED_TABLES pulls in the whole of src/lib/schema-guard.ts, which has
// a real runtime import of this very generated file via the "@/lib/..."
// path alias — only tsx (which honors tsconfig's `paths`) resolves that;
// plain Node's ESM loader does not know what "@/" means.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { MIGRATION_BUNDLE } from "../src/lib/migration-bundle.generated.ts";
import { REQUIRED_TABLES } from "../src/lib/schema-guard.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outFile = path.join(root, "src", "lib", "schema-shape.generated.ts");

async function buildShape() {
  const db = new PGlite();
  for (const m of MIGRATION_BUNDLE) await db.exec(m.sql);

  // The FULL Compass Tools CRM schema this migration bundle creates — every
  // table, not just REQUIRED_TABLES (the narrower subset the website's own
  // write paths touch and that schema-guard.ts is willing to targeted-repair).
  // schema-guard.ts uses this complete list ONLY to tell "a legitimate CRM
  // table the website doesn't happen to use" apart from "a table belonging
  // to some other, unrelated application" when deciding whether a database
  // is safely recognizable — never to gate readiness or trigger repair for
  // tables outside REQUIRED_TABLES.
  const allTables = (
    await db.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations' ORDER BY table_name`,
    )
  ).rows.map((r) => r.table_name);

  const shape = {};
  for (const table of REQUIRED_TABLES) {
    const cols = (
      await db.query(
        `SELECT a.attname AS name,
                pg_catalog.format_type(a.atttypid, a.atttypmod) AS type,
                a.attnotnull AS not_null,
                pg_get_expr(ad.adbin, ad.adrelid) AS default_expr
         FROM pg_attribute a
         LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
         WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped
         ORDER BY a.attnum`,
        [`"${table}"`],
      )
    ).rows;

    const constraints = (
      await db.query(
        `SELECT conname AS name, pg_get_constraintdef(oid) AS def, contype AS type
         FROM pg_constraint WHERE conrelid = $1::regclass ORDER BY contype`,
        [`"${table}"`],
      )
    ).rows;
    const constraintNames = new Set(constraints.map((c) => c.name));

    const indexes = (
      await db.query(
        `SELECT indexname AS name, indexdef AS def FROM pg_indexes
         WHERE schemaname = 'public' AND tablename = $1 ORDER BY indexname`,
        [table],
      )
    ).rows.filter((i) => !constraintNames.has(i.name)); // exclude indexes a constraint already creates

    const colDefs = cols.map((c) => {
      const def = c.default_expr ? ` DEFAULT ${c.default_expr}` : "";
      const notNull = c.not_null ? " NOT NULL" : "";
      return `"${c.name}" ${c.type}${notNull}${def}`;
    });

    // A column whose default is `nextval('"Seq"'::regclass)` (Prisma's
    // `@default(autoincrement())`, e.g. Airport.id) depends on a real
    // sequence object that a plain `DROP TABLE ... CASCADE` ALSO drops —
    // proven live: dropping Airport this way removes Airport_id_seq too,
    // and Postgres additionally strips the column's own DEFAULT clause
    // when the sequence it references is dropped. Recreating the table
    // from `createTable` alone would then fail (`relation "Airport_id_seq"
    // does not exist`), and even if it somehow existed, the column would
    // silently lose its auto-increment default. Capturing each such
    // sequence's real parameters (not assumed 1/1/unbounded defaults) lets
    // repair recreate the sequence AND reattach both the DEFAULT and
    // ownership before the table's own constraints are added.
    const sequences = [];
    for (const c of cols) {
      const seqMatch = typeof c.default_expr === "string" && c.default_expr.match(/nextval\('"?([^'"]+)"?'::regclass\)/);
      if (!seqMatch) continue;
      const seqName = seqMatch[1];
      const [seqRow] = (
        await db.query(
          `SELECT start_value, increment_by, min_value, max_value, cache_size, cycle, data_type
           FROM pg_sequences WHERE schemaname = 'public' AND sequencename = $1`,
          [seqName],
        )
      ).rows;
      if (!seqRow) continue; // defensive: default references a sequence that isn't (or is no longer) in pg_sequences
      sequences.push({
        column: c.name,
        name: seqName,
        createSequence:
          `CREATE SEQUENCE IF NOT EXISTS "${seqName}" AS ${seqRow.data_type} START WITH ${seqRow.start_value} ` +
          `INCREMENT BY ${seqRow.increment_by} MINVALUE ${seqRow.min_value} MAXVALUE ${seqRow.max_value} ` +
          `CACHE ${seqRow.cache_size}${seqRow.cycle ? " CYCLE" : " NO CYCLE"};`,
        setDefault: `ALTER TABLE "${table}" ALTER COLUMN "${c.name}" SET DEFAULT nextval('"${seqName}"'::regclass);`,
        setOwnership: `ALTER SEQUENCE "${seqName}" OWNED BY "${table}"."${c.name}";`,
      });
    }

    shape[table] = {
      columns: cols.map((c) => ({ name: c.name, type: c.type, notNull: c.not_null })),
      createTable: `CREATE TABLE IF NOT EXISTS "${table}" (\n  ${colDefs.join(",\n  ")}\n)`,
      // Applied in this order during repair: sequences first (a column's
      // own DEFAULT, embedded in createTable, references them by name),
      // then the table itself, then primary key (other constraints/indexes
      // may depend on it), then unique, then indexes (plain, non-
      // constraint-backed), then foreign keys last (they reference other
      // tables' primary/unique keys, which must exist by then), then
      // sequence ownership (needs both the sequence and the table's column
      // to already exist) — see schema-guard.ts's repair phases.
      sequences,
      primaryKey: constraints.find((c) => c.type === "p") ? toAddConstraint(table, constraints.find((c) => c.type === "p")) : null,
      uniqueConstraints: constraints.filter((c) => c.type === "u").map((c) => toAddConstraint(table, c)),
      indexes: indexes.map((i) => i.def + ";"),
      foreignKeys: constraints.filter((c) => c.type === "f").map((c) => toAddConstraint(table, c)),
    };
  }
  await db.close();
  return { shape, allTables };
}

function toAddConstraint(table, c) {
  return { name: c.name, sql: `ALTER TABLE "${table}" ADD CONSTRAINT "${c.name}" ${c.def};` };
}

function render({ shape, allTables }) {
  const lines = [
    "// GENERATED FILE — do not edit by hand. Run `npm run bundle:schema-shape`.",
    "// Source: the real 54 migrations (prisma/migrations), introspected via PostgreSQL's own",
    "// catalog after applying them to a disposable engine. See scripts/generate-schema-shape.mjs.",
    "export interface AddConstraint {",
    "  name: string;",
    "  sql: string;",
    "}",
    "export interface ColumnShape {",
    "  name: string;",
    "  type: string;",
    "  notNull: boolean;",
    "}",
    "export interface SequenceShape {",
    "  column: string;",
    "  name: string;",
    "  createSequence: string;",
    "  setDefault: string;",
    "  setOwnership: string;",
    "}",
    "export interface TableShape {",
    "  columns: ColumnShape[];",
    "  createTable: string;",
    "  sequences: SequenceShape[];",
    "  primaryKey: AddConstraint | null;",
    "  uniqueConstraints: AddConstraint[];",
    "  indexes: string[];",
    "  foreignKeys: AddConstraint[];",
    "}",
    "",
    `export const SCHEMA_SHAPE: Readonly<Record<string, TableShape>> = ${JSON.stringify(shape, null, 2)} as const;`,
    "",
    "// Every table the full 54-migration Compass Tools CRM schema creates —",
    "// a strict superset of Object.keys(SCHEMA_SHAPE) (REQUIRED_TABLES). Used",
    "// by schema-guard.ts only to recognize a legitimate CRM table the website",
    "// itself never queries (e.g. Booking, Quote) as NOT foreign/unexpected —",
    "// never to gate readiness or trigger repair outside REQUIRED_TABLES.",
    `export const ALL_SCHEMA_TABLES: readonly string[] = ${JSON.stringify(allTables, null, 2)} as const;`,
    "",
  ];
  return lines.join("\n");
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const built = await buildShape();
  fs.writeFileSync(outFile, render(built), "utf8");
  console.log(`Wrote ${path.relative(root, outFile)} (${Object.keys(built.shape).length} required tables, ${built.allTables.length} total CRM tables)`);
}

export { buildShape, render };
