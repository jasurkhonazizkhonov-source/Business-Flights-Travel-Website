import { test, expect } from "@playwright/test";

// Loaded via dynamic import() rather than a static import: scripts/vercel-build.mjs
// is genuine ESM (a plain Node build script, not bundled), and Playwright's
// CJS-based test transform can't `require()` an ESM module directly — the
// same boundary tests/db-error.spec.ts works around by importing Prisma's
// runtime package directly instead of the generated client barrel. Dynamic
// import() is the one interop path Node supports for loading real ESM from
// a CJS context, so it's used here instead.
let redact: (text: unknown) => string;
test.beforeAll(async () => {
  ({ redact } = await import("../scripts/vercel-build.mjs"));
});

// Regression coverage for scripts/vercel-build.mjs's credential redaction —
// this is what stands between a `prisma migrate deploy` subprocess's raw
// output (which CAN legitimately include a bare postgres:// URL, e.g. in a
// P1001 "can't reach database server" message) and this build step's own
// console output, which Vercel's build logs capture. Importing the module
// for this test does NOT run migrate deploy or `next build` — see the
// `isMain` guard at the bottom of that file, which only calls main() when
// the script is executed directly.

test.describe("vercel-build.mjs redact()", () => {
  test("strips username and password from a postgres:// URL, keeping the host/port/dbname visible", () => {
    const input = "Can't reach database server at `postgres://avnadmin:hunter2@pg-example.aivencloud.com:24692/defaultdb`";
    const output = redact(input);
    expect(output).not.toContain("avnadmin");
    expect(output).not.toContain("hunter2");
    expect(output).toContain("pg-example.aivencloud.com:24692/defaultdb");
    expect(output).toContain("[redacted]");
  });

  test("handles multiple connection strings in the same text", () => {
    const input = "postgres://a:b@host1.example.com/db1 and postgresql://c:d@host2.example.com/db2";
    const output = redact(input);
    expect(output).not.toMatch(/:b@|:d@/);
    expect(output).toContain("host1.example.com/db1");
    expect(output).toContain("host2.example.com/db2");
  });

  test("leaves text with no connection string unchanged", () => {
    const input = "No pending migrations to apply.";
    expect(redact(input)).toBe(input);
  });

  test("handles a non-string input without throwing", () => {
    expect(() => redact(null)).not.toThrow();
    expect(() => redact(undefined)).not.toThrow();
  });
});
