# Business Flights Travel website - the updated checkout (`Travel Agency Website-updated`, port 3101)

This repository is the **updated, API-only** website. It is independent of the original checkout (`Travel Agency Website`, port 3100): it has its own
`.git`, `package.json` + lockfile and `node_modules`, and nothing at runtime reads from another folder.

| | Original | Updated (this repository) |
|---|---|---|
| Folder | `F:\Claude Workspace\Travel Agency Website` | `F:\Claude Workspace\Travel Agency Website-updated` |
| Branch | `feature/vps-website` (direct-database architecture) | `work/website-crm-api-integration` (forms go to the CRM API) |
| Port | 3100 | **3101** (`npm run dev` / `npm start` use `-p 3101`) |

All new website development goes here. The original is left as it is.

## Setup, build, run

```bash
npm ci                       # exact versions from package-lock.json
cp .env.example .env         # every page works without it; forms need the CRM variables below
npm run dev                  # http://localhost:3101
npm run build && npm start   # production build on 3101
```

Environment variables are documented in `.env.example` and `docs/ENVIRONMENT.md`. Form submissions need `CRM_API_URL` and `CRM_API_KEY`
(`docs/CRM_API_INTEGRATION.md`); the CRM side is the "website lead API" of the updated CRM (`compass-tools-updated`, port 3001 in development).
The website never receives database credentials. Visitor IP / approximate location: `docs/IP_AND_LOCATION_CAPTURE.md`.
Deployment (Docker Compose + Cloudflare Tunnel on the VPS): `docs/DEPLOYMENT_VPS.md`.

## Checks

```bash
npx tsc --noEmit
npx eslint
npm run validate:content
npm run build
npm start &                              # then, against the running server:
npm run validate:seo                     # defaults to http://localhost:3101
npx playwright test --project="Desktop Chrome" --workers=2     # TEST_BASE_URL overrides the default http://localhost:3101
npm run test:infra                       # CRM-API stand-in, deploy-script and VPS specs
```

## What is in this checkout

Six local commits on top of `3d68d0f` (API-only CRM integration): SEO (connected JSON-LD, sitemap, robots), accessibility / contrast / form
fixes, reveal-animation performance, updated contact details, security lockfile bumps, and trusted client IP + approximate location capture for
Cloudflare. Plus uncommitted work in progress (legal / consent wording, a quote-consent notice, contact-form autocomplete tests).

The original website's direct-database release tooling (runtime-role SQL, `verify-runtime-role`, release-validation scripts) was deliberately **not**
carried over: this checkout has no database. It remains in the original folder.

`docs/workspace-archive/` and `docs/brand-assets/` hold reports and artwork kept from the 2026-11-09 workspace consolidation (see the README there).

## Release-time cache purge (documentation of current behaviour - nothing here was changed)

* Prerendered HTML pages (home, destinations, blog, legal, ...) are sent with `Cache-Control: s-maxage=31536000` (Next.js's default for static
  pages), `/_next/static/*` with `public, max-age=31536000, immutable` (content-hashed file names), `/robots.txt` and `/sitemap.xml` with
  `max-age=0, must-revalidate`, and `/api/health` with `no-store`.
* Whether Cloudflare keeps the HTML depends on the zone's Cache Rules (HTML is not cached by default; a "Cache Everything" rule would cache it). That
  setting was NOT inspected (no access). **If HTML is cached at the edge, purge it after every release** (Cloudflare dashboard > Caching > Purge, "Purge
  Everything" or by URL/prefix); `/_next/static/*` needs no purge because the file names change with each build.
* After a release, verify with `curl -sI https://www.businessflights.travel/` and look at `cf-cache-status` and `age`, then request one page changed by
  the release and confirm the new content.
* `script-src` keeps `'unsafe-inline'` on purpose (inline JSON-LD blocks and static rendering; a nonce-based policy would force dynamic rendering - see
  `docs/PRODUCTION_READINESS.md`).

## Performance notes (measured 2026-11-13, Lighthouse 13.4, mobile emulation, local production build)

Accessibility, best practices and SEO scored 100 on the home, flights, contact and a destination page; performance scored 81-96 with LCP 2.8-4.0 s. The
LCP request itself is fast (home: first byte 20 ms, load delay 21 ms, load 407 ms, render delay 38 ms; discovery passes), so the figure is Lighthouse's
simulated slow-phone/4G estimate, driven by JavaScript weight (home: 24 script requests, about 600 KB transferred) and CPU throttling (TBT 54-314 ms).
Targeted opportunities Lighthouse reports, none implemented: unused JavaScript (52-81 KiB, e.g. form/date-picker code on pages that do not show the
form), legacy JavaScript (about 14 KiB), image delivery (7-72 KiB on destination pages), render-blocking CSS. Re-measure with real-user data (CrUX /
Search Console) after release before changing anything.
