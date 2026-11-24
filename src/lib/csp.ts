// The Content-Security-Policy, built per request (src/proxy.ts) because the script policy carries a one-time nonce.
//
//   strict (the default)  script-src 'self' 'nonce-<fresh per request>': Next's own inline framework scripts carry that nonce, so an attacker-injected
//                         <script> or inline handler cannot run. There is no 'unsafe-inline' for scripts.
//   compat                script-src 'self' 'unsafe-inline': the previous policy, selectable AT RUN TIME with CSP_SCRIPT_MODE=compat (a container restart, no rebuild).
//                         It exists as a kill switch for one case: something between the origin and the browser that injects or rewrites scripts without the nonce
//                         (for example Cloudflare's Rocket Loader) and so breaks hydration. See docs/CSP_HARDENING.md.
//
// What stays and why: style-src keeps 'unsafe-inline' (the pages carry thousands of style="" attributes from React/Next/framer-motion, and the toast library injects a
// <style> element at run time without a nonce); every other directive is as strict as before, and a few are tighter (frame-src, worker-src, script-src-attr).

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
    "style-src 'self' 'unsafe-inline'",
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
