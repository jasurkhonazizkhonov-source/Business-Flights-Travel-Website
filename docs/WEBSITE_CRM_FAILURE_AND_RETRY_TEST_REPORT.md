# CRM failure, wrong-configuration and retry test report

Date: 2026-11-15. All results below are **local**: the production (standalone) build of the updated website against a **stand-in CRM** that enforces the CRM's published contract, with fake data (`tests/support/stub-crm.ts`, `tests/crm-api-actions-e2e.spec.ts`, `tests/crm-api-client.spec.ts`, `tests/form-failure-recovery-e2e.spec.ts`, `tests/safe-action.spec.ts`). Nothing was sent to a production CRM. Exact counts for the whole run are in `WEBSITE_PRODUCTION_INTEGRATION_READINESS_REPORT.md`. "Mock integration finding" means exactly that: it is **not** evidence about the live CRM.

## What the website does on failure (design, then tests)

| Behaviour | Where |
|---|---|
| Flight request: up to 3 attempts, only for failures the contract marks retryable (network error, timeout 10 s, 429, 500, 502 to 504, unreadable success reply), always the **same `Idempotency-Key` and the same bytes**; 400, 401, 403 and 409 are never retried | `client.ts`, `crm-api-client.spec.ts` |
| Contact and newsletter: **exactly one attempt**; the outcome after a timeout is unknown, so the visitor is told to try again; the repeat is safe because the contact message carries `submissionId` and the CRM answers `duplicate: true` | `client.ts`, e2e |
| No false success: only an acknowledged reply from the CRM yields success; everything else is a generic inline message; the typed form stays filled and the button works again | `safe-action.ts`, `form-failure-recovery-e2e.spec.ts` |
| Nothing is written anywhere else: no database, no queue, no file. **Consequence: when the CRM is unavailable the submission exists only in the visitor's open form.** For a flight request the internal notification e-mail is sent only after the CRM accepted it | source; structural tests |
| The server logs fixed tags and codes only: no key, secret, customer value, IP, or CRM reply text | e2e "the server log names fixed tags and codes only" |

## Scenario results (current run)

| Scenario | Test | Result |
|---|---|---|
| **A. CRM available**: flight success, mapped body, Bearer key, idempotency header; contact and newsletter with company in the body and no credential | `crm-api-actions-e2e` (flight success; contact; newsletter) | pass |
| **B. CRM unavailable (connection refused)**: all three forms give the friendly error; the flight request tries a bounded number of times (3) and stops within 30 s; the log says "could not be reached (network)"; no database or fallback mentioned | `crm-api-actions-e2e` ("the CRM is unreachable") | pass |
| **B. CRM hostname does not resolve (DNS failure)**: all three forms give the generic message in bounded time, never a success; the log names the failure class, not the host or any visitor value; `/api/health` still answers 200 afterwards | **new in this pass**, `crm-api-actions-e2e` ("does not resolve") | pass |
| **B. CRM slow or silent**: the call times out, the visitor stays on the page, nothing is retried automatically, no success claimed | `form-failure-recovery-e2e`, `safe-action` (12), client timeout tests | pass |
| **B. CRM server error / lost reply**: flight retried with the same key and body, visitor succeeds, **one lead**; reply lost after the CRM stored it: visitor still succeeds, one lead | `crm-api-actions-e2e` | pass |
| **B. CRM 400 / 401 / 403 / 409 / 429 / wrong reply shape**: generic message, one attempt, no retry (429 is retried for flights with the CRM's `Retry-After`), the key never shown | `crm-api-actions-e2e`, `crm-api-client`, `form-failure-recovery-e2e` | pass |
| **C. Missing `CRM_API_URL` / `CRM_API_KEY` / `CRM_COMPANY_ID`**: graceful errors, validation still works, the log names the **variable** once, never a value | `crm-api-actions-e2e` ("the CRM settings are missing") | pass |
| **C. Wrong company id** (a company the CRM does not know): contact and newsletter give the generic message once each, **nothing stored**, exactly one attempt each, the log says only that the CRM rejected (HTTP 400), the configured id is never logged | **new in this pass** | pass |
| **C. Invalid or different signing secret**: the website signs, the CRM does not believe the context (no IP, no location), the flight request itself still succeeds, no secret in the log; a short or missing secret sends no headers at all | **new in this pass** (and `contact-visitor-context`, `crm-api-client`) | pass |
| **C. Wrong internal port** (nothing listens): same as connection refused | `crm-api-actions-e2e` | pass |
| **C. Wrong `CRM_API_URL` shape** (credentials, path, query, non-http scheme) | `crm-api-client`, `contact-visitor-context` | pass |
| **Duplicates and concurrency**: double click, resend after a timeout, same submission from another network = one inquiry; a corrected message is a new one; same key with a changed form is refused (409) and the visitor is told to reload | `crm-api-actions-e2e`, `crm-api-client`, `form-failure-recovery-e2e` | pass |
| **Body size**: a 5 MB or malformed action body is refused before the action runs; the server stays healthy | `server-action-body-limit-e2e` (10) | pass |

## Findings

1. **No visitor submission is stored on the website when the CRM is down** (by design: no fallback write path). The visitor keeps what they typed and can retry; if they close the page the message is lost. This is a product decision, not a defect, but you should know it. A durable outbox would need storage, which the architecture deliberately does not have.
2. **A timed-out contact message may or may not have been stored**; the safe repeat (same `submissionId`) is what makes the visitor's "try again" harmless, **provided the live CRM supports `submissionId`** (NOT VERIFIED for the live CRM; an older CRM ignores the key and would store a second copy).
3. **The CRM's per-IP limiter does not apply to the website's server-to-server calls** (see the live endpoint report), so during a spam burst only the website's in-memory limiter protects the CRM.
4. The website's health check is liveness only; it stays green during a CRM outage on purpose.
5. **Known limitation of the internal flight e-mail** (documented in the source and in `docs/CRM_API_INTEGRATION.md`): the notification is sent only when the CRM reports the lead as newly **created**. If the CRM stored the lead but its reply was lost and the visitor pressed submit again (the CRM answers `duplicate`), no internal e-mail is sent for that lead. The lead exists in the CRM and its staff are notified there; only the website's own e-mail copy is missing. Fixing it needs a signal from the CRM, so it was not changed.

## Not tested (and why)

Real PostgreSQL behaviour of the idempotency locks (BLOCKED / NOT RUN: no approved disposable database); a real CRM or the live CRM (not allowed); a CRM restart under load; replayed, body-modified, company-modified or path-modified signed requests (the current protocol accepts them by design; tests belong with the v2 proposal); a Docker network with a real CRM container (Docker unavailable).
