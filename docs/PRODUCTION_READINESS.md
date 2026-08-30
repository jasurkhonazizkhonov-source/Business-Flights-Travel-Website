# Production Readiness Report — Business Flights Travel

Four passes, 2026-08-28 through 2026-08-30. This report is honest about what
was verified and how, and calls out what still needs a human decision or a
production-only step. It does not claim "everything is complete" — see
**Remaining Issues** at the end.

## Pass 4 — final launch audit, credential removal, deployment package (2026-08-30)

Two real, previously-undiscovered defects found and fixed, both verified
against the live database, not assumed:

- **Same-day departure dates were incorrectly rejected.** Reproduced live:
  selecting today's date in the flight-request form failed server-side
  validation with "Departure date cannot be in the past" — for the *current*
  date, submitted through the current date's own picker. Root cause: the
  server's `todayFloor()` built a `Date` from local wall-clock time, but
  compared it against `new Date(departureDateString)` — a bare `YYYY-MM-DD`
  string, which JavaScript parses as **UTC** midnight, not local midnight.
  On a server whose local timezone is behind UTC (confirmed via direct
  diagnostic: this machine resolves to `America/Los_Angeles`, UTC-7 — and
  the whole Western Hemisphere shares this class of offset), UTC midnight of
  "today" is *earlier* than that same day's local midnight, so every
  same-day submission compared as "in the past." Fixed in
  `src/lib/validations/flight-request.ts` by comparing two `YYYY-MM-DD`
  strings directly instead of `Date` objects — a pure calendar-date
  comparison with no timezone parsing involved at all. Verified: a same-day
  submission that failed before the fix now succeeds, confirmed both in the
  browser and by querying the resulting `Lead` row directly (correct
  `departureDate` stored, no off-by-one).
- **The project would have failed its first Vercel build.** `prisma/schema.prisma`
  uses Prisma 7's custom-output `prisma-client` generator
  (`src/generated/prisma`, gitignored — regenerated, not committed), which
  requires an explicit `prisma generate` step. `package.json` had no
  `postinstall` script and no generate step folded into `build` — a fresh
  `npm install` on Vercel would never have produced `src/generated/prisma`,
  and every import of it throughout the app would have failed the build.
  Added `"postinstall": "prisma generate"`. Separately, `prisma.config.ts`
  imports `dotenv/config` but `dotenv` was never a declared dependency —
  only present by transitive luck. Added it to `devDependencies` explicitly
  (pinned to the version already resolved, so nothing else changed). Both
  fixes verified for real: deleted `src/generated/prisma`, ran a completely
  fresh `npm install` in an isolated copy of the project (the launch
  folder), confirmed `postinstall` fired and regenerated the client
  correctly, then ran `next build` to a clean, successful exit — the exact
  sequence Vercel performs.
- **Discovered, and documented rather than "fixed" away:** `next build`
  itself requires `DATABASE_URL` to be set, not just runtime request
  handling — `src/lib/prisma.ts` fails fast at import time if it's missing,
  and Next.js loads every route module (including the one that imports
  Prisma) while collecting page data during the build, before serving a
  single request. This is a deliberate, correct fail-fast design, not a
  bug — but it means `DATABASE_URL` must be set in Vercel's project
  settings *before* the first deploy, or that first build will fail. Now
  documented explicitly in `docs/ENVIRONMENT.md`.
- **The testing database credential removed from the project entirely.**
  Confirmed (via a repository-wide search for its host, username, and port,
  not just its full string) that it appeared in exactly one file, `.env` —
  nowhere in `src/`, `docs/`, `prisma/`, or any other tracked file. Replaced
  the real value in `.env` with an empty placeholder after finishing every
  test that needed real database access. There is no git repository in this
  project (confirmed), so nothing was ever at risk of being committed — this
  was about not leaving the value sitting in a plain file on disk, per the
  user's explicit request.
- **A clean, independently-verified launch copy prepared** at
  `F:\Claude Workspace\Ready files for Travel Agency Website` — source,
  public assets, Prisma schema, config, and docs only; no `node_modules`,
  `.next`, generated Prisma client, secrets, or local-machine-specific
  files. Proven deployable for real: ran `npm install` and `next build`
  from inside that folder, isolated from the main project, and both
  succeeded cleanly.
