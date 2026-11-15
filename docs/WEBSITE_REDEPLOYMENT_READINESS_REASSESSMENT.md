# Website redeployment readiness: reassessment

Date: 2026-11-13. No deployment, VPS, database or Cloudflare action was taken. "Local verification" is separated from "production compatibility" throughout.

## Decision

**NOT READY FOR REDEPLOYMENT.** The code-level IP/location problem is fixed and verified locally, but several earlier blockers are still open and some can only be closed by the owner. Redeployment review can start once the owner decisions below exist.

## Status of the earlier blockers

| # | Blocker | Status | Evidence / what is needed |
|---|---------|--------|---------------------------|
| 1 | Deployment branch unknown | **OPEN, owner decision** | Remote heads: `main` 40113cb, `feature/vps-website` 10fe079, `feature/api-only-crm-integration` 62274d3, `work/website-crm-api-integration` 3d68d0f. The repository does not record which one the VPS runs. Needed: the exact branch/commit that is live. |
| 2 | New required `CRM_API_KEY` and `CRM_COMPANY_ID` | **OPEN, owner action** | `compose.yaml` requires `CRM_API_KEY` (`:?`) and the env example lists `CRM_COMPANY_ID`. The existing production `.env` must gain them, with the key equal to the CRM's `WEBSITE_API_KEY`. `LEAD_INGEST_SECRET` is optional but now needed for contact IP/location. Values are not in the repos and were never read or printed. |
| 3 | Docker network layout | **OPEN, unverified** | Compose expects two external networks (CRM API network, tunnel network) that the CRM project owns. Names and the `compass-crm:3000` alias can only be checked on the VPS. |
| 4 | CRM must serve `/api/v1/website/flight-inquiries` | **OPEN, unverified** | Route exists in the CRM working tree (modified by another session, test incomplete). Not known to be deployed. |
| 5 | Preflight rejects `DATABASE_*` | **OPEN, conflicts with existing `.env`** | `deploy/preflight.sh` line 42 refuses `DATABASE_URL`, `DIRECT_URL`, `DATABASE_SSL_*`, `DATABASE_AUTO_INIT`. If the live `.env` still has them (the older website used a database), preflight fails. The preservation brief forbids editing the live `.env` unasked: the owner must decide how to handle it. |
| 6 | Docker build unverified | **OPEN** | Docker is not installed here. The standalone Next.js build succeeds (exit 0) but the image build was never run. |
| 7 | Legal pages not attorney reviewed | **OPEN, owner/legal** | See below; contact IP/location is not disclosed yet. |
| 8 | Intermittent phone-validation test | **OPEN** | Not re-run in this pass; previously seen to flake under memory pressure. |
| 9 | Line-by-line file review incomplete | **OPEN** | Targeted review done for the changed files only. |

## New or changed in this pass

* Contact IP/location capture implemented and verified locally (see `WEBSITE_CONTACT_IP_GEOLOCATION_END_TO_END_VERIFICATION.md`).
* New env variable use: `LEAD_INGEST_SECRET` now also gates contact capture. `TRUSTED_PROXY=cloudflare` is already set by `compose.yaml`.
* No migration. No new dependency. No Docker/compose change.
* Privacy gap: the policy mentions IP/location capture for flight requests only; contact messages are now covered by the code. Needs attorney-reviewed wording before redeployment, or the secret must stay unset until it exists.

## Preservation requirements (still binding)

Reuse the existing `.env`, never touch PostgreSQL, the CRM, Cloudflare or volumes, replace only the website image, take a backup and a verified rollback first, and obtain explicit user approval before any deployment. None of that was done or needed in this pass.

## Verification summary (local)

Build exit 0 (standalone). Infrastructure e2e: 103 passed, the single failure fixed and re-run. Unit: 14 and 43 passed. `tsc` and `eslint` clean. Browser-project (Desktop Chrome and mobile) full regression: not repeated in this pass.

---

## Reassessment, 2026-11-15 (supersedes the status column above where it differs; the 2026-11-13 text is kept as history)

### Two separate conclusions

* **Technical website release readiness: READY WITH LIMITATIONS.** The source is complete against the original, builds, and passes the local suites; the limitations are things that cannot be tested here (Docker, a real CRM, real Cloudflare headers, manual accessibility review).
* **Production redeployment readiness: NOT READY.** Not because of a code defect but because of open decisions and unverifiable production facts, listed below. No deployment is authorised and none was made.

