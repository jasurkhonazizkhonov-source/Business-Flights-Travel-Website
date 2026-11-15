# Website complete functionality and regression audit

Date: 2026-11-15. Tree: `Travel Agency Website-updated`, branch `work/website-crm-api-integration`, HEAD d1d1b61 plus the uncommitted working tree described in the release report. Everything ran locally against a production build with a **stand-in CRM** and fake data. No real CRM, email, SMS, visitor or submission was involved. No browser was driven by hand: the evidence is automated Playwright runs in real Chromium (Desktop Chrome and three phone-width viewports), plus structural and unit tests.

## 1. Commands and results (new, 2026-11-15)

| # | Command | Result |
|---|---|---|
| 1 | `npx tsc --noEmit` | exit 0, no errors |
| 2 | `npx eslint src tests scripts deploy` | exit 0, no findings |
| 3 | `node scripts/validate-content.mjs` | all checks passed (36 articles, 171 destinations, unique images) |
| 4 | `NEXT_OUTPUT=standalone npm run build` | **exit 0 on the first attempt** (the 2026-11-13 attempt had run out of memory once at about 0.2 GB free; a retry succeeded then) |
| 5 | `npm start` (= `next start -p 3101`, assigned port, temporary) then `node scripts/validate-seo.mjs` | 218 routes, 0 failures |
| 6 | `npx playwright test --project="Desktop Chrome" --project="Mobile 320" --project="Mobile 375" --project="Mobile 390" --workers=2 --retries=0` | **1391 passed, 1 failed, 8 skipped** (1400 tests, 9.7 min). The failure: `phone-validation-loading.spec.ts` (harness race, section 4). Skips are viewport-conditional by design |
| 7 | `npx playwright test tests/phone-validation-loading.spec.ts --project="Desktop Chrome" --project="Mobile 320" --project="Mobile 390" --repeat-each=6 --retries=0` after the fix | **252 passed, 0 failed** |
| 8 | `npx playwright test --project=Infrastructure --no-deps --workers=1 --retries=0` (standalone server, stand-in CRM, deploy scripts with a fake `docker`, rate limits, body limit) | **168 passed, 0 failed, 6 skipped**, exit 0 (9.5 min). The 6 skips are `crm-contract-live.spec.ts`, which runs only against a non-production CRM you point it at (`CRM_CONTRACT_URL`, `CRM_CONTRACT_KEY`): **NOT RUN** |
| 9 | `npm audit --omit=dev` / `npm audit` | 0 vulnerabilities / 7 moderate (dev toolchain only) |

Tests per viewport project: 350 across 18 spec files (4 projects = 1400). The earlier numbers in `WEBSITE_REDEPLOYMENT_READINESS_REASSESSMENT.md` (103 and 43 passed, 14 new) were the **historical** 2026-11-13 results; these are the new ones.