- Re-ran Lighthouse against a fresh production build after all of the
  above: homepage 94/100/96/100 (performance/accessibility/best-practices/
  SEO), `/flights` 99/100/96/100 — consistent with, not regressed from,
  the previous pass's numbers.

## Pass 3 — environment variable simplification

At the user's request, removed the project's dependency on every optional
environment variable, on purpose — not because anything was broken with
them:

- **`NEXT_PUBLIC_SITE_URL` removed.** `SITE_URL` in `src/lib/constants.ts`
  is now a plain static string, not an env-var-with-fallback. Same effective
  value in production either way; the difference is there's no longer a
  variable that could be set incorrectly (or left set to a stale `localhost`
  value, as `.env.local` on this machine had been — deleted, since it was
  now dead configuration with nothing left to read it).
- **`GOOGLE_SITE_VERIFICATION` removed.** The `verification` field is gone
  from `layout.tsx`'s metadata entirely. Search Console verification via
  other methods (DNS, etc.) still works fine; the HTML-tag method would need
  the field re-added with a real token if wanted later.
- **`NEXT_PUBLIC_ANALYTICS_ID` and the analytics/consent-banner scaffold
  removed entirely** — `src/lib/analytics.ts`, `Analytics.tsx`, and
  `CookieConsent.tsx` are deleted, not just disabled, along with the CSP's
  conditional allowance for Google's analytics hosts in `next.config.ts`.
  This was working, tested infrastructure from Pass 2 (see below); it's
  gone now because the user explicitly asked for zero dependency on that
  variable and no dead configuration left behind, not because of a defect.
  The Cookie Policy's forward-looking language ("we may in the future
  enable...") still holds — it never depended on this code existing.
- Re-verified after the removal: `sitemap.xml`, `robots.txt`, canonical
  URLs, and Open Graph URLs all still resolve to the real production domain
  with the exact same output as before (confirmed by reading the generated
  files, which derive from the same `SITE_URL` constant, now just without
  the indirection). `DATABASE_URL` is untouched and remains the only
  environment variable this project reads.

## Pass 2 — final pre-launch audit

Real defects found and fixed, verified by actually testing the running app
(not just reading code):

- **Cookie Policy inaccuracy**: it described "essential cookies" for form
  state and consent-memory that don't actually exist in the codebase — the
  site sets zero cookies. Rewrote it to state that accurately, and to only
  describe analytics cookies as something that activates *if* enabled.
- **Privacy Policy gap**: never mentioned the newsletter signup (a real,
  live feature) despite documenting flight-request and contact-form data
  collection in detail, and described newsletters as a hypothetical future
  possibility ("if we ever send..."). Added a proper section and corrected
  the tense.
- **Analytics + cookie consent**: none existed. Built an off-by-default
  scaffold (`NEXT_PUBLIC_ANALYTICS_ID`) — nothing loads or renders today;
  if set, a consent banner gates a GA4 script load, and the CSP extends
  itself only when that variable is present. See `src/lib/analytics.ts`.
- **FAQ gaps**: missing payment/ticketing process, changes/cancellations,
  corporate travel, and flexible-dates topics the audit specifically asked
  for. Added four new Q&As written to match the existing agency-voice tone.
- **Alt-text bug**: two images (`BusinessClassHighlights.tsx`,
  `data/how-it-works.ts`) had literal placeholder wording baked into the
  alt attribute itself ("A made-up lie-flat business-class bed...") — fixed
  to real descriptive text.
- **No custom 404 page** — Next's generic error page was live. Built a
  branded one (`src/app/not-found.tsx`) with Back-to-Home plus
  Destinations/Business Class/Flight Quote/Contact shortcuts, `noindex`.
- **No social-share image** — `og:image`/`twitter:image` had no default.
  Built a generated brand image (`src/app/opengraph-image.tsx` +
  `twitter-image.tsx`, `src/lib/og-image.tsx`) used everywhere except
  destination and blog pages, which correctly keep overriding it with their
  own real photo (verified — this was broken for `twitter:image`
  specifically until fixed).
