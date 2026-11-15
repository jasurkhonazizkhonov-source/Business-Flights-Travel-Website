# Implementation summary - security, reliability and verification pass (2026-11-13)

Scope: the website (`Travel Agency Website-updated`, dev port 3101) and the CRM (`compass-tools-updated`, dev port 3001). The originals
(`Travel Agency Website` 3100, `compass-tools` 3000) were **not modified**. Nothing was deployed, no production setting, database, credential, e-mail or
request was touched; every check used local servers, stub CRMs, mocks and synthetic data. Git: read-only; no staging, commit, stash, checkout or
merge-state change (details at the end). Both audit reports keep their history and now end with a dated implementation section.

## What changed, by phase

| # | Area | Change | Where (website unless marked CRM) | Proven by |
|---|---|---|---|---|
| 1 / W1 | Form failure handling | A call that fails as a whole (dropped connection, timeout, HTTP 413/500, thrown action, malformed reply) is an inline message; the visitor stays on the page, everything typed is kept, the button works again, nothing is retried automatically and no success is claimed. The submit button is driven by an own `busy` flag (React kept `useTransition`'s flag set until the hung call itself ended, so the form stayed locked after our time limit). | `src/lib/safe-action.ts`, the three form components | `tests/safe-action.spec.ts` (12), `tests/form-failure-recovery-e2e.spec.ts` (real browser, standalone server, stub CRM: 400/401/403/429/500/wrong shape/no answer/double click, per form) |
| 2 / C2 | Campaign HTML | Server-side allow-list sanitizer (`sanitize-html`, parser based, no regex). Applied at save, at the editor preview (server action + sandboxed iframe, no scripts/same-origin) and every time an email is built (test send and real send). Stored legacy records are **not rewritten**; they are cleaned when previewed or sent. No schema change. | CRM `src/server/email/sanitize-campaign-html.ts`, `actions/marketing-campaigns.ts`, `email/templates.ts`, `components/subscriptions/campaign-form.tsx` | CRM: 57 sanitizer tests (41 hostile payloads, legitimate email HTML preserved, idempotent) + 5 lifecycle tests |
| 3 / W2 | Contact idempotency | Optional `submissionId` (form id + hash of the typed text). The CRM derives the inquiry id from (company, inbox, key): double click, resend after timeout/lost answer and simultaneous identical requests store **one** row (`duplicate:true`); different messages/people are separate; key reuse for different content is `409`. Fully backward compatible; documented in `docs/CRM_API_INTEGRATION.md`. | CRM `src/server/public-inquiry.ts`, `inquiry-id.ts`, `api/public/contact-inquiry/route.ts`; website `submit-contact-message.ts`, `ContactForm.tsx`, `crm-api/client.ts` | CRM 14 mocked-DB tests; website client spec + e2e. **The advisory lock and primary key themselves need the deferred DB integration suite.** |
| 4 / W3 | Newsletter honeypot | The old schema made a filled honeypot a *validation failure* (a bot got a different reply than a human, and the "behave as if it worked" branch was unreachable). A filled honeypot is now discarded silently, before email validation, with the same reply as a success and no CRM call. | `subscribe-newsletter.ts`, `validations/newsletter.ts` | `tests/crm-api-actions-e2e.spec.ts` (valid/empty/filled/whitespace/missing/malformed/repeated) |
| 5 / W4 | Body-size limit | Server Action bodies capped at 64 KB (largest legitimate body about 10 KB). Next refuses larger bodies **before** the action runs; for a fetch action it answers HTTP 200 with an opaque error row (not 413 - a Next limitation), which the forms already turn into the inline message. | `next.config.ts` | `tests/server-action-body-limit-e2e.spec.ts` (10: just below, just above, 5 MB, malformed, content types, server stays healthy) |
| 6 / C3 | CRM `/api/health` | Anonymous: `{status}` + HTTP code only. Full readiness report only with `Authorization: Bearer <CRON_SECRET>` (what `deploy/verify.sh` / `ci-smoke.sh` now send from inside the container). Docker `HEALTHCHECK` unchanged. | CRM `api/health/route.ts`, `security/cron-auth.ts`, `deploy/*.sh` | CRM health tests (6 new, the 12 existing ones now request the detailed report) |
| 7 / C4 | `X-Powered-By` | `poweredByHeader:false`; security headers unchanged. | CRM `next.config.ts` | config tests; built config verified. **Not observed on a live response** (see limitations) |
| 8 / C5 | Unguarded "process due" actions | **Partially confirmed** (defence in depth, low severity): both sweeps were public Server Actions with no check of their own, and the same functions served the cron routes and the poller. Moved verbatim into non-action modules; the buttons call role-checked wrappers; cron and poller call the sweeps directly. | CRM `due-task-notifications.ts`, `due-sequence-steps.ts`, `actions/tasks.ts`, `actions/sequences.ts`, cron routes, `instrumentation.ts` | CRM 7 tests + the existing concurrency suites, now pointed at the sweeps |
| 8 / C6 | Rate-limiter fail-open | **Not confirmed as a defect.** The authenticated website API budget is fail-closed; only the failed-auth counter and the public per-IP limiter fail open, the latter only without `TRUSTED_PROXY` (the VPS compose sets `cloudflare`). No change. | - | code reading |
| 8 / C9 | Production poller | **Confirmed as designed**: the VPS relies on it, so the default stays ON. Added opt-out `DISABLE_IN_PROCESS_POLLER=true` (for instances that must not run background work at boot). Overlap with an external scheduler is safe (atomic claims). | CRM `src/lib/poller-config.ts`, `instrumentation.ts`, `.env.example` | CRM 2 tests |
| 9 / C1 | CRM dependencies | `next` 16.3.8 -> 16.4.6 (critical RCE/DoS advisories; same major line, npm's own `fixAvailable`), `nodemailer` 9.0.5 -> 10.1.4 (14 advisories; major bump, one call site), `zod` 4.4.3 -> 4.6.6, `sanitize-html` 2.18.1 (new; 2.17.x is itself flagged), Tiptap family 3.30.2 -> 3.34.0 with ProseMirror 1.42.9 (paste XSS; the packages pin each other so they move together). No `npm audit fix --force`. Website dependencies untouched. | CRM `package.json`, `package-lock.json` (working tree only) | CRM audit 71 -> 38 findings; tests/build below |

## Results

All numbers are from this pass (2026-11-13), in the correct project directory each time.

| Check | Website-updated | CRM-updated |
|---|---|---|
| Type-check (`tsc --noEmit`) | 0 errors | 0 errors |
| ESLint | 0 problems | 0 problems (the 11 unused-import warnings the split created were removed) |
| Unit / component suite | Desktop Chrome project on 3101: **333 passed, 1 failed, 2 skipped** (336). The failure is `phone-validation-loading.spec.ts:27`, which fails only on the dev server - see limitations | vitest, whole suite: **3,990 passed, 0 failed, 554 skipped** (4,544 tests, 314 files; 27 files skipped = the DB-integration suites) |
| Infrastructure project (standalone production build, stub CRM, deploy-script dry runs) | **161 passed, 0 failed, 6 skipped** (the 6 are the opt-in live-CRM contract spec, which needs `CRM_CONTRACT_URL`) | - |
| Phone-validation spec on the production build | **14 / 14 passed**, assertions unchanged | - |
| `validate:content` / `validate:seo` | passed / passed (218 routes, 0 failures) | - |
| Production build | `NEXT_OUTPUT=standalone npm run build` succeeded (twice) | `npm run build` exit 0 (3 pre-existing Turbopack tracing warnings) |
| New tests added | 12 unit + 10 body-limit + the form-failure e2e (per form: call failures, no-answer, CRM statuses, double click) + idempotency and honeypot cases in the existing specs | 14 idempotency, 57 sanitizer, 5 lifecycle, 6 health, 7 authorization, 2 poller, 2 header |
| Not run | Mobile 320 / 375 / 390 browser projects (not re-run this pass); the opt-in live-CRM contract spec | Every database-dependent test (deferred by decision); a live `X-Powered-By` / `/api/health` request against 3001 (server needs a restart); an authenticated browser check of the campaign preview (no credentials, none copied) |

Server identity was verified before browser work: 3001 = `compass-tools-updated`, 3100 = `Travel Agency Website`, 3101 = `Travel Agency Website-updated`; 3000 was not
started. Harness-only test ports (3231-3243) were used for standalone servers and were stopped by the tests that started them.

## Remaining limitations and blockers (not fixed, with reason)

* **Database-dependent behaviour is unproven by design.** The advisory lock, the derived primary key and the 25 CRM `__integration__` suites need the
  deferred isolated PostgreSQL; they are skipped, never counted as passed. Run them before relying on contact idempotency in production.
* **CRM dev server on 3001 needs a restart.** Updating `node_modules` under the running process left it answering HTTP 500; stopping it was not done
  without approval. Until it is restarted, no live `X-Powered-By` / `/api/health` response from 3001 has been observed (the production build compiled and
  `required-server-files.json` carries `poweredByHeader:false`; unit tests cover the handlers).
* **38 CRM advisories remain**, all outside what the VPS runtime executes or needing a major move: Cloudflare Workers build chain (`@opennextjs/*`,
  `wrangler`, `undici`), Prisma CLI chain (`@prisma/config`, `mysql2`; Prisma 7 -> 8 is a release candidate), the `shadcn` CLI chain (its own `zod`,
  `@modelcontextprotocol/sdk`, `body-parser`, `proxy-addr`) and test tooling (`vitest`, `vite`). Recommended next: patch `vitest`/`vite` within their
  range, and move `shadcn` to a devDependency or remove it from the runtime install.
* **Contact-form honeypot** has the same schema flaw the newsletter had (`max(0)` makes a filled honeypot a validation error). Out of scope for W3;
  recommended as a follow-up.
* **Flight request** is idempotent at the CRM already (Idempotency-Key); its three automatic attempts are unchanged.
* The website still reaches the CRM's two public endpoints without a credential (existing gap #1 in `docs/CRM_API_INTEGRATION.md`).
* The two audited phone-validation failures: `phone-validation-loading.spec.ts:27` fails only on the Turbopack **dev** server (the on-demand chunk is
  the library chunk and contains the metadata marker there); against the **production** build the whole file passes 14/14 with the assertions
  unchanged. The other failure (`:138`, "Response has been disposed") did not reproduce in this pass (production 14/14; dev run 333 pass, 1 fail = `:27`).

## Suggested rollout order (nothing has been done in production)

1. CRM first (it ignores nothing the old website sends; the new key and honeypot behaviour are additive): deploy, run the DB integration suite, restart.
2. Website second (sends `submissionId`; works against an old CRM as before).
3. Set nothing new: `DISABLE_IN_PROCESS_POLLER` is optional; `CRON_SECRET` is already required by `compose.yaml`.

## Git state

Read-only access only. Website-updated: branch `work/website-crm-api-integration`, nothing staged, index untouched. CRM-updated: branch
`work/commission-salesboard-notes-ui`, `MERGE_HEAD c6b8d8e` still present, 79 staged entries and the one stash unchanged, index file unchanged
(`package.json`/`package-lock.json` keep their staged versions; only their working-tree copies changed). Observation, not touched: the **original**
`compass-tools/.git/config` has been zero-filled since 2026-10-21, so git commands there fail with "bad config line 1".
