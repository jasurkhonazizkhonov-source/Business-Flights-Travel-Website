import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";

// Runs scripts/verify-runtime-role.ts in its own process (it needs the generated, ESM-only Prisma client — the same boundary
// tests/schema-init-e2e.spec.ts documents). It proves, on a real PostgreSQL engine, that deploy/sql/website-runtime-role-grants.sql is
// SUFFICIENT for every website write path and does NOT allow schema changes, deletes or reads of CRM tables outside the grant list.
test.setTimeout(300_000);

test("the documented least-privilege role runs every website write path and is refused DDL, deletes and unrelated CRM tables", () => {
  const root = path.resolve(__dirname, "..");
  const out = execFileSync(process.execPath, [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), "scripts/verify-runtime-role.ts"], {
    cwd: root,
    encoding: "utf8",
    timeout: 280_000,
  });
  const result = JSON.parse(out.trim().split("\n").pop() as string);
  expect(result.ok).toBe(true);
  expect(result.role).toBe("bft_runtime_test");
  expect(result.schemaGuard).toMatch(/read-only/);
  expect(result.writePaths).toMatch(/all succeeded/);
  // Every forbidden operation was refused by the database itself.
  expect(Object.keys(result.refused).sort()).toEqual(
    [
      "alter table", "change grants", "create index", "create role", "create table", "delete lead", "delete subscriber", "drop table", "insert account",
      "read audit log", "read bookings", "read gmail connection", "read payment methods", "truncate", "update account", "write migration ledger",
    ].sort(),
  );
});
