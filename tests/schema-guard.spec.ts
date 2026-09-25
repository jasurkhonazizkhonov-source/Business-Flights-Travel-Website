import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { MIGRATION_BUNDLE } from "../src/lib/migration-bundle.generated";
import {
  BASELINE_COMPANY,
  REQUIRED_TABLES,
  SchemaNotReadyError,
  ensureSchema,
  inspectSchema,
  migrationChecksum,
  type SqlRunner,
} from "../src/lib/schema-guard";
import { describeDbError } from "../src/lib/db-error";

// These tests run the schema guard against a REAL PostgreSQL engine
// (PGlite: actual Postgres 17 compiled to WASM, in-process, disposable) with
// the REAL 54-migration CRM history — not mocks. That is what makes
// "empty database -> full CRM schema" claims here verifiable in a sandbox with
// no Docker and no reachable external database.
//
// Concurrency note: PGlite is a single session, and Postgres advisory locks are
// re-entrant within one session, so two callers sharing one PGlite would not
// actually exclude each other. The concurrency test therefore gives each caller
// its own runner that emulates cross-session lock semantics with an in-memory
// mutex on the same advisory-lock statements — it exercises the guard's real
// logic (lock, then RE-INSPECT under the lock) but the lock primitive itself
// is emulated, and that is stated here rather than implied otherwise.

test.setTimeout(180_000);

type PGliteInstance = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>; exec: (sql: string) => Promise<unknown>; close: () => Promise<void> };
let PGliteCtor: new () => PGliteInstance;

test.beforeAll(async () => {
  ({ PGlite: PGliteCtor } = (await import("@electric-sql/pglite")) as unknown as { PGlite: new () => PGliteInstance });
});

const opened: PGliteInstance[] = [];
async function newDb(): Promise<{ raw: PGliteInstance; runner: SqlRunner }> {
  const raw = new PGliteCtor();
  opened.push(raw);
  return { raw, runner: toRunner(raw) };
}
function toRunner(raw: PGliteInstance): SqlRunner {
  return {
    query: async (sql, params) => (await raw.query(sql, params)).rows,
    exec: async (sql) => {
      await raw.exec(sql);
    },
  };
}
test.afterAll(async () => {
  await Promise.all(opened.map((d) => d.close().catch(() => undefined)));
});

