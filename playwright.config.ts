import { defineConfig, devices } from "@playwright/test";

// Local-only test config for manually verifying the redesign against the
// dev server (see docs comment in tests/redesign.spec.ts for what this
// covers). Not wired into CI/build — run with `npx playwright test`
// against an already-running `npm run dev` on port 3100.
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  retries: 0,
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
