# Content Security Policy: nonce-based scripts (2026-11-24)

Earlier reports kept `'unsafe-inline'` for scripts because Next.js renders inline framework scripts that differ on every page and build, so no static header can list them. This change removes `'unsafe-inline'` from **scripts** by giving every response its own nonce. Styles still need `'unsafe-inline'` (section 4). The policy is **not** "fully hardened": the remaining exception and its cause are stated exactly.

## 1. The policy

Built per request by `src/lib/csp.ts`, set by `src/proxy.ts` (Next.js 16's `proxy`, the former middleware) on both the request (Next reads the nonce from it and stamps it on its own inline scripts while rendering) and the response:

```
default-src 'self'
script-src 'self' 'nonce-<fresh per response>'
script-src-attr 'none'
style-src 'self' 'unsafe-inline'
img-src 'self' data:        font-src 'self' data:        connect-src 'self'
frame-src 'none'            worker-src 'none'            frame-ancestors 'none'
base-uri 'self'             form-action 'self'           object-src 'none'
```

* **No `'unsafe-eval'`** (production) and no wildcard or third-party host: the site loads nothing from another origin.
* **`script-src-attr 'none'`** (added earlier): inline event-handler attributes are refused.
* **New in this change:** the script nonce; `frame-src 'none'` and `worker-src 'none'` (the site embeds no frame and registers no worker; an experiment across the home page, newsletter toast, flight form, calendar, airport list and contact form raised 0 violations).
* The nonce is 128 bits (a UUID, base64), a new one for every response, present only in that response's header and on that response's scripts. Nothing shared caches the page: `src/proxy.ts` sends `Cache-Control: private, no-cache, max-age=0, must-revalidate` on every page (`private` forbids Cloudflare and any proxy, `no-cache` makes a browser fetch it again; the page has no validator). Next adds `no-store` to a dynamic page on its own, and Chrome never puts a `no-store` page in the back/forward cache (Lighthouse `bf-cache` failed on every page after the nonce change, and passed on most before it), so the proxy replaces it. A restored page is the same document with its own nonce, so Back and Forward are safe and instant. After the change Lighthouse's `bf-cache` audit passes on all six measured pages in mobile and desktop (including `/flights`, which failed before the nonce change because of its `no-store` location-hint request; that request is `private, no-store` on purpose, being a per-visitor response, and Lighthouse's headless run did not trigger it, so a real browser that fetches the hint on `/flights` may still be refused by Chrome for that page). Exceptions that keep `no-store`: Next's own 404 page and the API routes.

## 2. What it costs (measured)

A nonce can only be stamped while a page is rendered, so the root layout is `export const dynamic = "force-dynamic"`: every page is rendered per request instead of served as a prerendered file (the build table shows `ƒ`). Page content, URLs, sitemap, robots and metadata are unchanged; static params and `dynamicParams = false` still produce a 404 for an unknown URL. On the local production build time-to-first-byte of a cold request was 33 ms (`/contact`), 96 ms (`/`) and 137 ms (`/destinations`, a 1.1 MB page) against 10-30 ms before; see `FINAL_VERIFICATION_2026-11-24.md` for the Lighthouse comparison. It is more work per page view for one small container, which Cloudflare cannot absorb (HTML is not cacheable now); watch the container's CPU after deployment.

## 3. The run-time kill switch, and the one thing that can break it

`CSP_SCRIPT_MODE=compat` (an environment variable, read per request; a container restart, no rebuild) restores the previous script policy (`'unsafe-inline'`, no nonce). Everything else, including `script-src-attr 'none'`, is unchanged. `deploy/preflight.sh` accepts only empty, `strict` or `compat` (a misspelling would silently mean strict) and announces `compat`.

Why it exists: a nonce policy blocks any script that appears **without** the nonce. Nothing in this application does that, but something between the origin and the browser can: **Cloudflare's Rocket Loader** rewrites every script and would break hydration; Cloudflare's automatic beacon injection (Web Analytics) is a foreign host and is blocked under the old policy too (the site loads no analytics). **Before the first production deployment**, confirm in Cloudflare that Rocket Loader is **Off** for the zone (Speed > Optimization > Content Optimization), and after deploying load the home page and `/flights` through the public hostname once and check that the form opens ("Add preferences") and the calendar opens. If anything is off: `CSP_SCRIPT_MODE=compat` and restart, then investigate. Nothing here was verified against the real Cloudflare zone.

## 4. What remains `'unsafe-inline'`, and why

* **`style-src 'unsafe-inline'`.** (a) The pages carry about 5,900 `style=""` attributes (React and framer-motion inline styles, `next/image`): blocking `style-src-attr` would break the layout. (b) The toast library (Sonner) inserts a `<style>` element at run time and offers no nonce, so `style-src-elem` cannot be narrowed either. Removing this needs the inline styles refactored into classes and a different toast library: a design-system change, not a header change. Style injection is a far smaller risk than script injection (it cannot execute code), but it can still be used to restyle or exfiltrate via CSS.
* **JSON-LD** `<script type="application/ld+json">` blocks are inline but are data, not executed, and are not affected by `script-src`.

## 5. Tests

`tests/csp-nonce.spec.ts` (21, on real production servers): the policy text for both modes and the development relaxation; on **11 pages** (home, flights, contact, about, destinations, a region, a city, blog, an article, privacy, and a 404) a nonce in the header, at least 16 bytes of entropy, different on every response, present on **every executable script (inline or file) of that response and on no other value**; no `'unsafe-inline'` in the script policy; no-store caching; the API routes carry the policy; compat mode serves the previous policy and the same pages; the site **hydrates and works under both modes** (a React handler, the lazily loaded calendar chunk, the flexibility choice) with **zero policy violations and no page error**; client-side navigation and back; and an attacker-style injection **does not run** (an inline script without the nonce, an `onerror`/`onclick` attribute, a script from another host; a script that does carry the nonce cannot call `eval` or `new Function`). `tests/security-headers.spec.ts` pins the directives on eleven pages, `tests/csp-violations.spec.ts` the browser flows. The complete browser, Infrastructure and width suites ran against this build (see the verification document).
