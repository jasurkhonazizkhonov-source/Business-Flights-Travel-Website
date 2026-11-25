// The Content-Security-Policy, built per request (src/proxy.ts) because the script policy carries a one-time nonce.
//
//   strict (the default)  script-src 'self' 'nonce-<fresh per request>': Next's own inline framework scripts carry that nonce, so an attacker-injected
//                         <script> or inline handler cannot run. There is no 'unsafe-inline' for scripts.
//   compat                script-src 'self' 'unsafe-inline': the previous policy, selectable AT RUN TIME with CSP_SCRIPT_MODE=compat (a container restart, no rebuild).
//                         It exists as a kill switch for one case: something between the origin and the browser that injects or rewrites scripts without the nonce
//                         (for example Cloudflare's Rocket Loader) and so breaks hydration. See docs/CSP_HARDENING.md.
//
// What stays and why: style ATTRIBUTES keep 'unsafe-inline' (the pages carry thousands of style="" attributes from React/Next/framer-motion); style ELEMENTS and stylesheets do not:
// style-src-elem allows this origin and two hashes (the toast library's one run-time <style>, which offers no nonce, and the empty string it starts as). Every other directive is
// as strict as before, and a few are tighter (frame-src, worker-src, script-src-attr).

/**
 * The one `<style>` element this site creates at run time: the toast library (Sonner) inserts its stylesheet when it is imported and offers no nonce. A CSP hash allows exactly that
 * text and nothing else, so `style-src-elem` needs no 'unsafe-inline' (a style element or stylesheet an attacker injects is refused). The hash is of the CSS string in
 * node_modules/sonner/dist/index.mjs; tests/csp-nonce.spec.ts recomputes it from the installed package, so updating Sonner without updating this value fails the build's tests
 * instead of silently leaving the toasts unstyled.
 */
export const SONNER_STYLE_HASH = "sha256-StEaX+se6YS7pqjzrzMIA0KaX9zF/8zAhvQXZAe5epY=";
/**
 * The hash of the EMPTY string. Sonner appends its <style> element to the document first and puts the CSS inside it afterwards; browsers check the element when it is inserted
 * (empty) and again when its text arrives, and without this value the first check logs a console error on every page view although the finished stylesheet is allowed. An empty style
 * element has no effect, and any text later put into one is checked against the hashes again, so this opens nothing.
 */
export const EMPTY_STYLE_HASH = "sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=";

export type CspScriptMode = "strict" | "compat";

export function cspScriptMode(env: Record<string, string | undefined> = process.env): CspScriptMode {
  return env.CSP_SCRIPT_MODE?.trim().toLowerCase() === "compat" ? "compat" : "strict";
}

export function contentSecurityPolicy(options: { nonce?: string; mode?: CspScriptMode; dev?: boolean }): string {
  const { nonce, dev = false } = options;
  // strict needs a nonce: with none, fall back to compat rather than emit a policy that would block Next's own scripts
  const strict = (options.mode ?? "strict") === "strict" && !!nonce;
  const scriptSrc = strict ? `script-src 'self' 'nonce-${nonce}'` : `script-src 'self' 'unsafe-inline'`;
  return [
    "default-src 'self'",
    // React's development tooling uses eval() for component stacks; never in a production build.
    `${scriptSrc}${dev ? " 'unsafe-eval'" : ""}`,
    // 'unsafe-inline' for scripts (compat) also allows inline event-handler ATTRIBUTES; nothing here uses them, so they are refused in both modes.
    "script-src-attr 'none'",
    // Styles: ELEMENTS (<style>, stylesheets) are limited to this origin and the one known Sonner stylesheet; the inline style="" ATTRIBUTES (thousands, from React, next/image and
    // framer-motion) still need 'unsafe-inline'. An attribute can only set the element's own declarations (no selectors, no @import), which is what makes CSS-based data exfiltration
    // and page restyling by injection possible with a <style> element and not with an attribute. style-src stays as the fallback for a browser that does not know the two below;
    // the development server also needs it (hot reload injects styles).
    "style-src 'self' 'unsafe-inline'",
    ...(dev ? [] : [`style-src-elem 'self' '${SONNER_STYLE_HASH}' '${EMPTY_STYLE_HASH}'`, "style-src-attr 'unsafe-inline'"]),
    "img-src 'self' data:",
    "font-src 'self' data:",
    // the dev server's hot-reload socket is a separate scheme from 'self'
    `connect-src 'self'${dev ? " ws://localhost:* http://localhost:*" : ""}`,
    "frame-src 'none'",
    "worker-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}