- **Floating "Best Deals" button real defect** (carried over verification
  from the CSP work): it could sit on top of — and intercept taps on — the
  flight form's submit button on narrow screens. Already fixed and
  reverified this pass.
- **Color contrast**: `--color-gold-600`, used as text color for every
  section kicker label and every required-field asterisk site-wide, only
  reached ~3.1:1 against the cream background — short of WCAG AA's 4.5:1
  for normal text. Darkened to ~4.68:1 (verified via the browser's own
  computed styles, not just calculation), with `gold-700` darkened to match
  so its one hover-state use still reads as a hover.
- **Mobile menu had no Escape-to-close** despite locking background scroll
  (i.e., behaving modally) while open — added and verified.
- Deleted unused `create-next-app` boilerplate SVGs from `public/`
  (`next.svg`, `vercel.svg`, `file.svg`, `globe.svg`, `window.svg`) — none
  were referenced anywhere.
- Trimmed the "DEVELOPMENT NOTE" comment headers on the three legal pages
  to short, neutral pointers to `docs/LEGAL.md` (their content was already
  correct and non-rendered — this was a professionalism/clarity cleanup,
  not a functional fix).
- Added the registered address to the Footer's contact block (was phone +
  email only).
- Fixed two real ESLint errors (`react-hooks/set-state-in-effect`) in the
  new Analytics/CookieConsent components — the "fix" the rule suggests
  would introduce an actual SSR hydration mismatch here, so suppressed with
  a documented reason instead of forcing an unsafe rewrite.

**Verified, not just assumed**, via a real headless-browser pass:
all 96 internal links (200 OK), all three forms end-to-end (empty/invalid/
valid/duplicate submissions, actual DB writes via real POST requests, real
success states), zero console errors/CSP violations/hydration warnings on
a genuinely fresh tab (the long-lived tab's console buffer accumulates
stale history across navigations — confirmed via a clean tab specifically
to rule that out), heading hierarchy (one `<h1>` per page, no skipped
levels), the production build (`next build` — clean, zero errors) with a
real `next start` smoke test confirming production CSP, custom 404, and
generated OG image all serve correctly outside dev mode.

## 1. Completed this pass

- Full-codebase sweep for leftover placeholders (`TODO`, `FIXME`,
  `localhost`, `example.com`, `test@`, `dummy`, `Lorem ipsum`, `mock`,
  `fake`, bracketed placeholders like `[Company Name]`, etc.) across
  `src/`. No leftovers found — every `placeholder` hit is a legitimate
  HTML form-field attribute, and every `test@`/comment hit is inside code
  comments explaining validation logic, not real dummy data.
- Content-Security-Policy made dev/production-aware: production keeps the
  strict policy (`script-src 'self' 'unsafe-inline'`, `connect-src 'self'`,
  no `unsafe-eval`); only `next dev` gets the `unsafe-eval` and
  `ws://localhost:*` allowances Turbopack's hot-reload needs. Verified live:
  the HMR WebSocket connects, React's dev-mode `eval()` no longer throws,
  and the production CSP string is unchanged. See [next.config.ts](../next.config.ts).
- Fixed a real mobile defect: the persistent floating "Best Deals" button is
  `position: fixed` and, on narrow screens, was rendering on top of the
  flight-request form's full-width submit button while it scrolled into
  view — and since the pill sits at a higher `z-index`, it could intercept
  a tap meant for "Get a Free Flight Quote." Fixed by having the floating
  button fade to a non-interactive state (`pointer-events: none`) whenever
  a form marks its own primary submit button with `data-hide-floating-cta`
  (currently only the flight-request form's — the contact form's submit
  button was checked and has enough clearance on its own). See
  [FloatingDealsButton.tsx](../src/components/layout/FloatingDealsButton.tsx)
  and [FlightRequestForm.tsx](../src/components/flight-form/FlightRequestForm.tsx).
