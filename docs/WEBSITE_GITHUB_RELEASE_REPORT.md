# Website GitHub release report

Date: 2026-11-13. Repository: `https://github.com/jasurkhonazizkhonov-source/Business-Flights-Travel-Website` (shared `origin` for both website checkouts).

## Decision

**NOT READY FOR GITHUB PUBLICATION.** No commit was made and nothing was pushed in this pass. No remote was changed, no force-push, no branch was created or deleted.

## Why (publication conditions)

| Condition | Result |
|-----------|--------|
| Exact deployment branch established | **FAILED.** The repo does not record it. Remote heads: `main` 40113cb, `feature/vps-website` 10fe079, `feature/api-only-crm-integration` 62274d3, `work/website-crm-api-integration` 3d68d0f. Pushing to a guessed branch could overwrite or confuse the live line. |
| Working tree is exactly this task's work | **FAILED.** The tree holds many earlier uncommitted modifications (README, legal page, forms, validations, tests, docs) and untracked reports and workspace archives from earlier tasks, not only the IP fix. They would need separating and the owner's agreement. |
| No secrets | **PASSED.** A pattern scan of the diff and new files found none; `.env` is git-ignored and not tracked. |
| Local branch relative to remote | `work/website-crm-api-integration` local d1d1b61 is 6 ahead and 0 behind `origin`, so a plain fast-forward push would be technically possible. Not done, because of the failed conditions above. |
| Legal pages | **FAILED.** Not attorney reviewed; contact IP/location not yet disclosed (see the verification report). |
| Production verification | Not possible locally (Docker, PostgreSQL, real Cloudflare, VPS). |

## Git facts recorded

* Branch `work/website-crm-api-integration`, HEAD d1d1b61, nothing staged, index unchanged by this work.
* Unpushed local commits: d1d1b61, ceb7534, 46e7055, 7d99b4a, c7e2263, 08ddb05.
* LF/CRLF warnings appear for `src/lib/crm-api/config.ts` and `tests/date-range.spec.ts` when diffing; no content effect.

## CRM repository (observed, not done by this pass)

Late in this pass the CRM checkout changed under me: its unfinished merge was concluded and committed, and branch `review/crm-verification-2026-11-13` (tip 4bcfb28) now exists on the CRM remote, with `main` untouched at 5a77976. That was done by a separate CRM session; this pass made no CRM commit and no CRM push. The commit 3dee7fc on that branch contains my CRM edits for the source label (`lead-ingest-context.ts`, `inquiry-submission-info.ts`, `lead-submission-info.ts` and the new test). The CRM's own report is `docs/CRM_GITHUB_RELEASE_REPORT.md` in the CRM project; I did not alter it.

## What the owner must decide

1. Which branch is deployed (or which should become the release branch).
2. Whether the earlier uncommitted work should ship with the IP fix, or be committed in separate steps.
3. Attorney-reviewed privacy wording covering contact messages.

Once these are answered, publication is a normal non-force push of a reviewed commit set to the named branch.

---

## Update 2026-11-15: review-branch release

**Decision: READY FOR GITHUB REVIEW BRANCH (not a release to `main`, not a claim about the live deployment branch).** The earlier decision above (NOT READY, 2026-11-13) stands for the deployment target; what changed is that the technical checks now pass, the scope could be separated, and the instructions allow "a clearly named review branch if it is safe".

### Conditions

| Condition | Result |
|---|---|
| Correct repository and remote | PASS. `origin` (fetch and push) is `https://github.com/jasurkhonazizkhonov-source/Business-Flights-Travel-Website.git`; no other remote |
| Current branch and tracking | `work/website-crm-api-integration`, HEAD d1d1b61, tracks `origin/work/website-crm-api-integration` (3d68d0f), 6 ahead, 0 behind. No merge or rebase in progress, no stash, nothing staged before this step |
| Intended release branch | **New** branch `review/website-parity-and-contact-ip-2026-11-15`, created from d1d1b61. It does not exist on the remote (remote heads read first: `main` 40113cb, `feature/vps-website` 10fe079, `feature/api-only-crm-integration` 62274d3, `work/website-crm-api-integration` 3d68d0f), so nothing can be overwritten |
| Live deployment branch | **NOT VERIFIED - USER CONFIRMATION REQUIRED.** No CI files, no workflows, no release record, no branch named in the deployment docs |
| Every changed file inspected | PASS for the 57 files in the release set (27 modified tracked files, 30 new files); classified in the structure audit |
| No secrets, `.env`, customer data, build output | PASS. Pattern scan of all 57 files found none; the only addresses are fake test fixtures and the company's own; `.env` is ignored and absent; `.next/` and `test-results/` are ignored |
| Existing user work preserved | PASS. Nothing was deleted or reset; the original local branch keeps d1d1b61; the excluded files stay in the working tree untouched |
| Unrelated or ambiguous work separated | PASS. **Excluded and left untracked:** `docs/workspace-archive/` (79 historical files: old reports, patches, scripts, one containing a personal e-mail address) and `docs/brand-assets/` (3 design reference images, 1.6 MB). Neither belongs to the website release |
| Existing GitHub history untouched | PASS. Plain push of a new branch; no force, no history rewrite, `main` untouched; nothing pushed to `work/website-crm-api-integration` |
| Reports match the final source | PASS for everything except this report's own commit hash, which cannot be inside the commit that it describes (recorded in the final message and, after the push, in the addendum below) |

### What the release set contains

* **Product and deployment code:** privacy-policy sentence; `deploy/preflight.sh` (explicit opt-in for legacy database variables); the contact form's signed visitor context (`client.ts`, `config.ts`, `visitor-context.ts`, `submit-contact-message.ts`); the form and validation changes of the earlier approved passes that were still uncommitted (`ContactForm`, `FlightRequestForm`, `NewsletterForm`, `PhoneNumberField`, `safe-action`, `phone-validator`, `QuoteConsentNotice`, validations, `next.config.ts`, `package.json`).
* **Tests:** new and updated specs and the stand-in CRM.
* **Documentation:** the audit and verification reports in `docs/`, `docs/DEPLOYMENT_VPS.md` (the opt-in is documented), `docs/LEGAL.md`, `docs/CRM_API_INTEGRATION.md`, `README.md`.

### Not done and not claimed

* No pull request was opened, nothing was merged, nothing was deployed.
* No CI exists in the repository, so none was triggered and there is no CI result.
* The CRM repository was not touched by this task.
