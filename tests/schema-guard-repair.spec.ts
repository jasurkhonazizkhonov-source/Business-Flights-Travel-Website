import { test, expect } from "@playwright/test";
import { MIGRATION_BUNDLE } from "../src/lib/migration-bundle.generated";
import { REQUIRED_TABLES, ensureSchema, inspectSchema, type SqlRunner } from "../src/lib/schema-guard";

// Second half of the schema-guard suite (see schema-guard.spec.ts for the
// setup notes): sequence-backed tables, transactional/atomic repair,
// idempotency, foreign-key repair and data preservation. Real PostgreSQL 17
// (PGlite) with the real 54-migration history — not mocks.

test.setTimeout(180_000);

type PGliteInstance = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>; exec: (sql: string) => Promise<unknown>; close: () => Promise<void> };
let PGliteCtor: new () => PGliteInstance;
test.beforeAll(async () => {
  ({ PGlite: PGliteCtor } = (await import("@electric-sql/pglite")) as unknown as { PGlite: new () => PGliteInstance });
});

const opened: PGliteInstance[] = [];
async function healthyDb(): Promise<SqlRunner> {
  const raw = new PGliteCtor();
  opened.push(raw);
  const runner: SqlRunner = {
    query: async (sql, params) => (await raw.query(sql, params)).rows,
    exec: async (sql) => {
      await raw.exec(sql);
    },
  };
  await ensureSchema({ db: runner, bundle: MIGRATION_BUNDLE, autoInit: true });
  return runner;
}
// Closed after each test, not at the end — see the measurement note in
// tests/schema-guard.spec.ts (an open PGlite instance is ~150-200 MB).
test.afterEach(async () => {
  await Promise.all(opened.splice(0).map((d) => d.close().catch(() => undefined)));
});
async function count(runner: SqlRunner, table: string): Promise<number> {
  return Number((await runner.query(`SELECT count(*)::int AS n FROM "${table}"`))[0].n);
}

