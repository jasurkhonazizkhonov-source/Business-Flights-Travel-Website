import { defineConfig, devices } from "@playwright/test";

// Local-only test config for manually verifying the redesign against the
// dev server (see docs comment in tests/redesign.spec.ts for what this
// covers). Not wired into CI/build — run with `npx playwright test`
// against an already-running `npm run dev` on port 3100.
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  // Root cause of the flakiness the retry below absorbs: with no explicit
  // `workers`, Playwright defaults to ~half the machine's CPU cores (6 on
  // the 12-core box this was diagnosed on) — that many Chromium contexts,
  // each a fresh page with nothing cached, hit the *same* single `npm run
  // dev` process at once. The airport autocomplete test in particular is
  // the one most exposed to this: it's the first thing in that test to
  // trigger the lazy-loaded, 770KB+ airports.json chunk, so several workers
  // end up cold-fetching and parsing it from the same dev server
  // simultaneously. Capping workers reduces that contention at the source,
  // rather than only papering over it with retries.
  workers: 3,
  // Still keep 1 retry as a safety net even with capped workers — this is a
  // local dev-server suite sharing the host machine with whatever else is
  // running, not a dedicated CI runner. Every failure of this kind seen
  // across sessions reproduced as a clean pass in isolation with
  // --workers=1, never as a genuine regression, so this is absorbing real
  // environmental contention, not masking an application bug. A persistent
  // bug still fails after the retry.
  retries: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "Desktop Chrome", use: { ...devices["Desktop Chrome"] } },
    { name: "Mobile 320", use: { viewport: { width: 320, height: 700 } } },
    { name: "Mobile 375", use: { viewport: { width: 375, height: 812 } } },
    { name: "Mobile 390", use: { viewport: { width: 390, height: 844 } } },
  ],
});
