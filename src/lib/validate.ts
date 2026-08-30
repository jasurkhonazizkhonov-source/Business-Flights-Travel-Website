// Client-side email format check, used for instant form feedback before
// submission — the server independently re-validates with the full zod
// schema (see lib/validations/*.ts) regardless of what this returns, so
// this is a convenience, never the actual gate.
//
// This is `zod`'s own default `.email()` pattern (`zod/v4/core/regexes.js`,
// export `email`), copied rather than imported, specifically so this file
// stays dependency-free: `isValidEmail` is called from both
// FlightRequestForm.tsx and ContactForm.tsx, both rendered above the fold
// on pages across the site, and pulling all of zod into the client bundle
// just for one regex test was real, measured bundle weight (confirmed via
// a Lighthouse "unused JavaScript" audit against the production build)
// that server-side validation doesn't need and never did. Verified to
// produce identical accept/reject results to the live zod validator across
// 13 cases, including the edge cases zod is specifically good at catching:
// "test@example" (no TLD), "john @gmail.com" (embedded space), a leading
// or trailing dot, and a double dot in the local part.
const EMAIL_PATTERN = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}
