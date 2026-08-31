# Environment Variables

This project reads exactly one environment variable. Everything else — the
production site URL, SEO metadata, static reference data — is checked into
the repo as code, not sourced from configuration. No secret is ever imported
into a Client Component or sent to the browser (`src/lib/prisma.ts` and
every `server/actions/*.ts` file are server-only).

Copy `.env.example` to `.env` and fill in the real value, or set it directly
in your hosting provider's environment variable settings for production.

## Database — `DATABASE_URL` (required for dynamic features only)

The shared "Compass Tools" CRM's PostgreSQL connection string. This website
writes directly into CRM tables — `Lead` for flight requests, `ContactInquiry`
for contact-form messages, `Subscriber` for newsletter signups (see the
header comment in `prisma/schema.prisma`) — rather than a parallel database.
Ask whoever administers the CRM database for this value.

**Not required to build or serve the site — only to complete a form
submission.** `src/lib/prisma.ts` exports `prisma` as a lazily-initialized
proxy: importing it never touches `DATABASE_URL`, and constructing the real
client (which throws a clear error if `DATABASE_URL` is missing) only
happens the moment a server action actually calls a `prisma.*` method —
inside that action's own `try`/`catch`, which turns it into the same
friendly, generic error message any other database failure produces. This
means `next build` succeeds and the site serves every static/reference-data
page (including the flight request form's application-owned airport
autocomplete) with `DATABASE_URL` completely unset; only submitting a form
requires it, and only that submission fails — not the whole page.
(Previously the client was constructed eagerly at module-import time, which
made *any* page reachable from a "use server" action that imports
`prisma.ts` — in effect, every page with a form — crash outright without
`DATABASE_URL`, before that action's own error handling ever ran. Fixed as
part of the database-portability work in this pass.)

Still set `DATABASE_URL` in your hosting provider's environment variables
before real customers can submit forms — there's just no build-time
ordering requirement to worry about anymore.

## Production site URL — not an environment variable

`SITE_URL` in `src/lib/constants.ts` is a plain static constant
(`https://www.businessflights.travel`), not read from configuration.
Canonical URLs, the sitemap, Open Graph tags, and structured data all derive
from it. If the production domain ever changes, update that one constant —
there's nothing to set in `.env`, and no risk of a stray `localhost` URL
reaching production metadata because there's no environment-dependent
fallback to misconfigure.

## Google Search Console — not currently supported

There is no `GOOGLE_SITE_VERIFICATION` variable and no verification meta tag
in `src/app/layout.tsx`'s metadata. The sitemap (`src/app/sitemap.ts`) and
`robots.txt` (`src/app/robots.ts`) work independently of Search Console
verification — you can still submit the sitemap URL from your Search
Console account and verify domain ownership through Google's other methods
(DNS record, etc.) without any change to this codebase. If you want the
HTML-tag verification method specifically, add a `verification: { google:
"..." }` field to the metadata object in `layout.tsx` once you have a real
token — don't invent one ahead of time.

## Analytics — not currently implemented

There is no analytics code in this project at all — no script, no
tracking pixel, no cookie-consent banner, no environment variable to
configure. The Cookie Policy (`/cookie-policy`) states plainly that the
site sets no cookies today. If analytics is added in the future, build the
consent-gating in the same change that adds the tracking script — don't
let the policy drift out of sync with what the code actually does.

## Static operational reference data — no environment variable needed

Destinations, airlines, airline logos, and airports are **not** read from
`DATABASE_URL` — they're application-owned data, checked into the repo, so
the site's core content renders correctly even before `DATABASE_URL` is
configured, and continues to work if the app is ever pointed at a different
database. See:

- `src/data/destinations.ts` — every destination's city, country, region,
  IATA code, starting fare, and content
- `src/data/airlines.ts` — the airlines shown in the footer, with their
  logo paths
- `public/airlines/*.png` — the actual logo image files
- `src/data/airports.ts` — a curated list of major world airports (IATA
  code, name, city, country) that powers the flight request form's
  origin/destination search-as-you-type entirely client-side, with no
  network request and no database involved. (This used to query the CRM's
  `Airport` table directly over an API route — that broke autocomplete in
  production the moment `DATABASE_URL` pointed at a database whose
  `Airport` table wasn't seeded the same way as the original development
  database. See the header comment in `src/data/airports.ts` for the full
  history.)

`DATABASE_URL`'s `Airport` table is still used for one thing: `Lead` (and
`FlightSegment`) rows have a real foreign key to it, so a submitted flight
request still needs a matching `Airport` row to attach to. Rather than
requiring that row to already exist, `submit-flight-request.ts` validates
the submitted IATA code against `src/data/airports.ts` (not the database)
and then `upsert`s the corresponding `Airport` row using that canonical
data — so submission works against any compatible Postgres database,
including a brand-new one with an empty `Airport` table, not just the one
instance that happened to have it pre-seeded.

## How website submissions reach the CRM

There is no separate sync step or background job — each form's server
action (`src/server/actions/`) writes directly into the CRM's own tables in
the same request:

- **Flight requests** (`submit-flight-request.ts`) create a `Lead`, then call
  the existing queue-distribution logic (`src/server/lead-distribution.ts`)
  so an active agent is assigned exactly as before.
- **Contact messages** (`submit-contact-message.ts`) create a
  `ContactInquiry`, linked to the same `Contact` record a flight request
  would resolve to, so an agent sees every inquiry and lead for that person
  together.
- **Newsletter signups** (`subscribe-newsletter.ts`) create or reactivate a
  `Subscriber`, the same table the CRM's own campaign sender
  (`MarketingCampaignSend`) already reads from.

All three share `resolveContact()` (`src/server/contact.ts`) for
duplicate-contact detection, so the same customer contacting the site
multiple ways doesn't create separate, disconnected records.
