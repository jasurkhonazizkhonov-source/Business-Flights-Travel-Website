import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";

// Runs scripts/verify-runtime-role-pg.ts against a REAL PostgreSQL server (not PGlite): the least-privilege role, the website's real
// Prisma code over TCP, concurrent idempotent submissions and lead-queue claims. Skipped unless INTEGRATION_ADMIN_DATABASE_URL points at a
// DISPOSABLE server on a loopback address (the script refuses anything else), e.g.
//   INTEGRATION_ADMIN_DATABASE_URL=postgresql://postgres@127.0.0.1:54331/postgres npx playwright test tests/runtime-role-pg-e2e.spec.ts
// Start such a server with embedded-postgres or Docker (docs/DEPLOYMENT_VPS.md, "Testing against real PostgreSQL"). Without it this test
// is reported as skipped, never as passed.
test.setTimeout(300_000);
const adminUrl = process.env.INTEGRATION_ADMIN_DATABASE_URL;

test("[real PostgreSQL] the website role runs every write path, concurrent submissions and queue claims, and is refused everything else", async () => {
  test.skip(!adminUrl, "INTEGRATION_ADMIN_DATABASE_URL is not set (needs a disposable local PostgreSQL server)");
  const root = path.resolve(__dirname, "..");
  const out = execFileSync(process.execPath, [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), "scripts/verify-runtime-role-pg.ts"], {
    cwd: root,
    encoding: "utf8",
    timeout: 280_000,
    // `server-only` only loads under the react-server condition; the child that tsx starts inherits it from NODE_OPTIONS.
    env: { ...process.env, NODE_OPTIONS: "--conditions=react-server --no-deprecation" },
  });
  const result = JSON.parse(out);
  expect(result.ok).toBe(true);
  console.log(`real PostgreSQL ${result.server} (major ${result.serverMajor}): ${result.checks.length} checks passed`);
  expect(result.concurrentIdempotentLead).toMatchObject({ created: 1, duplicates: 19, rejected: 0, leadRows: 1 });
  expect(result.concurrentQueueClaims).toMatchObject({ assignedResults: 12, leadsAssignedCountTotal: 12, notifications: 12 });
  expect(result.sameLeadRace.assigned).toBe(1);
  expect(result.allLockedRows.leadUnassigned).toBe(true);
  expect(result.refusedCount).toBeGreaterThanOrEqual(30);
});
