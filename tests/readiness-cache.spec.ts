import { test, expect } from "@playwright/test";
import { createReadinessCache, isMissingSchemaObjectError } from "../src/lib/readiness-cache";
import { MIGRATION_BUNDLE } from "../src/lib/migration-bundle.generated";
import { ensureSchema, type SqlRunner } from "../src/lib/schema-guard";
import { describeDatabaseTarget } from "../src/lib/db-error";

test.describe("readiness cache (fake clock)", () => {
  test("a healthy result is reused inside the window, re-verified after it, and concurrent callers share ONE verification", async () => {
    let t = 0;
    let calls = 0;
    const cache = createReadinessCache({ ttlMs: 1000, now: () => t, verify: async () => void calls++ });
    await Promise.all([cache.ensure(), cache.ensure(), cache.ensure()]);
    expect(calls).toBe(1); // stampede-safe
    t = 999;
    await cache.ensure();
    expect(calls).toBe(1);
    t = 1000;
    await cache.ensure();
    expect(calls).toBe(2); // window expired -> database consulted again
  });

  test("a failure is never memoized, and invalidate() forces an immediate re-check", async () => {
    let calls = 0;
    let fail = true;
    const cache = createReadinessCache({
      ttlMs: 60_000,
      verify: async () => {
        calls++;
        if (fail) throw new Error("boom");
      },
    });
    await expect(cache.ensure()).rejects.toThrow("boom");
    fail = false;
    await cache.ensure();
    expect(calls).toBe(2);
    await cache.ensure();
    expect(calls).toBe(2);
    cache.invalidate();
    await cache.ensure();
    expect(calls).toBe(3);
  });

  test("a table dropped on a WARM instance is noticed after the window (or immediately on invalidate) — the cache cannot hide it forever", async () => {
    const { PGlite } = (await import("@electric-sql/pglite")) as unknown as {
      PGlite: new () => { query: (s: string, p?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>; exec: (s: string) => Promise<unknown>; close: () => Promise<void> };
    };
    const raw = new PGlite();
    const runner: SqlRunner = { query: async (s, p) => (await raw.query(s, p)).rows, exec: async (s) => void (await raw.exec(s)) };
    await ensureSchema({ db: runner, bundle: MIGRATION_BUNDLE, autoInit: true });

    let t = 0;
    const cache = createReadinessCache({ ttlMs: 5000, now: () => t, verify: async () => void (await ensureSchema({ db: runner, bundle: MIGRATION_BUNDLE, autoInit: false })) });
    await cache.ensure();
    await raw.exec(`DROP TABLE "Subscriber" CASCADE`);
    t = 4000;
    await cache.ensure(); // still inside the (bounded) window
    t = 5000;
    await expect(cache.ensure()).rejects.toMatchObject({ reason: "repair_not_permitted" }); // noticed; nothing modified without the opt-in
    t = 5001;
    cache.invalidate();
    await expect(cache.ensure()).rejects.toMatchObject({ reason: "repair_not_permitted" });
    await raw.close();
  });

  test("isMissingSchemaObjectError recognizes Prisma and Postgres missing-relation/column codes only", () => {
    expect(isMissingSchemaObjectError({ code: "P2021" })).toBe(true);
    expect(isMissingSchemaObjectError({ code: "P2022" })).toBe(true);
    expect(isMissingSchemaObjectError({ code: "42P01" })).toBe(true);
    expect(isMissingSchemaObjectError({ meta: { driverAdapterError: { cause: { originalCode: "42P01" } } } })).toBe(true);
    expect(isMissingSchemaObjectError({ code: "P2002" })).toBe(false);
    expect(isMissingSchemaObjectError(new Error("x"))).toBe(false);
    expect(isMissingSchemaObjectError(null)).toBe(false);
  });
});

test.describe("database target diagnostics are credential-safe and distinguish environments", () => {
  test("two different Aiven targets are distinguishable by host/port/dbname, with no user or password in the output", () => {
    const prev = process.env.DATABASE_URL;
    try {
      process.env.DATABASE_URL = "postgres://avnuser:s3cr3tPass@pg-local-example.e.aivencloud.com:11111/localdb?sslmode=require";
      const local = describeDatabaseTarget();
      process.env.DATABASE_URL = "postgres://avnuser:an0therPass@pg-prod-example.e.aivencloud.com:22222/proddb?sslmode=require";
      const prod = describeDatabaseTarget();
      expect(local).toBe("pg-local-example.e.aivencloud.com:11111/localdb");
      expect(prod).toBe("pg-prod-example.e.aivencloud.com:22222/proddb");
      for (const text of [local, prod]) {
        expect(text).not.toMatch(/avnuser|s3cr3tPass|an0therPass|postgres:\/\//i);
      }
    } finally {
      if (prev === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = prev;
    }
  });
});