**Not run / blocked** (never counted as passed): Docker image build and a Docker-based standalone start (Docker is not installed); anything needing PostgreSQL (the website has none; the CRM's database suites belong to the CRM report); the opt-in live CRM contract tests (needs a non-production CRM; the local CRM on port 3001 was last seen answering errors and was not restarted, as instructed); manual screen-reader and visual review; a side-by-side run against the original site on port 3100.

**Vitest test-discovery contamination (`.next/standalone`)**: this is a CRM problem only. The website has no Vitest (`package.json` lists none); Playwright's `testDir` is `tests/`, so generated build output is never collected. The CRM's `vitest.config.ts` has no `exclude`, so Vitest's default (which does not skip `.next`) collects the stale copies. The exact correction for the CRM (not made, the CRM must not be modified in this task): `import { configDefaults } from "vitest/config"` and `exclude: [...configDefaults.exclude, ".next/**"]`.

## 2. Functional areas

| Area | Verdict | Evidence |
|---|---|---|
| **Flight request**: one-way, round trip, multi-city, passengers, cabin, airports, validation, submit, success/failure, duplicate protection | PASS WITH LIMITATIONS | Unit and structural tests (`flight-request-notification.spec.ts`: 91 per viewport, covering one-way, round-trip and multi-city emails, optional fields, ordering, duplicate-before-notification ordering, Message-ID stability across the bounded retry); real-browser, standalone-server, stub-CRM runs of the form including 400/401/403/429/500/malformed/no-answer/double-click (`form-failure-recovery-e2e.spec.ts`); `Idempotency-Key` behaviour (`crm-api-actions-e2e.spec.ts`). Limitation: every CRM was a stand-in |
| **Round-trip date range**: preview on hover, departure vs return styling, commit, no return before departure, one-way has no range, stale return cleared, keyboard, touch, reopening shows the range | PASS | `date-range.spec.ts` (7 per viewport, mouse, keyboard and touch), `design-integrity.spec.ts` (popover brought into view, focus not obscured), axe. Smoothness of animation is asserted only for reduced motion; **visual smoothness was not judged by eye** |
| **Contact form**: required fields, email and phone validation, message, loading, success, error, server validation, honeypot and timing, CRM submission, visitor context, duplicate handling | PASS WITH LIMITATIONS | `phone-validation-loading.spec.ts` (14), `contact-form-autocomplete.spec.ts` (4), `contact-details-and-consent.spec.ts` (19), `anti-spam.spec.ts` (6), `contact-visitor-context.spec.ts` (14), `crm-api-actions-e2e.spec.ts` (6 contact IP/location tests plus the idempotency test), `form-failure-recovery-e2e.spec.ts`. Limitation: stand-in CRM only |
| **Newsletter**: rendering, validation, honeypot (silent discard, same reply as success), duplicate handling, privacy link, unique element ids | PASS WITH LIMITATIONS | `crm-api-actions-e2e.spec.ts` (honeypot valid/empty/filled/whitespace/malformed/repeated), `accessibility.spec.ts` ("home page has no duplicate element ids (two newsletter forms share the page)"), `form-failure-recovery-e2e.spec.ts`. Whether the real CRM de-duplicates subscribers is the CRM's behaviour and was not run |
| **Navigation and company contact information** | PASS | `contact-details-and-consent.spec.ts`: on every static page type, a destination and an article, no old phone number, `requests@`/`request@` address or 580 California Street appears, every `tel:` and `mailto:` link uses the new ones; footer, contact page, floating call button, flights sentence, legal pages and the TravelAgency JSON-LD checked. A source search found no old values and the only telephone number in `src/` is `+1 415 570 9267` (display) / `+14155709267` (links). |
| **Cookie banner and consent dialogs** | PASS | `design-integrity.spec.ts` (Reject and Accept equal weight), `accessibility.spec.ts` (dialog traps Tab, returns focus on Escape) |
| **Responsive layout** | PASS | Four viewports (desktop, 320, 375, 390 px) over the full suite; no horizontal scroll or obscured focus assertions |
| **Error pages** | PASS | `error-boundaries.spec.ts`, 404 axe test |

## 3. Production build and standalone runtime

* `next build` standalone output exists (`.next/standalone/server.js`); the Infrastructure suites start it directly with explicit environment and exercised: API routes (`/api/health`), the three form server actions, CRM unavailability (generic visitor message, nothing retried), the 64 KB body limit, per-IP rate limits and the `www` redirect (`self-hosted-e2e.spec.ts`). Security headers were checked once by hand against the live production server with `curl -I` (not an automated assertion): CSP, `X-Content-Type-Options`, `X-Frame-Options`, Referrer-Policy, Permissions-Policy and HSTS present, no `X-Powered-By`.
* Static assets, public assets and image configuration were served by the production server during the browser run (no broken asset assertions failed).
* Behaviour that works in development but could fail in a standalone deployment: none found. Known difference: `next start` warns that standalone output is configured; the production image uses `node server.js` (tested by the self-hosted suite, not by Docker).
* **Docker verification: BLOCKED** (not installed).

## 4. Bugs found and fixed in this pass (all minimal)

1. **Privacy Policy omitted contact-form IP/location capture**: one factual sentence added (see the privacy review). Source: `src/app/privacy-policy/page.tsx`.
2. **Preflight refused the existing `.env` that the original release requires** (`DATABASE_URL`), and removing it would break rollback: explicit per-run opt-in added, default unchanged, new test (see the environment audit). Source: `deploy/preflight.sh`, `tests/deploy-scripts.spec.ts`.
3. **Intermittent failure in `phone-validation-loading.spec.ts`**: two test-harness races (unguarded route handler reported as "Test ended"; submit clicked before the form was hydrated). Fixed in the spec only; the product behaviour was correct.
4. Documentation comment in `src/lib/crm-api/visitor-context.ts` now lists the `source` field.

## 5. Remaining defects and gaps

* No product defect is open from this pass.
* Open items are decisions and checks outside the repository: deployment branch, live `.env`, CRM version and Docker networks (VPS-side), legal review, and the opt-in live CRM contract tests.
