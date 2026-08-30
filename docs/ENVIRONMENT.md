# Environment Variables

This project reads exactly one environment variable. Everything else — the
production site URL, SEO metadata, static reference data — is checked into
the repo as code, not sourced from configuration. No secret is ever imported
into a Client Component or sent to the browser (`src/lib/prisma.ts` and
every `server/actions/*.ts` file are server-only).

Copy `.env.example` to `.env` and fill in the real value, or set it directly
in your hosting provider's environment variable settings for production.

## Database — `DATABASE_URL` (required)

The shared "Compass Tools" CRM's PostgreSQL connection string. This website
writes directly into CRM tables — `Lead` for flight requests, `ContactInquiry`
for contact-form messages, `Subscriber` for newsletter signups (see the
header comment in `prisma/schema.prisma`) — rather than a parallel database.
Ask whoever administers the CRM database for this value.

**Required at build time, not just at runtime.** `src/lib/prisma.ts`
deliberately fails fast (a clear thrown error, not a silent fallback) if
`DATABASE_URL` is missing, and Next.js loads every route module — including
`/api/airports/search`, which imports it — while collecting page data
during `next build`, before any request is ever served. On Vercel this
means: set `DATABASE_URL` in the project's Environment Variables **before**
triggering the first deploy, not after — a build started without it will
fail, not just a request made without it.

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

Destinations, airlines, and airline logos are **not** read from
`DATABASE_URL` — they're application-owned data, checked into the repo, so
the site's core content renders correctly even before `DATABASE_URL` is
configured, and continues to work if the app is ever pointed at a different
database. See:

- `src/data/destinations.ts` — every destination's city, country, region,
  IATA code, starting fare, and content
- `src/data/airlines.ts` — the airlines shown in the footer, with their
  logo paths
- `public/airlines/*.png` — the actual logo image files

`DATABASE_URL`'s `Airport` table is still used for one thing: the flight
request form's live origin/destination search-as-you-type (thousands of
airports worldwide — impractical to hand-maintain as a static file). That
endpoint (`src/app/api/airports/search/route.ts`) degrades to "no results"
rather than erroring if the database is unavailable.

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