### Categories

| | Category | Status | Why |
|---|---|---|---|
| A | Source completeness | PASS WITH LIMITATIONS | 23 route files and `public/` identical to the original; the 103 files missing are the removed database layer (`WEBSITE_ORIGINAL_VS_UPDATED_STRUCTURE_AUDIT.md`). Not compared side by side against a live original |
| B | Functional readiness | PASS WITH LIMITATIONS | Browser projects 1391 passed, 1 harness failure fixed (252 of 252 after), 8 conditional skips; Infrastructure 168 passed, 6 opt-in skips; all against stand-in CRMs |
| C | CRM integration readiness | PASS WITH LIMITATIONS locally, NOT VERIFIED against the deployed CRM | Contract consistent with the CRM source; which CRM version is live is unknown; live contract tests not run |
| D | Security readiness | PASS WITH LIMITATIONS | 0 production advisories, no secret in the repo or in browser bundles, IP trust and signing verified; open: the visitor context is not body-bound and has no nonce (documented, needs a joint change), Cloudflare trust is network-based |
| E | SEO and accessibility readiness | PASS WITH LIMITATIONS | 218 routes crawled with 0 failures; JSON-LD valid with resolving `@id`s; axe clean; no manual screen-reader or visual review |
| F | Build and runtime readiness | PASS WITH LIMITATIONS | Standalone build exit 0 (first attempt); standalone server suites green; **Docker image build NOT RUN (blocked)** |
| G | Deployment configuration readiness | BLOCKED | The preflight and the live `.env` conflict was resolved with an explicit opt-in (below); the live network layout, CRM alias, variables and CRM version are VPS-side and NOT VERIFIED; the documented live single-network layout fails the preflight's no-`db` rule by design |
| H | Legal readiness | BLOCKED | No attorney review; privacy text corrected for the contact form's IP/location but unreviewed; the proposed quote-button text and its policy link were not published and need review (`WEBSITE_PRIVACY_AND_CONSENT_READINESS_REVIEW.md`) |
| I | GitHub release readiness | PASS WITH LIMITATIONS | Safe for a **review branch**; the deployment branch is unknown, so no claim about the live branch (`WEBSITE_GITHUB_RELEASE_REPORT.md`) |

Legal readiness is kept separate from technical readiness on purpose.

### Status of the earlier blockers

| # | Blocker | Now |
|---|---|---|
| 1 | Deployment branch unknown | **Deployment branch: NOT VERIFIED - USER CONFIRMATION REQUIRED.** No CI or workflow files, no release record, and the deployment doc names no branch; four remote branches exist |
| 2 | `CRM_API_KEY`, `CRM_COMPANY_ID` newly required | Open, owner action on the live `.env` (names only in the environment audit) |
| 3 | Docker network layout | Open, VPS-side; documented conflict with the live single network |
| 4 | CRM must serve the flight endpoint | Open, VPS-side |
| 5 | Preflight rejects `DATABASE_*` | **Addressed in code**: default unchanged, explicit per-run opt-in `PREFLIGHT_ALLOW_LEGACY_DATABASE_VARS=yes`, tested; owner chooses how to use it |
| 6 | Docker build unverified | Open (Docker not installed here) |
| 7 | Legal pages not reviewed | Open (owner / counsel); wording corrected technically, not legally |
| 8 | Intermittent phone-validation test | **Resolved**: two test-harness races fixed; 252 of 252 repeated runs pass; no product defect |
| 9 | Line-by-line review incomplete | Narrowed: the changed files and the contact path were read in full in this pass; the whole tree was compared by content with the original, not read line by line |

### Remaining blockers for production redeployment

1. Which branch/commit is live (owner).
2. The live `.env` needs the new variables; the legacy `DATABASE_*` decision (owner).
3. The CRM version and the Docker network layout on the VPS (owner, VPS-side).
4. Attorney-reviewed privacy, cookie and terms text; approved quote-button wording and policy URL (owner).
5. A Docker image build and a rollback rehearsal on a machine with Docker (owner / VPS).
6. Only after approval: the redeployment itself, following the preservation requirements.