async function snapshot(runner: SqlRunner) {
  const tables = (await runner.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1`)).map((r) => r.table_name);
  return JSON.stringify(tables);
}
async function count(runner: SqlRunner, table: string): Promise<number> {
  return Number((await runner.query(`SELECT count(*)::int AS n FROM "${table}"`))[0].n);
}

test.describe("bundled migration history", () => {
  test("generated bundle is in sync with prisma/migrations (regenerate with `npm run bundle:migrations` if this fails)", async () => {
    const { buildBundleSource } = await import("../scripts/generate-migration-bundle.mjs");
    const onDisk = fs.readFileSync(path.resolve(__dirname, "../src/lib/migration-bundle.generated.ts"), "utf8").replace(/\r\n/g, "\n");
    expect(onDisk).toBe(buildBundleSource());
    expect(MIGRATION_BUNDLE.length).toBeGreaterThanOrEqual(54);
  });

  test("checksum is the sha256 hex of the migration text (the format Prisma's _prisma_migrations expects)", () => {
    expect(migrationChecksum("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

test.describe("ensureSchema() against a real PostgreSQL engine", () => {
  test("EMPTY database + DATABASE_AUTO_INIT=true: full CRM schema is created, exactly one Business Flights Travel Company, and a website write then succeeds", async () => {
    const { runner } = await newDb();
    expect((await inspectSchema(runner, MIGRATION_BUNDLE)).kind).toBe("empty");

    const result = await ensureSchema({ db: runner, bundle: MIGRATION_BUNDLE, autoInit: true });
    expect(result.kind).toBe("healthy");
    expect(result.initialized).toBe(true);
    expect(result.appliedMigrations).toHaveLength(MIGRATION_BUNDLE.length);
    // The real migration history (20260819070000_company_multitenancy) itself inserts the single
    // default-company row, so the guard's explicit baseline seed is a no-op backstop here.
    expect(result.companySeeded).toBe(false);

    // every required table exists, with real constraints (FKs + unique index on Subscriber)
    const after = await inspectSchema(runner, MIGRATION_BUNDLE);
    expect(after.kind).toBe("healthy");
    expect(after.missing).toEqual([]);
    expect(after.pending).toEqual([]);
    for (const t of REQUIRED_TABLES) expect(await count(runner, t)).toBeGreaterThanOrEqual(0);
    const fks = await runner.query(`SELECT count(*)::int AS n FROM information_schema.table_constraints WHERE constraint_type='FOREIGN KEY' AND table_schema='public'`);
    expect(Number(fks[0].n)).toBeGreaterThan(10);

    // exactly one Company, with the established single-company identity
    expect(await count(runner, "Company")).toBe(1);
    const [company] = await runner.query(`SELECT id, name FROM "Company"`);
    expect(company).toEqual({ id: BASELINE_COMPANY.id, name: "Business Flights Travel" });

    // Prisma-format tracking rows, so a later `prisma migrate deploy` sees a normal database
    const tracked = await runner.query(`SELECT migration_name, checksum, finished_at FROM "_prisma_migrations" ORDER BY migration_name`);
    expect(tracked).toHaveLength(MIGRATION_BUNDLE.length);
    expect(tracked.every((r) => r.finished_at !== null && String(r.checksum).length === 64)).toBe(true);

    // the ORIGINAL write now succeeds with no resubmission: the same steps the newsletter action performs
    const [{ id: companyId }] = await runner.query(`SELECT id FROM "Company" LIMIT 1`);
    await runner.query(
      `INSERT INTO "Subscriber" ("id","companyId","email","status","source","unsubscribeToken","updatedAt") VALUES ('sub1',$1,'guard-test@example.com','SUBSCRIBED','website','tok1',now())`,
      [companyId],
    );
    expect(await count(runner, "Subscriber")).toBe(1);
    // duplicate protection still comes from the schema's own unique (companyId, email)
    await expect(
      runner.query(`INSERT INTO "Subscriber" ("id","companyId","email","status","unsubscribeToken","updatedAt") VALUES ('sub2',$1,'guard-test@example.com','SUBSCRIBED','tok2',now())`, [companyId]),
    ).rejects.toThrow();
  });

  test("EMPTY database WITHOUT the opt-in: refused, and NOTHING is created (a wrong DATABASE_URL cannot silently become an orphan CRM)", async () => {
    const { runner } = await newDb();
    const before = await snapshot(runner);
    await expect(ensureSchema({ db: runner, bundle: MIGRATION_BUNDLE, autoInit: false })).rejects.toMatchObject({
      name: "SchemaNotReadyError",
      reason: "empty_init_not_permitted",
    });
    expect(await snapshot(runner)).toBe(before);
    expect(before).toBe("[]");
  });

  test("repeat initialization is a no-op: no duplicate Company, no re-applied migrations, no errors", async () => {
    const { runner } = await newDb();
    await ensureSchema({ db: runner, bundle: MIGRATION_BUNDLE, autoInit: true });
    const second = await ensureSchema({ db: runner, bundle: MIGRATION_BUNDLE, autoInit: true });
    expect(second).toMatchObject({ kind: "healthy", initialized: false, appliedMigrations: [], companySeeded: false });
    expect(await count(runner, "Company")).toBe(1);
    expect(await count(runner, "_prisma_migrations")).toBe(MIGRATION_BUNDLE.length);
  });

  test("EXISTING healthy database (opt-in NOT set): nothing is created, altered or seeded", async () => {
    const { runner } = await newDb();
    await ensureSchema({ db: runner, bundle: MIGRATION_BUNDLE, autoInit: true });
    // pre-existing "real" data, and a company that is NOT the baseline id
    await runner.query(`UPDATE "Company" SET name = 'Existing Real Company', id = id`);
    const tablesBefore = await snapshot(runner);
    const result = await ensureSchema({ db: runner, bundle: MIGRATION_BUNDLE, autoInit: false });
    expect(result).toMatchObject({ kind: "healthy", initialized: false, appliedMigrations: [], companySeeded: false });
    expect(await snapshot(runner)).toBe(tablesBefore);
    expect((await runner.query(`SELECT name FROM "Company"`))[0].name).toBe("Existing Real Company");
    expect(await count(runner, "Company")).toBe(1);
  });

  test("opt-in never adds a SECOND company to a database that already has one under a different id", async () => {
    const { runner } = await newDb();
    await ensureSchema({ db: runner, bundle: MIGRATION_BUNDLE, autoInit: true });
    await runner.query(`UPDATE "Company" SET id = 'some-other-id'`);
    const result = await ensureSchema({ db: runner, bundle: MIGRATION_BUNDLE, autoInit: true });
    expect(result.companySeeded).toBe(false);
    expect(await count(runner, "Company")).toBe(1);
  });

  test("a missing required table is detected as PARTIAL and refused — even with the opt-in — and the database is not touched", async () => {
    const { runner } = await newDb();
    await ensureSchema({ db: runner, bundle: MIGRATION_BUNDLE, autoInit: true });
    await runner.exec(`DROP TABLE "Notification" CASCADE`);
    const insp = await inspectSchema(runner, MIGRATION_BUNDLE);
    expect(insp).toMatchObject({ kind: "partial", missing: ["Notification"] });
    const before = await snapshot(runner);
    await expect(ensureSchema({ db: runner, bundle: MIGRATION_BUNDLE, autoInit: true })).rejects.toMatchObject({ reason: "partial_schema" });
    expect(await snapshot(runner)).toBe(before);
    expect(await count(runner, "Company")).toBe(1);
  });

  test("UNRELATED database (another application's tables): refused even with the opt-in; its tables are untouched and no CRM tables appear", async () => {
    const { runner } = await newDb();
    await runner.exec(`CREATE TABLE other_app_orders (id serial primary key, total int); INSERT INTO other_app_orders (total) VALUES (42);`);
    const before = await snapshot(runner);
    expect((await inspectSchema(runner, MIGRATION_BUNDLE)).kind).toBe("unrelated");
    await expect(ensureSchema({ db: runner, bundle: MIGRATION_BUNDLE, autoInit: true })).rejects.toMatchObject({ reason: "unrelated_database" });
    expect(await snapshot(runner)).toBe(before);
    expect(await count(runner, "other_app_orders")).toBe(1);
  });

  test("PENDING migration: reported (not applied) without the opt-in; with it, ONLY the missing migration is applied via the real history", async () => {
    const { runner } = await newDb();
    const older = MIGRATION_BUNDLE.slice(0, -1);
    const last = MIGRATION_BUNDLE[MIGRATION_BUNDLE.length - 1];
    await ensureSchema({ db: runner, bundle: older, autoInit: true }); // database "from before" the last migration existed

    const noOptIn = await ensureSchema({ db: runner, bundle: MIGRATION_BUNDLE, autoInit: false });
    expect(noOptIn.pendingNotApplied).toEqual([last.name]);
    expect(await count(runner, "_prisma_migrations")).toBe(older.length);

    const withOptIn = await ensureSchema({ db: runner, bundle: MIGRATION_BUNDLE, autoInit: true });
    expect(withOptIn.appliedMigrations).toEqual([last.name]);
    expect(await count(runner, "_prisma_migrations")).toBe(MIGRATION_BUNDLE.length);
    expect(await count(runner, "Company")).toBe(1);
  });

  test("a failing migration stops safely: earlier work stays recorded, the DB is then classed PARTIAL and refused — never blindly replayed", async () => {
    const { runner } = await newDb();
    const bad = [
      { name: "001_company", sql: `CREATE TABLE "Company" (id text primary key, name text, website text, phone text, "brandColor" text, "signatureTemplate" text, "updatedAt" timestamp)` },
      { name: "002_broken", sql: `SELECT * FROM table_that_does_not_exist` },
    ];
    await expect(ensureSchema({ db: runner, bundle: bad, autoInit: true })).rejects.toMatchObject({ reason: "init_failed" });
    expect(await count(runner, "_prisma_migrations")).toBe(1);
    await expect(ensureSchema({ db: runner, bundle: bad, autoInit: true })).rejects.toMatchObject({ reason: "partial_schema" });
  });

  test("CONCURRENT initialization of a brand-new database: one caller initializes, the other finds it done — one Company, one full migration set, no errors", async () => {
    const { raw } = await newDb();
    // Emulated cross-session advisory lock (see file header).
    let held = false;
    const waiters: Array<() => void> = [];
    const makeRunner = (): SqlRunner => {
      const base = toRunner(raw);
      return {
        exec: base.exec,
        query: async (sql, params) => {
          if (sql.startsWith("SELECT pg_advisory_lock")) {
            while (held) await new Promise<void>((r) => waiters.push(r));
            held = true;
            return [];
          }
          if (sql.startsWith("SELECT pg_advisory_unlock")) {
            held = false;
            waiters.splice(0).forEach((r) => r());
            return [];
          }
          return base.query(sql, params);
        },
      };
    };
    const [a, b] = await Promise.all([
      ensureSchema({ db: makeRunner(), bundle: MIGRATION_BUNDLE, autoInit: true }),
      ensureSchema({ db: makeRunner(), bundle: MIGRATION_BUNDLE, autoInit: true }),
    ]);
    expect([a.initialized, b.initialized].filter(Boolean)).toHaveLength(1);
    const runner = toRunner(raw);
    expect(await count(runner, "Company")).toBe(1);
    expect(await count(runner, "_prisma_migrations")).toBe(MIGRATION_BUNDLE.length);
    expect((await inspectSchema(runner, MIGRATION_BUNDLE)).kind).toBe("healthy");
  });
});

test.describe("error safety", () => {
  test("refusal messages and their diagnostics never contain a connection string or credentials", async () => {
    const { runner } = await newDb();
    const cases: Array<() => Promise<unknown>> = [
      () => ensureSchema({ db: runner, bundle: MIGRATION_BUNDLE, autoInit: false }),
    ];
    for (const run of cases) {
      const err = await run().then(
        () => null,
        (e) => e,
      );
      expect(err).toBeInstanceOf(SchemaNotReadyError);
      const text = `${(err as Error).message} ${describeDbError(err)}`;
      expect(text).not.toMatch(/postgres(ql)?:\/\//i);
      expect(text).not.toMatch(/password|passwd|secret/i);
      expect(describeDbError(err)).toContain("schema-guard");
    }
  });
});
