# Business Flights Travel

The marketing/lead-generation website for Business Flights Travel, a premium
travel agency specializing in business-class, first-class, and international
flight requests. Built with Next.js (App Router) and TypeScript.

## Architecture at a glance

- **Website → authenticated private CRM API → Compass Tools CRM.** Every
  public form (`src/server/actions/`) validates input server-side, then sends
  it to the Compass Tools CRM over HTTP through one server-only client
  (`src/lib/crm-api/`). Flight requests use the CRM's authenticated,
  idempotent `POST /api/v1/website/flight-inquiries`; the contact form and the
  newsletter use the CRM's existing public endpoints (the CRM has no
  authenticated equivalent yet). See `docs/CRM_API_INTEGRATION.md`.
- **The website has no database.** No Prisma, no `DATABASE_URL`, no schema or
  migrations, no fallback write. If the CRM is unreachable the visitor sees a
  friendly error and nothing is stored on the website side. The CRM owns the
  leads, contacts, queue assignment and its database.
- **Static reference data lives in the app.** Destinations, airlines and
  airports are defined in `src/data/` and `public/`, so every page (and the
  flight form's airport search) renders without the CRM. See
  `docs/ENVIRONMENT.md`.
- **No secrets in the client bundle.** The CRM credentials are read in one
  `server-only` module (`src/server/crm-api.ts`); nothing is exposed to the
  browser.
- **Self-hosted.** The site runs as a standalone Next.js container on a VPS
  behind a Cloudflare Tunnel, and reaches the CRM over a private Docker
  network. See `docs/DEPLOYMENT_VPS.md`.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3100](http://localhost:3100) (see `.claude/launch.json`
for the configured dev port) to see the site. Every page works with no
configuration; submitting a form needs the CRM variables.

Copy `.env.example` to `.env` and fill in `CRM_API_URL`, `CRM_API_KEY`,
`CRM_COMPANY_ID` and the `GMAIL_*` values — see `docs/ENVIRONMENT.md`.

## Scripts

- `npm run dev` — start the development server
- `npm run build` — production build (add `NEXT_OUTPUT=standalone` for the container image)
- `npm run start` — run a production build
- `npm run lint` — run ESLint
- `npm run test:infra` / `npm run test:ui` — the Playwright suites (see `playwright.config.ts` for the project layout)

## Documentation

- `docs/CRM_API_INTEGRATION.md` — the CRM endpoints, request mapping, retry and idempotency rules, and the gaps
- `docs/ENVIRONMENT.md` — environment variables
- `docs/DEPLOYMENT_VPS.md` — VPS / Docker / Cloudflare Tunnel deployment
- `docs/LEGAL.md` — status of the legal pages (Privacy Policy, Terms of
  Service, Cookie Policy)
