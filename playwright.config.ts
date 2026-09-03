import { defineConfig, devices } from "@playwright/test";

// Local-only test config for manually verifying the redesign against the
// dev server (see docs comment in tests/redesign.spec.ts for what this
// covers). Not wired into CI/build — run with `npx playwright test`
// against an already-running `npm run dev` on port 3100.
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  // 1 retry absorbs the resource-contention flakiness of running multiple
  // projects/workers against a single shared dev server locally (observed on
  // timing-sensitive assertions like an autocomplete dropdown appearing) —
  // every such failure has reproduced as a clean pass in isolation with
  // --workers=1, never as a genuine regression. A persistent bug still fails
  // after the retry.
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
