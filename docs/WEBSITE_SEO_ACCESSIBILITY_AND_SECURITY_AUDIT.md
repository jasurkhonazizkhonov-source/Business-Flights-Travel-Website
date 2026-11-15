# Website SEO, accessibility and security audit

Date: 2026-11-15. Scope: the updated website's working tree, tested as a production build on its assigned port 3101 (a temporary `next start -p 3101`, stopped afterwards) and as the standalone build in the Infrastructure suites. Historical results from earlier sessions are labelled as such. "New" means run in this pass.

## 1. SEO

| Item | Result | Evidence (new, 2026-11-15) |
|---|---|---|
| Titles, descriptions, canonical URLs | PASS | Nine representative pages (home, contact, about, flights, blog index, a blog article, destinations, privacy, terms) each have one `<title>`, a description, one canonical on the `https://www.businessflights.travel` host and exactly one `<h1>` |
| Live crawl of every route | PASS | `node scripts/validate-seo.mjs` against the production build: 218 routes (11 static, 171 destinations, 36 articles), **0 failures**; sitemap 218 unique URLs, all on the canonical host; `robots.txt` checked |
| `robots.txt` | PASS | `User-agent: *`, `Allow: /`, `Disallow: /api/`, `Sitemap:` pointing to the canonical sitemap |
| JSON-LD validity | PASS | Every `ld+json` block on those pages parses (0 bad blocks); all `@id` references resolve (0 unresolved) |
| Shared `@id` graph | PASS | TravelAgency (`/#organization`), WebSite (`/#website`, publisher by `@id`) and Article publishers point at one organisation |
| Company details in structured data | PASS | TravelAgency: telephone `+14155709267`, email `info@businessflights.travel`, address 350 Sansome St, San Francisco, CA 94104, US |
| No invented business facts | PASS | No `priceRange`, `aggregateRating`, `review`, award or credential in the organisation markup. (The footer's five green stars next to "Trustpilot" were replaced by a neutral icon earlier because no rating is verified.) |
| JSON-LD serialiser | PASS | All five injection sites use `jsonLd()` (escapes `<`); there is no other `dangerouslySetInnerHTML` in `src/` |
| Open Graph, Twitter, manifest, `brand-mark.png` | PASS (unchanged by this pass) | Route files identical in both trees; covered by `tests/seo.spec.ts` (35 tests per viewport) |
| `poweredByHeader: false` | PASS | No `X-Powered-By` header on a live response (the earlier CRM report could only claim this from config; here a live response was inspected) |
| Redirects | PASS | apex to `www` 308 and three retired article URLs, unchanged; covered by `tests/seo.spec.ts` |
| Not-found handling | PASS | 404 page covered by `accessibility.spec.ts` and `seo.spec.ts` |
| Lazy reveal | PASS | `Reveal` renders content visible from first paint and fades only below-the-fold blocks (`tests/redesign.spec.ts`, `design-integrity.spec.ts`) |

Not checked: real search-engine behaviour, Search Console and PageSpeed field data (not available offline); these are not claimed.

## 2. Accessibility

New run, production build, 4 projects (Desktop Chrome, Mobile 320, 375, 390), `--workers=2 --retries=0`: **1391 passed, 1 failed (a harness flake, fixed, see below), 8 skipped (viewport-conditional: no hamburger on desktop, touch check once, three-column layout from `lg`)** of 1400.

* `accessibility.spec.ts` (29 per project): axe has no automatically detectable violations on every page type including the 404; skip link is the first focus stop; primary navigation, mobile menu (Escape closes it), airport autocomplete and the date picker are keyboard operable; reduced motion collapses animations.
* `design-integrity.spec.ts`: WCAG 2.4.11 focus not obscured, contrast, no horizontal scroll.
* Forms: labels and error wiring (`aria-invalid`, `aria-describedby`) asserted in `phone-validation-loading.spec.ts`, `form-failure-recovery-e2e.spec.ts`, `contact-form-autocomplete.spec.ts`.
* Automated tools find a subset of problems; no screen-reader session was run. **Screen-reader behaviour: NOT VERIFIED manually.**

The one failure was a test-harness race, not a product defect. `phone-validation-loading.spec.ts` (a) installed a route handler without error handling that Playwright reported as "route.fetch: Test ended" when a chunk request was still in flight, and (b) clicked "submit" on the server-rendered form before React had attached its handlers (a native submission, a reload) in the three "submit before the library has loaded" tests. Both are fixed in the spec only (error guard plus `unrouteAll`, and a hydration wait). After the fix the spec passed **252 of 252** (Desktop Chrome, Mobile 320, Mobile 390, 6 repeats each); before the fix it had failed once in the 1400-test run and once in a 112-test repeat run. The pre-hydration native submission is harmless to privacy: no input has a `name` attribute, so nothing is put in the URL.

## 3. Security

### Verified (new, from the repository and the local suites)

| Area | Result |
|---|---|
| Secrets in browser bundles | None. `.next/static` contains none of `LEAD_INGEST_SECRET`, `CRM_API_KEY`, `GMAIL_APP_PASSWORD`, `x-ct-visitor`, `cf-connecting`. The credentials module imports `server-only`; a structural test fails if client code imports it |
| Secrets in the repository | None found by pattern scan of the diff and new files; `.env` is ignored and untracked; no `.env` file exists in the working tree |
| Dependencies | `npm audit --omit=dev`: **0 vulnerabilities**. `npm audit` (all): 7 moderate, all in the `@typescript-eslint`/`minimatch` development toolchain (not shipped); a fix is available |
| Security headers | CSP, `X-Content-Type-Options`, `X-Frame-Options: DENY`, Referrer-Policy, Permissions-Policy, HSTS (2 years, preload) present on a live response |
| Visitor IP trust | Cloudflare headers are read only with `TRUSTED_PROXY=cloudflare`; otherwise forged forwarding headers are ignored (`contact-visitor-context.spec.ts`, `crm-api-actions-e2e.spec.ts`, `submission-ip.spec.ts`) |
| Logging | The contact and flight actions log fixed tags only; no IP, location, message, name or CRM reply text (structural test asserts the client never logs the key, the body or the CRM text) |
| Input validation | Server-side schemas for all three forms; honeypot plus minimum fill time; Server Action body capped at 64 KB (tested) |
| Unsafe redirects, SSRF | No user-controlled redirect or outbound URL exists: the only outbound call is to the configured `CRM_API_URL`, validated as an http(s) origin without credentials, path or query |
| Whole-call failure handling | A dropped connection, timeout, HTTP 4xx/5xx or malformed reply is an inline message, nothing is retried automatically and no success is claimed (`safe-action.spec.ts`, `form-failure-recovery-e2e.spec.ts`) |
| Duplicate submissions | Flight: `Idempotency-Key`; contact: `submissionId`; double click and resend tested against the stand-in CRM |

### Limitations and risks that need your decision (none was changed)

1. **The signed visitor context is not bound to the request body and has no nonce.** The CRM accepts it for 300 seconds. Someone who could capture the two headers on the private network could attach them to another body within that window. Binding the signature to a body hash needs a change on both sides (the CRM verifier too), so it is documented here for separate approval, not changed. Exposure is limited by the private Docker network and the short window.
2. **Cloudflare trust is network-based, not cryptographic.** It holds only if the origin is reachable exclusively through the tunnel (compose publishes no port). A reachable origin would let a client forge `CF-Connecting-IP`.
3. **The contact endpoint on the CRM is unauthenticated by design** (`docs/CRM_API_INTEGRATION.md`); abuse protection on that route rests on the website's rate limiter and the CRM's own.
4. **The rate limiter is in memory**, per instance, and resets on restart; adequate for the single-container deployment, not for several instances.
5. **CSP allows `'unsafe-inline'` for scripts and styles** (Next.js inline bootstrap and styles). A nonce-based policy is a separate project.
6. A server address appears in `docs/DEPLOYMENT_VPS.md`. It was already published on `origin/feature/vps-website`; it is not in `origin/main`. Consider whether that file should go to a public repository (the repository's visibility was not checked: the GitHub CLI is not installed).
7. The CRM-side items belong to the CRM report: its Vitest configuration also picks up `.next/standalone` test copies (needs `exclude` of `.next/**`); the CRM was not modified.
