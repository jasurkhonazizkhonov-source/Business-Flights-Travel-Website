# Final verification: security, integration, mobile, accessibility and release readiness (2026-11-24)

Branch `review/website-parity-and-contact-ip-2026-11-15`. Nothing here was deployed, nothing was applied to production, no production data or secret was used or printed. Companion documents: `SECURITY_AUDIT_2026-11-24.md` (findings, secret scan, privacy items for counsel), `CSP_HARDENING.md`, `EDGE_PROOF_ACTIVATION_RUNBOOK.md`.

## 1. Release decision

**Not "production-ready"; prepared for a gated release.** The code is complete, tested and documented, but these gates are outside what could be done or verified from this machine, and the brief forbids calling the project production-ready while any remains:

| Gate | State | Who/what closes it |
|---|---|---|
| CRM must be deployed **before** the website, with migration `20261123000100_lead_date_flexibility_days` applied first (the website now sends `dateFlexibilityDays`; the CRM endpoint is strict and answers 400 to an unknown field) | The CRM commits (including the migration, 831d87f, and the contract test, 3b469bf) exist **only locally**: the CRM's push URL is `DISABLED-NO-PUSH`, which was not bypassed. | The owner pushes the CRM branch (or lifts the safeguard), then CRM CI, then deployment. |
| Website to CRM **live** flow against a non-production CRM with a disposable database | **Not run.** Verified instead: the website against a stand-in CRM (278 Infrastructure tests), and the CRM's own route and real-PostgreSQL suites on its side; the two sides share contract fixtures (section 4). `tests/crm-contract-live.spec.ts` exists and runs only when `CRM_CONTRACT_URL` / `CRM_CONTRACT_KEY` point at a non-production CRM. | Run that spec against a staging CRM before release. |
| Cloudflare: Rocket Loader **Off**; the edge-proof rule; optional TRACE block | **Not examined** (no access). Prepared: runbook, verification script, `observe` mode that cannot lock anyone out, run-time kill switch for the CSP. | Someone with Cloudflare access, following the runbook. |
| Real devices, a real screen reader, a real on-screen keyboard; Firefox | **Not done** (section 6). | Manual pass on a phone and with NVDA/VoiceOver. |

## 2. What changed in this task (all uncommitted before this commit; website tree only)

* **Edge proof** (`src/lib/client-ip.ts`, `src/app/api/edge-check/route.ts`, `deploy/check-edge-proof.sh`, compose/preflight/env, runbook): an `EDGE_PROOF_MODE` of `observe` (counts and logs valid/missing/invalid, refuses nothing) before `enforce`; the existing `EDGE_PROOF_SECRET` is reused, none generated or rotated.
* **Rate limiting** (`sliding-window.ts`, `rate-limit-client.ts`, the three actions): flood-resistant eviction, shared allowance (5x) for the unresolved-client bucket, trusted-IP keys. Cross-instance limiting is the CRM's database limiter; the website limiter is per process (documented, tested with three servers).
* **CSP** (`src/proxy.ts`, `src/lib/csp.ts`, root layout `force-dynamic`): per-response script nonce, no `'unsafe-inline'` for scripts, `script-src-attr 'none'`, `frame-src`/`worker-src 'none'`, kill switch `CSP_SCRIPT_MODE=compat`. `style-src 'unsafe-inline'` remains (reason in `CSP_HARDENING.md`).
* **Proxy hardening found by the final tests**: `Cache-Control: private, no-cache, max-age=0, must-revalidate` on pages (restores back/forward-cache), 405 for PUT/DELETE/PATCH/OPTIONS on pages.
* **Phone calendar** (`useFullWidthPopover.ts`, `DateField.tsx`): full-width on phones, 44 px days from 360 px (38 px at 320 px), closed calendar `display:none` on phones.
* **Safari defects found by running WebKit** (fixed): the cookie dialog did not return focus to its opener after a click (Safari does not focus clicked buttons); the "Restore it" button lost its click because the press blurred the phone control and the layout shifted; a stalled validator chunk could leave a submit waiting forever (now capped at 8 s, the server validates).
* **CRM contract fixtures** (website `tests/support/fixtures/website-flight-inquiry-contract.json`, byte-identical copy in the CRM).
* Privacy policy sentence on the transient IP counter; safe error logging; docs and CI list updated (`verify.yml` now also runs `csp-nonce` and `crm-contract-fixtures` and installs Chromium for them).