test.describe("sequences, transactional repair, idempotency", () => {
  test("a dropped SEQUENCE-backed table (Airport) is recreated with a working auto-increment id — its owned sequence is dropped with it and must be recreated first", async () => {
    const runner = await healthyDb();
    expect((await runner.query(`SELECT count(*)::int AS n FROM pg_sequences WHERE sequencename = 'Airport_id_seq'`))[0].n).toBe(1);
    await runner.exec(`DROP TABLE "Airport" CASCADE`);
    expect((await runner.query(`SELECT count(*)::int AS n FROM pg_sequences WHERE sequencename = 'Airport_id_seq'`))[0].n).toBe(0);

    const result = await ensureSchema({ db: runner, bundle: MIGRATION_BUNDLE, autoInit: true });
    expect(result).toMatchObject({ kind: "healthy", repaired: true, tablesRepaired: ["Airport"] });
    // the insert shape the flight-request action's upsert relies on (no id supplied)
    await runner.query(`INSERT INTO "Airport" (iata, name, city, country) VALUES ('JFK','JFK Intl','New York','United States')`);
    await runner.query(`INSERT INTO "Airport" (iata, name, city, country) VALUES ('LHR','Heathrow','London','United Kingdom')`);
    expect((await runner.query(`SELECT id FROM "Airport" ORDER BY id`)).map((r) => r.id)).toEqual([1, 2]);
    // ownership restored, so a future DROP TABLE behaves like the original schema
    const owned = await runner.query(
      `SELECT count(*)::int AS n FROM pg_depend d JOIN pg_class s ON s.oid = d.objid WHERE s.relname = 'Airport_id_seq' AND d.deptype = 'a'`,
    );
    expect(owned[0].n).toBe(1);
  });

  test("only the SEQUENCE dropped on an intact table: sequence + column DEFAULT are restored, existing rows untouched", async () => {
    const runner = await healthyDb();
    await runner.query(`INSERT INTO "Airport" (iata, name, city, country) VALUES ('JFK','JFK Intl','New York','United States')`);
    await runner.exec(`DROP SEQUENCE "Airport_id_seq" CASCADE`);
    const insp = await inspectSchema(runner, MIGRATION_BUNDLE);
    expect(insp.kind).toBe("needs_repair");
    expect(insp.diagnoses.find((d) => d.table === "Airport")?.missingSequences).toEqual(["Airport_id_seq"]);

    const result = await ensureSchema({ db: runner, bundle: MIGRATION_BUNDLE, autoInit: true });
    expect(result).toMatchObject({ kind: "healthy", repaired: true, tablesRepaired: [] });
    expect(await count(runner, "Airport")).toBe(1); // data preserved
    await runner.query(`INSERT INTO "Airport" (id, iata, name, city, country) VALUES (50,'LHR','Heathrow','London','United Kingdom')`);
    await runner.query(`INSERT INTO "Airport" (iata, name, city, country) VALUES ('CDG','CDG','Paris','France')`); // default works again
    expect(await count(runner, "Airport")).toBe(3);
  });

  test("a repair that fails HALFWAY is fully rolled back: no partially-created objects, damage unchanged, and the retry then heals everything", async () => {
    const runner = await healthyDb();
    await runner.exec(`DROP TABLE "Subscriber" CASCADE`);
    await runner.exec(`DROP TABLE "Notification" CASCADE`);
    // Fail on Notification's CREATE TABLE — AFTER Subscriber's table/PK were already created in the same repair.
    let armed = true;
    const flaky: SqlRunner = {
      query: runner.query,
      exec: async (sql) => {
        if (armed && sql.includes('CREATE TABLE IF NOT EXISTS "Notification"')) {
          armed = false;
          throw new Error("simulated failure mid-repair");
        }
        return runner.exec(sql);
      },
    };
    await expect(ensureSchema({ db: flaky, bundle: MIGRATION_BUNDLE, autoInit: true })).rejects.toMatchObject({ reason: "repair_failed" });
    const after = await inspectSchema(runner, MIGRATION_BUNDLE);
    expect(new Set(after.missingTables)).toEqual(new Set(["Subscriber", "Notification"])); // Subscriber rolled back too
    expect(after.kind).toBe("needs_repair");
    const retry = await ensureSchema({ db: runner, bundle: MIGRATION_BUNDLE, autoInit: true });
    expect(retry.kind).toBe("healthy");
    expect(new Set(retry.tablesRepaired)).toEqual(new Set(["Subscriber", "Notification"]));
  });

  test("repair is IDEMPOTENT: repeat runs change nothing and keep the same healthy state and data", async () => {
    const runner = await healthyDb();
    await runner.query(`UPDATE "Company" SET name = 'Idempotency Co'`);
    await runner.exec(`DROP TABLE "Subscriber" CASCADE`);
    const first = await ensureSchema({ db: runner, bundle: MIGRATION_BUNDLE, autoInit: true });
    expect(first.repaired).toBe(true);
    const objects = async () =>
      JSON.stringify(
        await runner.query(`SELECT c.relname, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' ORDER BY 1, 2`),
      );
    const snap1 = await objects();
    const second = await ensureSchema({ db: runner, bundle: MIGRATION_BUNDLE, autoInit: true });
    const third = await ensureSchema({ db: runner, bundle: MIGRATION_BUNDLE, autoInit: false });
    expect(second).toMatchObject({ kind: "healthy", repaired: false, initialized: false, tablesRepaired: [], objectsRepaired: 0 });
    expect(third).toMatchObject({ kind: "healthy", repaired: false });
    expect(await objects()).toBe(snap1);
    expect((await runner.query(`SELECT name FROM "Company"`))[0].name).toBe("Idempotency Co");
  });

  test("a missing FOREIGN KEY is recreated when existing rows satisfy it, and safely REFUSED (rolled back, rows untouched) when a row violates it", async () => {
    const runner = await healthyDb();
    await runner.exec(`ALTER TABLE "Subscriber" DROP CONSTRAINT "Subscriber_companyId_fkey"`);
    const ok = await ensureSchema({ db: runner, bundle: MIGRATION_BUNDLE, autoInit: true });
    expect(ok).toMatchObject({ kind: "healthy", repaired: true });

    await runner.exec(`ALTER TABLE "Subscriber" DROP CONSTRAINT "Subscriber_companyId_fkey"`);
    await runner.query(
      `INSERT INTO "Subscriber" ("id","companyId","email","status","unsubscribeToken","updatedAt") VALUES ('orphan','no-such-company','o@example.com','SUBSCRIBED','tokO',now())`,
    );
    await expect(ensureSchema({ db: runner, bundle: MIGRATION_BUNDLE, autoInit: true })).rejects.toMatchObject({ reason: "repair_failed" });
    expect(await count(runner, "Subscriber")).toBe(1); // the orphan row was never deleted or altered to satisfy the constraint
  });

  test("data preservation: repairing one missing table never changes row counts in any other table", async () => {
    const runner = await healthyDb();
    await runner.query(`INSERT INTO "Airport" (iata, name, city, country) VALUES ('JFK','JFK Intl','New York','United States')`);
    const [{ id: companyId }] = await runner.query(`SELECT id FROM "Company" LIMIT 1`);
    await runner.query(
      `INSERT INTO "Subscriber" ("id","companyId","email","status","unsubscribeToken","updatedAt") VALUES ('s1',$1,'keep@example.com','SUBSCRIBED','tk1',now())`,
      [companyId],
    );
    await runner.exec(`DROP TABLE "Notification" CASCADE`);
    const counts = async () => JSON.stringify(await Promise.all(REQUIRED_TABLES.filter((t) => t !== "Notification").map((t) => count(runner, t))));
    const before = await counts();
    await ensureSchema({ db: runner, bundle: MIGRATION_BUNDLE, autoInit: true });
    expect(await counts()).toBe(before);
    expect(await count(runner, "Notification")).toBe(0); // schema restored; lost rows are NOT recovered
  });
});
