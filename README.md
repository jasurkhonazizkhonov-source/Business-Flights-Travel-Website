# Business Flights Travel

The marketing/lead-generation website for Business Flights Travel, a premium
travel agency specializing in business-class, first-class, and international
flight requests. Built with Next.js (App Router) and TypeScript.

## Architecture at a glance

- **Website → Server Actions → CRM database.** Every public form
  (`src/server/actions/`) validates input server-side, then writes directly
  into the CRM's own tables — flight requests become `Lead` records and
  enter the existing agent queue, contact messages become `ContactInquiry`
  records, and newsletter signups become `Subscriber` records. See
  `prisma/schema.prisma`'s header comment for how this database relates to
  the separate "Compass Tools" CRM application.
- **Static operational reference data lives in the app, not the database.**
  Destinations, airlines, and their logos are defined in `src/data/` and
  `public/`, not queried from Postgres — the site renders correctly even if
  reconnected to a different database. See `docs/ENVIRONMENT.md`.
- **No secrets in the client bundle.** Database access is guarded by the
  `server-only` package. `DATABASE_URL` is the only environment variable
  this project reads at all — nothing is exposed to the browser.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3100](http://localhost:3100) (see `.claude/launch.json`
for the configured dev port) to see the site.

Copy `.env.example` to `.env` and fill in the real `DATABASE_URL` — see
`docs/ENVIRONMENT.md` for where that value comes from.

## Scripts

- `npm run dev` — start the development server
- `npm run build` — production build
- `npm run start` — run a production build
- `npm run lint` — run ESLint

## Documentation

- `docs/ENVIRONMENT.md` — environment variables and the CRM data flow
- `docs/LEGAL.md` — status of the legal pages (Privacy Policy, Terms of
  Service, Cookie Policy)