## 3. Test results on the final tree (build with `NEXT_OUTPUT=standalone`, run after the last source change)

| Suite | Result |
|---|---|
| `tsc --noEmit`, `eslint src tests --max-warnings=0` | clean |
| `npm audit` (production and all) | 0 vulnerabilities |
| Browser projects: Desktop Chrome, Mobile 320, 375, 390 (`playwright test`, 3 workers) | **2,749 passed, 0 failed, 0 flaky**, 35 skipped (tests that declare a Chromium-only or desktop-only feature) |
| WebKit (Safari engine): iPhone 13 and Desktop Safari projects | **1,367 passed, 0 failed, 0 flaky**, 25 skipped |
| Infrastructure project (standalone servers, stand-in CRM, deploy scripts, CSP, edge proof, rate-limit topology, contract fixtures) | **278 passed, 0 failed, 0 flaky**, 6 skipped (opt-in live-CRM spec and engine-specific) |
| Page-overflow audit, 15 page types at 320, 360, 375, 390, 414, 430, 768, 1024, 1280, 1440 (portrait) and 568x320, 667x375, 844x390 (landscape), plus the calendar open/closed on `/flights` | 221 checks, 0 problems (a temporary spec; deleted, not committed) |
| CRM side: contract test, route tests, lead-intake tests, guard test | 118 passed; `tsc` clean (CRM tree, read-only) |
| History secret scan, both repositories | no real credential found (`SECURITY_AUDIT_2026-11-24.md`) |

### First-attempt failures (recorded, not hidden)

1. **Browser projects, first run: 40 failed.** 28 were closed-calendar assertions that looked for the `inert` attribute on a calendar that is now `display:none` on phones (the test now accepts "inert or not rendered": a closed calendar is still proven closed); 12 were source guards pinning the old shape of the rate-limit call (updated to the new `limitFor(base, ip)` shape; they still prove the key, prefix and threshold).
2. **Infrastructure, first run: 2 failed.** `http-boundaries`: pages answered `PUT` with 200 once they were rendered per request: **a real regression of mine**, fixed in the proxy (405). `TRACE` cannot be answered with 405 by the framework (generic 500, nothing echoed; the API routes already did this): the test now says so explicitly. `edge-proof` script test: a **test bug** (a blocking `spawnSync` froze the in-process stand-in edge); now asynchronous.
3. **Browser projects, second run: 1 flaky** (axe color contrast on `/blog`, once, caught mid-fade under load; 15 of 15 repeats pass; the spec already waits for animations to finish). Not reproduced in the final run.
4. **WebKit, first run: 8 failures = 4 distinct.** Two were real Safari defects (cookie dialog focus return; "Restore it"), fixed in the product. One is browser behaviour: Safari's default keyboard setting skips links on Tab, so the skip-link test is skipped on WebKit with that reason (a skip link is reached with Option+Tab or a screen reader). One was a test that filled the form before hydration. Afterwards Playwright's `fill()` proved unreliable on the phone library in WebKit (3 failures in 8 runs; typing the same number key by key: 20 of 20), so the WebKit helper types.

## 4. CRM integration

* **Contract**: `dateFlexibilityDays` is an integer 0 to 3 (0 = exact dates) with `datesFlexible` = (days > 0); sent together; the CRM refuses a disagreement, a fraction, a negative, a number above 3, a string, and any unknown field (company, status, `website`, `submissionId`). An old cached form that sends only the checkbox is accepted without inventing a number.
* **Shared fixtures**: the website generates 7 accepted and 9 rejected bodies from its own code with a fixed clock; the CRM test runs each through its real strict route schema and the real `createWebsiteFlightLead`, asserting what would be stored. A payload change on either side fails a test on both.
* **Migration `20261123000100_lead_date_flexibility_days`**: one nullable `Lead.dateFlexibilityDays INTEGER` with a CHECK of NULL or 0 to 3; additive, rewrites no rows, committed (831d87f); the CRM's CI applies migrations to a throwaway PostgreSQL. **Not applied to any production database by this work.** Rollback: leave the column (unused, harmless).
* Retries, idempotency (`Idempotency-Key`, duplicate answered as success, reused key with a different body answered 409), timeouts and non-leaky errors were covered by the earlier suites and still pass (`crm-api-client`, `crm-api-actions-e2e`, `form-failure-recovery-e2e`).

