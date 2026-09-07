import { test, expect } from "@playwright/test";
import { isSpamSubmission } from "../src/lib/anti-spam";

// Regression coverage for the bot-detection logic shared by
// submit-flight-request.ts and submit-contact-message.ts. Exercises the
// extracted, dependency-free src/lib/anti-spam.ts helper directly — no
// dev server, no browser, no replaying a build-generated Server Action id
// — per the request to test the actual server-side logic rather than
// hardcoding an action id that changes every build.
//
// The case this suite exists to catch a regression of: a previous version
// used `data.renderedAt && (too-fast check)`, which let a request that
// simply OMITTED the optional `renderedAt` field skip the timing check
// entirely (silently treated as passing). If `renderedAt` is ever made to
// "just work" as optional again, "missing renderedAt is rejected" below
// fails.

const NOW = 1_700_000_000_000;
const MIN_FILL_MS = 2500;

test.describe("isSpamSubmission", () => {
  test("legitimate submission (no honeypot, filled slower than the minimum) passes", () => {
    expect(
      isSpamSubmission({ website: "", renderedAt: NOW - MIN_FILL_MS - 1, minFillMs: MIN_FILL_MS, now: NOW }),
    ).toBe(false);
  });

  test("honeypot filled in is rejected", () => {
    expect(
      isSpamSubmission({ website: "http://spam.example", renderedAt: NOW - MIN_FILL_MS - 1, minFillMs: MIN_FILL_MS, now: NOW }),
    ).toBe(true);
  });

  test("missing renderedAt is rejected (regression guard for the fixed bug)", () => {
    expect(isSpamSubmission({ website: "", renderedAt: undefined, minFillMs: MIN_FILL_MS, now: NOW })).toBe(true);
    expect(isSpamSubmission({ website: "", renderedAt: null, minFillMs: MIN_FILL_MS, now: NOW })).toBe(true);
  });

  test("renderedAt present but submission too fast is rejected", () => {
    expect(isSpamSubmission({ website: "", renderedAt: NOW - 100, minFillMs: MIN_FILL_MS, now: NOW })).toBe(true);
  });

  test("submission exactly at the minimum fill time passes (boundary is exclusive on the fast side)", () => {
    expect(isSpamSubmission({ website: "", renderedAt: NOW - MIN_FILL_MS, minFillMs: MIN_FILL_MS, now: NOW })).toBe(false);
  });

  test("honeypot takes priority even when timing would also pass", () => {
    expect(
      isSpamSubmission({ website: "filled", renderedAt: NOW - MIN_FILL_MS - 5000, minFillMs: MIN_FILL_MS, now: NOW }),
    ).toBe(true);
  });
});
