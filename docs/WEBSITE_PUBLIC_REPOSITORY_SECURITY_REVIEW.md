# Public repository security review

Date: 2026-11-15. The GitHub repository `jasurkhonazizkhonov-source/Business-Flights-Travel-Website` is **public** (confirmed from the unauthenticated GitHub API: `private: false`). The brief names the repository `Travel-Agency-Website`; **that repository does not exist** (HTTP 404). The real one is `Business-Flights-Travel-Website`, which is where the review branch (`review/website-parity-and-contact-ip-2026-11-15`, commits `ab5f6b0` and `d9942ec`) lives. This review contains no secret, no customer data, no full visitor IP and no server address.

## 1. State of the published repository (re-checked, not assumed)

* Remote heads (read from GitHub): `main`, `feature/vps-website`, `feature/api-only-crm-integration`, `work/website-crm-api-integration` and the review branch, which still ends at `d9942ec`. Local review branch 0 ahead, 0 behind. No new commits, no change to the published commits.
* Two open pull requests exist: #1 `feature/api-only-crm-integration` into `feature/vps-website`, and #2 `work/website-crm-api-integration` into `feature/api-only-crm-integration`. Neither targets `main`. (Context only; nothing was opened, merged or changed.)
* GitHub reports **no check runs and no commit statuses** for `d9942ec` (the repository has no workflow files). **Security alerts (Dependabot, secret scanning) could not be read**: they require authentication, which was not used.

## 2. Search of all published history (every commit on every remote branch, 64 commits)

| Item | Result |
|---|---|
| Credentials (private keys, cloud and service tokens, API keys, `postgres://user:password@` URLs with real-looking passwords) | **None.** The only matches are test fixtures with fake values (`u:p%40evil.example.com@db`, `x:y@db`) |
| Environment files | None tracked in any branch (`.env` is ignored; only `.env.example` and `.env.vps.example` with placeholders) |
| Public (routable) IPv4 addresses | **One**: the VPS address, introduced by a single commit (`cd7fe8a`, "VPS website: join compass-tools_internal as bft-web ...") and therefore present on `feature/vps-website`, `feature/api-only-crm-integration`, `work/website-crm-api-integration` and the review branch; **not on `main`**. All other addresses are documentation, loopback, private or test addresses |
| E-mail addresses | The company's own (`info@`, and the older `request(s)@`), test fixtures (`example.com`, `example.org`, `example.invalid`, `evil.com`, `b.com`) and an example database host name pattern. **No personal e-mail address** in any published branch. (A personal address does exist inside the unpublished, untracked `docs/workspace-archive/`, which was excluded from every commit on purpose) |
| Customer data, full visitor IPs | None: tests use documentation addresses (`203.0.113.x`, `198.51.100.x`) and well-known public resolver addresses as fixtures |
| Build output, `node_modules`, test results | Not tracked |

## 3. Operational information published in documentation

`docs/DEPLOYMENT_VPS.md` and related files describe: the hosting provider (OVH) and operating system version, the Docker network names (`compass-tools_internal`, `compass-tools_web`, `compass-tools-website-api`), the service and alias names (`bft-web`, `compass-crm`, `app`, `db`), the use of a remotely managed Cloudflare Tunnel with no public ports, the deployment layout under the server's home directory, and the existing hostname `compass-tools.com` (already public). It states that the tunnel token is **never** read, printed or rotated by the repository; no token is present. These details have a legitimate purpose for the operator (the preflight uses the same names), are not credentials, and mostly describe an internal design; but they reduce an attacker's guesswork.

### Is the server address necessary in public documentation? No.
It is not used by any script or test (the scripts read network and container names, never the address) and every operational step that needs it is done by the owner who has it.

## 4. Change made in this pass (working tree only, **not committed, not pushed**)

`docs/DEPLOYMENT_VPS.md`: the table row that gave the VPS address now says the address is deliberately not written in the public repository, and the home-directory path now reads `~/apps/...` instead of the server's account name. Useful instructions were kept. **This removes the address from the current files only.** It remains in the history of the four branches listed above, and **will stay on the published review branch until a further commit is pushed, which needs your separate approval** (the instructions say so, and none was made).

## 5. What deleting it does not do, and what to consider

* Deleting a value from the latest commit does not remove it from the public history: anyone can read the commit `cd7fe8a`. **No history was rewritten and none should be attempted without a decision** (it would require rewriting four published branches and force-pushing).
* A server address is not a secret in the sense of a credential, and the host reportedly has public ports 80 and 443 closed with all web traffic through a Cloudflare Tunnel; so the practical risk is limited to scanning and targeted probing of that host. **Recommended, outside this repository and not done by me:** check that the host's firewall exposes only what is intended (SSH hardening, fail2ban or equivalent), and consider whether the address should be treated as already public. If the owner wants it removed from history, that is a separate, explicit decision.
* No secret was ever committed, so **no rotation is recommended by this scan**. (Rotation was not and would not be performed by me.)

## 6. Other findings that touch the public repository

* The reports in `docs/` describe weaknesses (for example the unauthenticated contact route, the replay window, the in-memory rate limiter, the CSP `unsafe-inline`). Publishing an honest security audit has value, but those paragraphs are also a map for an attacker. If that is a concern, keep audit reports in a private location and keep only user-facing documentation in the public repository. Not changed.
* `docs/UPDATED_PROJECT.md` and other reports contain local workspace paths (`F:\Claude Workspace\...`). Harmless, but not useful to the public.
* The repository has **no CI**, so nothing prevents a future commit of a secret; adding an automated secret scan (for example a repository-hosted scanner) is a recommendation for the owner and was not added (a new workflow file is a configuration change that needs approval).


---

## Re-run (third pass, 2026-11-15)

Repeated against the current remote state. Remote heads unchanged (`main` 40113cb, `feature/vps-website` 10fe079, `feature/api-only-crm-integration` 62274d3, `work/website-crm-api-integration` 3d68d0f, the review branch at d9942ec); 64 commits scanned.

| Check | Result |
|---|---|
| Routable IPv4 addresses in published history | **One** (the VPS address, introduced by a single commit, present on four branches, not on `main`). Unchanged. Not written in any report |
| Credential patterns in published history | Only obvious fixtures (`secretpassword123`, `hunter2`, `s3cr3tPass`, `pg-example` host names) in database-TLS tests of the previous release: fake values, not credentials |
| Personal e-mail addresses in published history | **None** |
| Working tree (what a commit would publish) | 49 files; **no** secret, no personal address, no server address. New fixtures (`rehearsal-*`, `known-answer-secret-*`) are labelled throw-away values used only by tests and the rehearsal |
| Server address in the CURRENT files | **Removed** from `docs/DEPLOYMENT_VPS.md` (working tree only, uncommitted); still in published history and on the published review branch |
| Internal topology in public docs | Docker network and service names (`compass-tools_internal`, `compass-tools_web`, `compass-tools-website-api`, `bft-web`, `compass-crm`) remain in deployment docs and the new runbook; they are design names, not credentials. Consider whether the audit reports (they describe weaknesses) belong in a public repository |
| GitHub security alerts | Still **not readable** without authentication (HTTP 401) |
| Another company's name (named in the proposed disclaimer text) | **0 occurrences** in the whole website tree after this pass, including tests and reports |

No history was rewritten, nothing was pushed, nothing was committed. Minimal remediation if you want the address gone from history is a separate decision (it needs rewriting four published branches and a force-push; not recommended without a clear need).