- Responsive layout verified at 320px, 375px, 390px, 430px, tablet (768px),
  desktop (1440px), and large desktop (1920px), with particular attention
  to the flight-request form. No overflow, no broken grids; the destination
  card grid steps from 1 → 2 → 3 → 4 columns as expected, and large-desktop
  content is confirmed centered at `max-w-7xl` via direct DOM measurement
  (not just a screenshot, which is unreliable at large downscale factors).
- Confirmed `robots.txt`'s `Sitemap:` URL only shows `localhost` because of
  this machine's own `.env.local` (`NEXT_PUBLIC_SITE_URL=http://localhost:3100`,
  gitignored, dev-only). The code itself (`SITE_URL` in
  [constants.ts](../src/lib/constants.ts)) falls back to
  `https://www.businessflights.travel` whenever that variable is unset —
  which is the documented, correct state for a real deployment.
- Re-confirmed the data-access layering audit from the prior pass still
  holds after this session's changes: the only `prisma.*` call in
  application code outside `src/generated/` and `src/server/` is the one
  documented exception, `src/app/api/airports/search/route.ts`.
- Re-confirmed company info (name, phone, address) is centralized in
  `src/lib/constants.ts` and used consistently — no hardcoded duplicates
  found elsewhere.
- Re-confirmed no fabricated trust content anywhere: `TRUSTPILOT_URL` is a
  real link with no invented rating/review count; `TRUST_BADGES` is an
  empty, ready-to-populate array (per your confirmation that no IATA/ARC/BBB
  accreditation exists yet); `Testimonials.tsx` deliberately avoids
  invented quotes, names, or star ratings.

## 2. Security

- **CSP & security headers** (`next.config.ts`): `Content-Security-Policy`,
  `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`,
  `Permissions-Policy`, `Strict-Transport-Security`. The CSP disallows
  inline event handlers and remote script/style/image/font hosts other than
  same-origin (`next/font` self-hosts, `next/image` proxies remote photos
  through `/_next/image`). It is **not** nonce-based — `script-src` keeps
  `'unsafe-inline'` because the app renders several JSON-LD
  `<script>` tags via `dangerouslySetInnerHTML` from static/trusted data
  only; threading per-request nonces through all of them is a real future
  hardening step, not something bolted on without the testing it deserves.
- **XSS**: every `dangerouslySetInnerHTML` use (6 total) is JSON-LD
  structured data built from static or database-controlled fields, never
  raw user input.
- **SQL injection**: the only raw-SQL usage in the app is a tagged-template
  `$queryRaw` in `src/server/lead-distribution.ts` implementing
  `FOR UPDATE SKIP LOCKED` row locking, with zero string-interpolated user
  values. No `$queryRawUnsafe`/`$executeRawUnsafe` anywhere in application
  code.
- **Server-side validation**: all three public forms (flight request,
  contact, newsletter) validate with Zod on the server inside their
  `src/server/actions/*.ts` — client-side validation is a UX convenience,
  not the only gate.
- **Spam/bot protection**: each form has a honeypot field and a
  render-timestamp check (rejects near-instant submissions), plus
  in-memory sliding-window rate limiting (`src/lib/rate-limit.ts`). No
  CAPTCHA — deliberately, per your instruction not to make legitimate
  customers jump through unnecessary friction. **Known limitation**: the
  rate limiter is in-memory per server instance, so it resets on redeploy
  and isn't shared across multiple instances — acceptable for the current
  scale, worth revisiting if traffic or abuse grows.
- **Database failure handling**: `/api/airports/search` catches failures
  and returns an empty result set with a 503 rather than surfacing a stack
  trace; the three write actions (flight request, contact, newsletter) all
  return a generic "something went wrong, please try again" message on
  failure — no SQL error text, connection string, or stack trace ever
  reaches the client.
- **Secrets**: `.env` and `.env.local` are gitignored (`.gitignore` excludes
  `.env*` except `.env.example`); `.env.example` documents variable names
  only. This project is not currently in a git repository, so there is no
  commit history to audit, but the gitignore pattern is correct going
  forward.

## 3. SEO / Google Search Console readiness

- `sitemap.xml` and `robots.txt` are generated from `SITE_URL`, which
  resolves to the real production domain in any environment that doesn't
  explicitly override it — see the `robots.txt` note in Section 1.