## 5. Lighthouse (production build, headless Chrome, simulated throttling, shared machine)

"Before" is the last commit (static pages, `'unsafe-inline'`), built from a clean export in a scratch folder. "Nonce build, first run" is this work before the cache fix. Accessibility, best-practices and SEO were 100 everywhere in all three. The only audit that does not pass in the final run is `valid-source-maps` (production builds ship no source maps; intentionally not changed).

| Device | Page | Before: perf / LCP ms / TBT ms / bfcache | Nonce build, first run | Final: perf / LCP ms / TBT ms / bfcache | A11y / BP / SEO |
|---|---|---|---|---|---|
| mobile | `/` | 56 / 5356 / 1056 / pass | 56 / 5406 / 1103 / fail | **78** / 5131 / 164 / pass | 100 / 100 / 100 |
| mobile | `/flights` | 73 / 4898 / 382 / fail | 58 / 3909 / 3075 / fail | **82** / 4605 / 149 / pass | 100 / 100 / 100 |
| mobile | `/contact` | 58 / 4547 / 1470 / pass | 63 / 3569 / 1904 / fail | **93** / 3294 / 41 / pass | 100 / 100 / 100 |
| mobile | `/destinations` | 42 / 11031 / 9419 / pass | 68 / 4518 / 632 / fail | **85** / 4282 / 75 / pass | 100 / 100 / 100 |
| mobile | `/blog` | 58 / 3327 / 1745 / pass | 92 / 3309 / 99 / fail | **90** / 3606 / 43 / pass | 100 / 100 / 100 |
| mobile | `/privacy-policy` | 93 / 3209 / 48 / pass | 93 / 3181 / 39 / fail | **94** / 3131 / 31 / pass | 100 / 100 / 100 |
| desktop | `/` | 95 / 1279 / 111 / pass | 96 / 1308 / 73 / fail | **98** / 1103 / 0 / pass | 100 / 100 / 100 |
| desktop | `/flights` | 99 / 1036 / 46 / fail | 98 / 1059 / 4 / fail | **99** / 1032 / 0 / pass | 100 / 100 / 100 |
| desktop | `/contact` | 92 / 1000 / 208 / pass | 99 / 986 / 0 / fail | **99** / 945 / 0 / pass | 100 / 100 / 100 |
| desktop | `/destinations` | 98 / 1016 / 9 / pass | 99 / 873 / 3 / fail | **95** / 1503 / 0 / pass | 100 / 100 / 100 |
| desktop | `/blog` | 99 / 866 / 13 / pass | 100 / 804 / 10 / fail | **98** / 1116 / 0 / pass | 100 / 100 / 100 |
| desktop | `/privacy-policy` | 100 / 705 / 0 / pass | 100 / 704 / 0 / fail | **100** / 751 / 0 / pass | 100 / 100 / 100 |

Read with care: the performance score and TBT swing widely between runs of **identical code** on this shared machine (the home page scored 56, 68 and 78 on three builds that differ only in headers), so differences of 10 to 20 points are noise; only the structural findings are reliable. **What was genuinely found and fixed:** the nonce change made every page fail the back/forward-cache audit (Next's `no-store`); fixed. **What was not fixed:** mobile LCP is 3.1 to 5.1 s on the heavy pages in both the before and the final builds (the cause is unchanged image and JavaScript weight, not this work); the document is now rendered per request instead of served as a prerendered file (Lighthouse's server-response time on the final build was 18 to 150 ms locally, highest on the 1.1 MB `/destinations` page); watch the container's CPU after deployment, because Cloudflare cannot cache these pages.

## 6. Not verified, and why

