# Redeployment blockers and required approvals

Date: 2026-11-15. **Production redeployment readiness: NOT READY.** **Website-to-CRM integration readiness: READY WITH LIMITATIONS.** Nothing was deployed, restarted or changed in production. Each item below says what is known, what is not, and exactly what is needed. Items marked **[YOU]** need a decision or an action only the owner can take; **[APPROVAL]** items are things I can do once you approve.

## 1. The fourteen items from the brief

| # | Item | Status | What is needed |
|---|---|---|---|
| 1 | Live deployment branch | **NOT VERIFIED - USER CONFIRMATION REQUIRED.** The live site matches `feature/vps-website`'s public fingerprint and open PR #1 targets that branch, but no record proves it | **[YOU]** tell me the branch (or the deploy mechanism: a `git pull` on the server, a Docker tag, a copy) |
| 2 | Live CRM version | **NOT VERIFIED.** It is older than the updated CRM source (its anonymous health still exposes database and pool details); it has the three website routes registered | **[YOU]** the deployed CRM commit or branch, or **[APPROVAL]** a separately approved, clearly labelled production test inquiry |
| 3 | Live CRM endpoint | Reachable, healthy, routes registered; **authentication and a real submission NOT VERIFIED** | as item 2 |
| 4 | Website-to-CRM Docker network | **NOT VERIFIED**; the documented live layout is one shared network with PostgreSQL, which the preflight rejects (correctly) | **[YOU]** choose Option A or B in `WEBSITE_PRODUCTION_DOCKER_NETWORK_AUDIT.md`; either is a production change that needs your approval and a maintenance window |
| 5 | CRM hostname and alias | **NOT VERIFIED** (documents disagree: `compass-crm` in the release layout, `app` in the live layout) | **[YOU]** read-only `docker network inspect` (aliases only) on the VPS, or authorised read-only access for a session; preflight does it read-only |
| 6 | Required production variables | Names known (website: `CRM_API_URL`, `CRM_API_KEY`, `CRM_COMPANY_ID`, `GMAIL_SENDER_EMAIL`, `GMAIL_APP_PASSWORD`, optional `LEAD_INGEST_SECRET`; CRM: `WEBSITE_API_KEY`, `WEBSITE_API_COMPANY_ID`, `LEAD_INGEST_SECRET`); presence and equality **NOT VERIFIED** | **[YOU]** confirm by name (never value) that both sides are set and equal |
| 7 | `LEAD_INGEST_SECRET` | **Recommendation: keep it unset until the privacy wording is reviewed**, then enable on both sides together. Unset: leads and inquiries are created without IP or location and the privacy sentence over-states. Set: IP and approximate location recorded for flight **and** contact requests | **[YOU]** decide; I did not and will not enable it |
| 8 | Legacy `DATABASE_*` and the preflight opt-in | The previous release needs `DATABASE_URL` in `.env` (its compose requires it); the new preflight refuses it by default. Opt-in `PREFLIGHT_ALLOW_LEGACY_DATABASE_VARS=yes` (shell only) is safe and necessary **only** for the first redeploy and the rollback window | **[YOU]** decide to use it, or to move the legacy variables out (which breaks a rollback to the previous image) |
| 9 | Is the CRM reachable from the website container | **NOT VERIFIED** (no container access) | covered by item 5; preflight checks it |
| 10 | Docker build | **NOT RUN** (Docker not installed here) | **[YOU]** run `docker compose build` on a machine with Docker and at least 3 GB of builder memory, or approve installing Docker locally (I did not install anything) |
| 11 | Rollback rehearsal | **NOT RUN** | after item 10, on the VPS or a copy: the scripts exist (`deploy/rollback.sh`) and are tested against a fake docker only |
| 12 | Attorney approval of privacy and consent wording | **OUTSTANDING.** No wording was changed in this pass; the contact form has no privacy pointer; the proposed quote text must not be used as written | **[YOU]** counsel review; give me the approved text and URL and it is a one-line change |
| 13 | Replay protection and body binding | **OPEN; needs CRM changes** (contract v2 proposed; no migration needed) | **[APPROVAL]** a separate CRM task to implement and test it, then a website task |
| 14 | Public documentation and infrastructure information | The server address and account path were removed from the working tree only; the published branch and history still contain the address | **[APPROVAL]** to commit and push `DEPLOYMENT_VPS.md` (and the other changes below); **[YOU]** decide whether history rewriting is wanted (not recommended) |

## 2. Other findings that need your decision

* **The brief names a repository that does not exist** (`Travel-Agency-Website`, HTTP 404). The real repository is `Business-Flights-Travel-Website`. I used it. If another repository is intended, tell me; nothing was pushed anywhere.
* **Two open pull requests** (#1 into `feature/vps-website`, #2 into `feature/api-only-crm-integration`) target feature branches, not `main`. How the release is meant to reach the deployed branch is your decision.
* **Keep audit reports out of the public repository?** They list weaknesses (see the repository review).
* **Contact form privacy pointer**: add a neutral "See our Privacy Policy" link under the send button? Text and placement are yours.
* **The CRM's per-IP limiter does not throttle website traffic.** A CRM change would be needed to forward and trust a client key; separate approval.
* **No storage when the CRM is down** is by design; decide whether an outbox is ever wanted (it would need storage).

## 3. Uncommitted work in the website working tree (nothing committed or pushed in this pass)

Reviewable diff: `git diff` plus the seven new files.

| File | Change |
|---|---|
| `deploy/preflight.sh` | database-isolation rule now image- and name-aware (10 lines) |
| `tests/deploy-scripts.spec.ts` | new boundary tests; one expectation updated for the new message |
| `tests/crm-api-actions-e2e.spec.ts` | three new failure and wrong-settings end-to-end tests |
| `docs/DEPLOYMENT_VPS.md` | server address and account path removed |
| `docs/WEBSITE_CRM_API_INTEGRATION_VERIFICATION.md`, `docs/WEBSITE_ENVIRONMENT_AND_DEPLOYMENT_CONFIGURATION_AUDIT.md` | newsletter route name corrected, erratum |
| `docs/WEBSITE_LIVE_CRM_ENDPOINT_VERIFICATION.md`, `..._PRODUCTION_DOCKER_NETWORK_AUDIT.md`, `..._PRODUCTION_ENVIRONMENT_AND_PROCESS_AUDIT.md`, `..._REQUEST_SIGNING_AND_REPLAY_PROTECTION_AUDIT.md`, `..._PRIVACY_TERMS_AND_CONSENT_REVIEW.md`, `..._PUBLIC_REPOSITORY_SECURITY_REVIEW.md`, `..._CRM_FAILURE_AND_RETRY_TEST_REPORT.md`, `..._PRODUCTION_INTEGRATION_READINESS_REPORT.md`, this file | new reports |

Not included in any future commit unless you say so: `docs/workspace-archive/`, `docs/brand-assets/` (untracked, excluded on purpose). A further commit and push needs **[APPROVAL]**; it would go to the existing review branch as a normal fast-forward push (never `main`, never forced).

## 4. Suggested order once you decide

1. Tell me the deployed branch and CRM commit (items 1 and 2), or give a read-only look at the server.
2. Decide the network option (item 4); owner executes it in a maintenance window, then runs `deploy/preflight.sh` (with the opt-in if item 8 says so).
3. Counsel reviews the legal pages; I apply the approved text (items 7, 12).
4. Approve the CRM signing work (item 13) in its own task; the website follows.
5. Docker build and rollback rehearsal (items 10, 11).
6. Only then, a **separately approved** redeployment following the preservation requirements (existing `.env`, website image only, backup and verified rollback first).