- Every page has a canonical URL, and destination pages additionally carry
  `BreadcrumbList` JSON-LD; the homepage and destination pages carry
  `FAQPage`/`Organization`/`WebSite` JSON-LD as appropriate.
- `GOOGLE_SITE_VERIFICATION` is wired into `layout.tsx`'s metadata and only
  renders a verification tag when the env var is actually set — no empty or
  fake tag.
- No `noindex` found anywhere unexpected.

## 4. Database / CRM architecture

Unchanged from the prior pass, re-verified this session: all three public
forms (flight request, contact, newsletter signup) write directly into the
shared "Compass Tools" CRM's own tables (`Lead`, `ContactInquiry`,
`Subscriber`) in the same request — no separate sync job, no Google Sheets
dependency (fully removed per your earlier instruction). Flight requests
still run through the existing `lead-distribution.ts` queue-assignment
logic untouched. See [ENVIRONMENT.md](ENVIRONMENT.md) for the full
data-flow explanation.

## 5. Static, application-owned operational data

Per your deployment-independence requirement: destinations, airlines, and
airline logos are **not** read from `DATABASE_URL`. They live in
`src/data/destinations.ts`, `src/data/airlines.ts`, and
`public/airlines/*.png`, checked into the repo. The site's core visual
content (destination cards, the "Airlines Travelers May Consider" strip)
renders correctly with zero database dependency.

The one deliberate exception: `/api/airports/search` (the flight form's
origin/destination autocomplete) still queries `DATABASE_URL`'s `Airport`
table, because it needs ~9,000 airports worldwide — impractical to
hand-maintain as a static file, and this data is foundational CRM
infrastructure regardless of this website. It degrades to an empty result
list, not an error, if the database is unavailable.

## 6. Environment variables

See [.env.example](../.env.example) and [ENVIRONMENT.md](ENVIRONMENT.md)
for the authoritative, categorized list:

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | Shared CRM PostgreSQL connection string |

`DATABASE_URL` is the only environment variable this project reads
(simplified in a later pass — see Pass 3 below). The production site URL is
a plain constant in `src/lib/constants.ts`; there is no Google Search
Console verification or analytics support in the codebase at all right now.
All Google Sheets-related variables and code were removed in an earlier
pass and have not reappeared.

## 7. Remaining issues / things I did not do

Being explicit, as asked, rather than declaring this "fully complete":

- **I did not run a real performance audit** (no Lighthouse run, no bundle
  size measurement). I reviewed the dependency list and confirmed images go
  through `next/image` and fonts through `next/font`, but that's not a
  substitute for an actual measurement. Worth running Lighthouse against a
  production build before launch.
- **I did not click through every single link/page/CTA on the site.** I
  spot-checked the homepage, flights, destinations, contact, sitemap, and
  robots.txt this session, and relied on prior-session review for the rest
  (legal pages, blog, about, how-it-works). A full manual click-through of
  every nav item and every destination detail page has not happened.
- **3 orphaned database tables** (`SheetSyncRecord`, `SubmissionSequence`,
  `NewsletterSubscriber`) remain in the shared Postgres database from the
  removed Google Sheets integration. They are harmless — nothing in
  `schema.prisma` or application code references them — but Prisma's own
  AI-agent safety gate blocks an automated `db push --accept-data-loss`
  even with your consent. To remove them, run this yourself in a terminal
  with a current backup/confidence in the CRM's state:
  ```bash
  npx prisma db push --accept-data-loss
  ```
- **IATA/ARC/BBB accreditation and "24/7 service" are not claimed anywhere**
  (per your confirmation that neither is currently true) — the footer's
  `TRUST_BADGES` array is empty and ready to populate once/if those become
  real. This is correct as-is, not a gap, but flagging it so it isn't
  mistaken for an oversight.
- **CSP is `'unsafe-inline'` for scripts**, not nonce-based. This is a
  deliberate, documented tradeoff (see Section 2) rather than the strictest
  possible policy — revisit if a future security review requires it.
- **Rate limiting is in-memory**, not shared across server instances or
  persistent across redeploys — fine at current scale, a real limitation if
  traffic grows or the app runs multi-instance.
