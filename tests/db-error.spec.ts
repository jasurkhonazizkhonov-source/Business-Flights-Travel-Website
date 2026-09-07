import { test, expect } from "@playwright/test";
// Imported directly from Prisma's own runtime package rather than through
// src/generated/prisma/client's barrel: that barrel re-exports these same
// classes (see internal/prismaNamespace.ts - `runtime.PrismaClientKnownRequestError`
// et al., from this exact package) but also pulls in ESM-only generated
// code that Playwright's CJS-based test transform can't load directly.
// Constructing errors via this import still produces the identical class
// instances db-error.ts's `instanceof` checks match against at runtime.
import {
  PrismaClientInitializationError,
  PrismaClientKnownRequestError,
  PrismaClientValidationError,
} from "@prisma/client/runtime/client";
import { describeDbError } from "../src/lib/db-error";

// Regression coverage for the sanitized database-error categorization used
// by all three server actions' catch blocks (submit-flight-request.ts,
// submit-contact-message.ts, subscribe-newsletter.ts). This is what makes
// a failure's actual category (missing config vs. connection vs. schema/
// constraint vs. CRM-not-bootstrapped vs. application bug) scannable in
// Vercel's runtime logs without a human re-deriving it from a raw stack
// trace every time. None of these cases should ever surface the categorized
// string to a browser — see tests/anti-spam.spec.ts and the friendlyError()
// helpers in each server action for that boundary; this only covers the
// categorization itself.

test.describe("describeDbError", () => {
  test("missing DATABASE_URL is categorized as a config issue", () => {
    const err = new Error("DATABASE_URL is not set. Add it to .env (server-side only, never NEXT_PUBLIC_*).");
    expect(describeDbError(err)).toBe("config: DATABASE_URL missing in this runtime");
  });

  test("un-bootstrapped CRM database (no Company row) is categorized as a data issue", () => {
    const err = new Error(
      "No Company row found in the connected database. The CRM database must be bootstrapped (see compass-tools/prisma/bootstrap-company.ts) before website submissions can be stored.",
    );
    expect(describeDbError(err)).toBe("data: CRM database has no Company row (not bootstrapped)");
  });

  test("PrismaClientInitializationError (connection/engine failure) is categorized and never contains a connection string", () => {
    const err = new PrismaClientInitializationError(
      "Can't reach database server at `some-host:5432`",
      "7.10.0",
      "P1001",
    );
    const description = describeDbError(err);
    expect(description).toContain("PrismaClientInitializationError");
    expect(description).toContain("P1001");
    // The categorization is a fixed, generic sentence keyed only off the
    // error code - it must never echo the underlying message (which is
    // where a host/credential could leak from).
    expect(description).not.toContain("some-host");
  });

  test("PrismaClientKnownRequestError is categorized by its Prisma error code", () => {
    const err = new PrismaClientKnownRequestError("Unique constraint failed on the fields: (`email`)", {
      code: "P2002",
      clientVersion: "7.10.0",
    });
    expect(describeDbError(err)).toBe("PrismaClientKnownRequestError P2002: unique constraint violation");
  });

  test("P2021 (table does not exist) is categorized as a schema/wrong-database issue, not connectivity — regression guard for the confirmed 2026-09-07 production incident", () => {
    const err = new PrismaClientKnownRequestError("The table `public.Company` does not exist in the current database.", {
      code: "P2021",
      clientVersion: "7.10.0",
      meta: { table: "public.Company" },
    });
    const description = describeDbError(err);
    expect(description).toContain("P2021");
    expect(description).toContain("schema not applied");
    // Must never echo the raw Prisma message here (meta can carry a table
    // name, which is safe, but the categorization itself is a fixed
    // sentence keyed only off the code, consistent with every other case).
    expect(description).not.toContain("public.Company");
  });

  test("PrismaClientValidationError is flagged as an application bug, not a connectivity issue", () => {
    const err = new PrismaClientValidationError("Unknown argument `bogusField`.", { clientVersion: "7.10.0" });
    expect(describeDbError(err)).toContain("application bug, not a connectivity issue");
  });

  test("an unrecognized thrown value still produces a safe, non-throwing description", () => {
    expect(describeDbError("a plain string was thrown")).toBe("unknown non-Error value thrown");
    expect(describeDbError(null)).toBe("unknown non-Error value thrown");
    expect(describeDbError(undefined)).toBe("unknown non-Error value thrown");
  });

  test("a generic Error's message is truncated to a bounded length", () => {
    const longMessage = "x".repeat(500);
    const description = describeDbError(new Error(longMessage));
    expect(description.length).toBeLessThan(250);
  });
});
