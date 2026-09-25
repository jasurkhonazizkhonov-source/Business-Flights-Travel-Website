import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";

// Runs scripts/verify-initialized-schema.ts in its own process (it needs the
// generated Prisma client, which is ESM-only and can't be loaded inside
// Playwright's CJS test transform — same boundary tests/db-error.spec.ts
// documents). That script initializes a disposable real-PostgreSQL engine from
// empty using src/lib/schema-guard.ts and the bundled migration history, then
// performs the website's actual Newsletter / Flight Request / Get in Touch write
// sequences through the real Prisma client. Passing proves the initialized
// schema is compatible with the Prisma models the deployed site uses.
test.setTimeout(300_000);

test("schema built from empty by the initializer accepts the website's real Prisma writes (all three flows)", () => {
  const root = path.resolve(__dirname, "..");
  const out = execFileSync(process.execPath, [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), "scripts/verify-initialized-schema.ts"], {
    cwd: root,
    encoding: "utf8",
    timeout: 280_000,
  });
  const result = JSON.parse(out.trim().split("\n").pop() as string);
  expect(result.ok).toBe(true);
  expect(result.migrationsApplied).toBeGreaterThanOrEqual(54);
  expect(result.companyId).toBe("default-company");
  expect(result.counts).toMatchObject({ company: 1, subscriber: 1, contact: 1, lead: 1, contactInquiry: 1, leadStatusHistory: 1 });
});
