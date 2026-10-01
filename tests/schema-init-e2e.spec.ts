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
//
// It also drives the REAL, unmodified sendFlightRequestNotification against
// data read back from the Lead/Contact rows it just persisted — a genuine
// integration test of the Server Action's full "persist, then notify" shape
// (only the SMTP transport itself is faked, as it must be for an automated,
// credential-free test), not merely the isolated template-building/mailer-
// wiring unit tests in tests/flight-request-notification.spec.ts.
test.setTimeout(300_000);

test("schema built from empty by the initializer accepts the website's real Prisma writes (all three flows), and the real notification function sends against genuinely-persisted data", () => {
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
  // The real sendFlightRequestNotification, called with data read back from
  // the Lead/Contact it just persisted (not hand-typed fixture values),
  // reported success and sent exactly one email to the configured recipient.
  expect(result.notification).toMatchObject({ sent: true, recipient: "ops+e2e@businessflights.travel" });
  expect(typeof result.notification.messageId).toBe("string");
  // Failure isolation, proven behaviorally: a persistence failure (invalid
  // foreign key) never reaches the notification call, and a notification
  // failure never affects already-persisted data.
  expect(result.notificationNotAttemptedOnDbFailure).toBe(true);
  expect(result.dataPreservedOnEmailFailure).toBe(true);
});