* **Real phone, real keyboard, NVDA/JAWS/VoiceOver**: none was available. Playwright emulation, WebKit, axe (zero violations on every page type) and Lighthouse stand in and do not replace them. A manual pass should cover: the date picker with a thumb and with the on-screen keyboard open, the phone field and its country list, the cookie dialog (focus return), the skip link in Safari with Option+Tab, and a full form submission with a screen reader.
* **Firefox**: it cannot start on this machine (a Windows side-by-side configuration error launching the browser, not a site error). Installing the missing system runtime needs administrator approval and was not done. The Firefox projects exist behind `BFT_ENGINES=1` and can be run on any machine where the browser starts.
* **Cloudflare, production hostname, real Docker image**: not reachable from here. The Docker rehearsal files exist and were not run (no Docker daemon was used).

## 7. Deployment and rollback order (for when the gates above are closed)

1. **CRM first.** Push the CRM branch (owner decision on the disabled push URL), let its CI pass, apply migration `20261123000100` before the new image serves traffic (`deploy.sh --migrate` on the CRM host), deploy the CRM image. Rollback: the previous image keeps working (the column is nullable and unused by it).
2. **Cloudflare, before the website image**: confirm Rocket Loader is **Off** for the zone; optionally add the TRACE block (runbook section 7).
3. **Website image** with `EDGE_PROOF_MODE=observe` if the edge-proof secret is to be introduced (the secret already in use is reused; do not rotate). Run `deploy/check-edge-proof.sh` against the public URL; open `/` and `/flights` once and confirm the form and the calendar work. If anything is odd: `CSP_SCRIPT_MODE=compat` and restart (no rebuild), then investigate.
4. Watch `docker logs` for the `[edge-proof]` summary lines (all `valid`, no `missing`) for a day; only then `EDGE_PROOF_MODE=enforce` (or leave `observe`: the headers are believed exactly as before).
5. **Website rollback**: redeploy the previous image; the CRM tolerates both payload shapes (the old one carries only the checkbox).

Peer coordination: the CRM session committed the CRM contract-test files itself as 3b469bf; the website session made no CRM commit and no push.

## 8. Continuation (2026-11-24, second pass): what was found and changed

Everything below was re-verified on the final tree (section 8.4). The release decision of section 1 is unchanged in kind: **ready with documented limitations, not production-verified.**

### 8.1 Defects found and fixed

| Finding | Evidence | Fix |
|---|---|---|
| **Text typed into a form before it hydrates was erased.** The fields are controlled (`useState("")`) and hydration wrote the empty value back. This is what the earlier WebKit `fill()` flake was hiding; I had changed the test helper instead of testing the behaviour. | A probe typed into `/contact` the moment the form existed: first and last name both empty after hydration, with no throttling and with 4x CPU / 400 kbps and 6x CPU / 150 kbps. On a phone the window lasts seconds; browser autofill hits the same window. | A 450-byte inline script (first in `<body>`, carrying the CSP nonce) records edits by element id; each form takes its own fields back right after hydration (`useAdoptEarlyInputs`), then closes those ids so nothing stale can return. The phone field takes back only an international (`+`) number. `tests/pre-hydration-input.spec.ts` holds the JavaScript back for 8 s, types with real keystrokes, checks the form is *not* hydrated, then checks every field survives and that submitting reports only what is really missing: 5 cases x 5 browser projects, run twice, 50 of 50. The WebKit typing helper stays (fill is not what a visitor does) and is now a second layer, not a cover. |
| **`style-src 'unsafe-inline'` for style elements** | `CSP_HARDENING.md` section 4 | `style-src-elem 'self'` plus the hash of the toast library's one run-time `<style>` and the hash of the empty string (the library appends the element before it fills it; without the second hash every page view logged a console error in Chromium and WebKit). Only style *attributes* keep `'unsafe-inline'`. A real-browser test proves an injected `<style>` and a foreign stylesheet are refused while inline attributes still work, and a test recomputes the hash from the installed library so an update cannot silently break it. |
| **A secret with an empty `EDGE_PROOF_MODE` means enforce** (lock-out by omission) | `client-ip.ts` default | `deploy/preflight.sh` now refuses a secret without an explicit mode (test updated). |
| **No test proved the signing against a real CRM** | the stand-in CRM cannot | `tests/crm-signed-live.spec.ts` and `tests/crm-journey-live.spec.ts` (opt-in), results in `CRM_API_INTEGRATION.md`. They found a CRM **configuration** requirement: without `WEBSITE_SIGNATURE_REQUIRED=true` a replayed signature is accepted as unsigned. |

### 8.2 Investigated and deliberately **not** changed (evidence, not opinion)

