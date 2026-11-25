import { defineConfig, devices } from "@playwright/test";

// Local-only test config for manually verifying the redesign against the
// dev server (see docs comment in tests/redesign.spec.ts for what this
// covers). Not wired into CI/build — run with `npx playwright test`
// against an already-running `npm run dev` on port 3101 (this checkout's port; the original website uses 3100).
// Specs that are NOT about a viewport: the CRM-API specs run a local stand-in CRM, the self-hosted and rate-limit specs start a whole standalone
// server, and the deploy-script spec runs bash. Running them once per viewport project (4x) would multiply that work, and together with browsers and a
// Next server on an 8 GB machine it produced "worker process exited unexpectedly" crashes. They live in their own "Infrastructure" project, which runs
// ONCE and only after the viewport projects have finished. Run it alone (the dependencies are the browser projects, which submit real forms):
//   npm run test:infra   (= --project=Infrastructure --no-deps --workers=1)
const INFRASTRUCTURE_SPECS = [
  /crm-api-client\.spec\.ts$/,
  /crm-api-actions-e2e\.spec\.ts$/,
  /crm-contract-live\.spec\.ts$/, // opt-in: skipped unless CRM_CONTRACT_URL / CRM_CONTRACT_KEY point at a non-production CRM
  /crm-journey-live\.spec\.ts$/, // opt-in: the real forms of a standalone website against a real non-production CRM (same variables as crm-signed-live)
  /crm-signed-live\.spec\.ts$/, // opt-in: signing v2 against a real non-production CRM (also needs CRM_CONTRACT_SECRET and CRM_CONTRACT_COMPANY_ID)
  /self-hosted-e2e\.spec\.ts$/,
  /deploy-scripts\.spec\.ts$/,
  /rate-limit-actions-e2e\.spec\.ts$/,
  /form-failure-recovery-e2e\.spec\.ts$/, // standalone server + browser, stub CRM
  /server-action-body-limit-e2e\.spec\.ts$/, // standalone server, raw HTTP
  /vps-deployment\.spec\.ts$/,
  /docker-topology\.spec\.ts$/, // static checks of the compose files and the rehearsal project (no Docker needed)
  /visitor-hint-route\.spec\.ts$/, // standalone servers, raw HTTP
  /http-boundaries\.spec\.ts$/, // standalone server, raw HTTP: hostile and malformed requests
  /date-flexibility-e2e\.spec\.ts$/, // standalone server + browser + stub CRM: the flexibility choice reaches the CRM
  /edge-proof\.spec\.ts$/, // pure decision tests + a standalone server with the optional edge proof on
  /rate-limit-topology\.spec\.ts$/, // three standalone servers: instances do not share counts; forged-IP rotation with and without the edge proof
  /server-action-surface\.spec\.ts$/, // static scan + the build's server-reference manifest: exactly three public actions, exactly three read-only API routes
  /csp-nonce\.spec\.ts$/, // pure policy tests + standalone servers: a nonce per response, injection refused, the run-time kill switch
  /crm-contract-fixtures\.spec\.ts$/, // the payloads this website sends, as fixtures a copy of which the CRM validates against its real schema
];
const VIEWPORT_PROJECTS = ["Desktop Chrome", "Mobile 320", "Mobile 375", "Mobile 390"];

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
  // running, not a dedicated CI runner. A persistent bug still fails after
  // the retry.
  //
  // This is no longer covering for the desktop mega-menu test specifically:
  // that one had a real, separate root cause in the app (three dropdown
  // components animated their entrance with a `y`/`scale` transform on the
  // panel that contained the actual clickable options, so a click landing
  // early in the ~150ms transition could miss its target as the option's
  // true rendered position kept moving) — fixed directly in
  // DestinationsMegaMenu.tsx / DateField.tsx / PassengerCabinField.tsx /
  // AirportAutocomplete.tsx by animating opacity only, which changes no
  // layout or hit-testing geometry. Verified via 30 repeated isolated runs
  // (--workers=1, --retries=0) after the fix: 30/30 passed, vs. 2/20
  // failures on the same test before it. What retries:1 still covers is the
  // unrelated resource-contention case documented above (many Chromium
  // contexts cold-fetching the airports.json chunk from one shared dev
  // server at once).
  retries: 1,
  reporter: [["list"]],
  use: {
    // TEST_BASE_URL lets the status-code/indexing specs (tests/seo.spec.ts) run against a production
    // build (`next build && next start -p 3200`), where unknown-URL status codes are exactly what
    // Google sees; the default is the dev server the rest of the suite uses.
    baseURL: process.env.TEST_BASE_URL ?? "http://localhost:3101",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "Desktop Chrome", testIgnore: INFRASTRUCTURE_SPECS, use: { ...devices["Desktop Chrome"] } },
    { name: "Mobile 320", testIgnore: INFRASTRUCTURE_SPECS, use: { viewport: { width: 320, height: 700 } } },
    { name: "Mobile 375", testIgnore: INFRASTRUCTURE_SPECS, use: { viewport: { width: 375, height: 812 } } },
    { name: "Mobile 390", testIgnore: INFRASTRUCTURE_SPECS, use: { viewport: { width: 390, height: 844 } } },
    // OTHER BROWSER ENGINES, opt in (BFT_ENGINES=1; the engines are installed with `npx playwright install firefox webkit`, which is a local developer download and
    // changes no project dependency): Firefox (Gecko) at desktop and phone width, and WebKit (Safari's engine) as an iPhone and as a desktop. They run the same viewport
    // specs; tests that depend on Chromium-only features declare it and skip there. Not part of the default run, so the standard suite is unchanged.
    ...(process.env.BFT_ENGINES === "1"
      ? [
          { name: "Firefox Desktop", testIgnore: INFRASTRUCTURE_SPECS, use: { ...devices["Desktop Firefox"] } },
          { name: "Firefox 390", testIgnore: INFRASTRUCTURE_SPECS, use: { ...devices["Desktop Firefox"], viewport: { width: 390, height: 844 } } },
          { name: "WebKit iPhone", testIgnore: INFRASTRUCTURE_SPECS, use: { ...devices["iPhone 13"] } },
          { name: "WebKit Desktop", testIgnore: INFRASTRUCTURE_SPECS, use: { ...devices["Desktop Safari"] } },
        ]
      : []),
    // Once, after the viewport projects (a full `playwright test` therefore never runs these alongside the browser projects).
    { name: "Infrastructure", testMatch: INFRASTRUCTURE_SPECS, dependencies: VIEWPORT_PROJECTS, use: { ...devices["Desktop Chrome"] } },
  ],
});