* **Mobile LCP.** Lighthouse's simulated 3.1 to 5.3 s on the text-led pages is a model artefact. Under *applied* throttling (4x CPU, 1.6 Mbps, 150 ms) a real Chromium reports LCP at the same instant as first paint: `/contact` 1.3 s, `/flights` 0.9 s, `/` 1.4 to 1.5 s, `/blog` 1.2 to 1.3 s (median of six runs, stable to about 40 ms); `/destinations`, whose largest paint is a photograph on a 1.1 MB page, 2.0 s. All inside the "good" band (2.5 s). Blocking the fonts changed nothing (3.5 s vs 3.3 s simulated), so fonts are not the cause; the server HTML hides nothing with `opacity:0`. Adding `fetchpriority="high"` to the already-preloaded first images (what Lighthouse's discovery audit asks for) was tried and **made no measurable difference** (destinations 2,024 vs 2,038 ms, blog 1,268 vs 1,298 ms), so it was reverted. Lighthouse's own scores swing 10 to 40 points between runs of identical code on this machine, and in the last two passes Windows was compressing 1.8 GB of memory, which produced `CacheLimitPrunedOnCriticalMemoryPressure` (a back/forward-cache refusal that is the machine's, not the page's) and blocking times of 0.6 to 1.6 s on pages that measured 30 to 90 ms earlier. **Treat the mobile Lighthouse performance score as unreliable here; the structural audits (accessibility, best practices, SEO 100 everywhere; no layout shift; the back/forward cache passes except where memory pressure pruned it) are the dependable part.**
* **Rate limiting.** No new store; reasoning and the exact residual risk in `SECURITY_REVIEW_AND_REMAINING_LIMITATIONS.md`.
* **Cloudflare.** Read-only evidence from the live site: Rocket Loader shows no sign of being active; Email Address Obfuscation **is** on (it injects `email-decode.min.js` before React hydrates; no hydration error was observed, and the same-origin script is allowed by `'self'`). Nothing in Cloudflare was changed. See `CSP_HARDENING.md` section 3.
* **HTTP methods.** GET/HEAD/POST pass, PUT/DELETE/PATCH/OPTIONS answer 405 with `Allow`, TRACE is refused with a generic 500 and no echo (`http-boundaries.spec.ts`); an optional Cloudflare TRACE block is in the runbook.

### 8.3 What the throwaway real CRM proved, and what it did not

A throwaway CRM built from the CRM's final commit in a scratch folder, on its own PostgreSQL 17.11 (never the CRM's database): all 85 migrations applied to an empty database; contract 6 of 6; signed path 8 of 8 with enforcement; customer journey (flight, contact, newsletter, CRM down) 4 of 4; the stored rows and the logs were inspected (`CRM_API_INTEGRATION.md`). **Not proved:** the real VPS, the Cloudflare path, Docker, a real mailbox.

### 8.4 Final results on the final tree (build with `NEXT_OUTPUT=standalone`, after the last source change)

| Suite | Result |
|---|---|
| `tsc --noEmit`, `eslint src tests scripts --max-warnings=0`, `npm audit` (all) | clean, clean, 0 vulnerabilities |
| Chrome projects (Desktop, Mobile 320, 375, 390) | **2,769 passed, 0 failed, 0 flaky**, 35 skipped |
| WebKit (iPhone 13, Desktop Safari) | **1,377 passed, 0 failed, 0 flaky**, 25 skipped |
| Infrastructure | **281 passed, 0 failed, 0 flaky**, 18 skipped (the three opt-in real-CRM specs, which pass when pointed at a CRM: 6 + 8 + 4) |
| Lighthouse (12 runs) | accessibility, best practices, SEO 100 on every page; the only non-passing audit besides memory-pruned back/forward cache is `valid-source-maps` (production builds ship no source maps, intentionally) |

First-attempt failures of this pass, recorded: the contact-form pre-hydration test failed on four projects once because the 2.5 s hold was shorter than the typing (a test timing error; the hold is 8 s now); the first style-policy build logged a console error per page view (fixed with the empty-string hash, above); `deploy-scripts.spec.ts` failed once, as intended, when the new preflight rule refused a secret without a mode (test updated). No assertion was weakened; the three tests that changed now assert more.
