"use client";

import PhoneInput from "react-phone-number-input";
// Bundled SVG flag components instead of the library's default behavior of
// hotlinking each flag from an external GitHub Pages CDN at render time —
// keeps this fully self-hosted (works under a same-origin CSP, and never
// depends on a third-party GitHub Pages URL staying up in production).
// See the fuller comment previously on PhoneNumberField.tsx for the
// hydration-safety argument — it applies identically here, unchanged by
// the dynamic-import split below.
import flags from "react-phone-number-input/flags";

// Split out of PhoneNumberField.tsx and loaded via next/dynamic:
// react-phone-number-input + country-flag-icons' full flag set +
// libphonenumber-js's metadata together are the single largest client
// bundle contributor on this page (~240KB of that is just the ~245
// bundled flag SVGs) — real weight for a field that isn't needed until a
// user actually reaches it in the form. PhoneNumberField.tsx renders a
// plain, fully-functional <input> in its place until this chunk resolves,
// so the field is never missing or non-interactive, just not yet upgraded
// to the rich country-select/formatting experience.
export function PhoneInputRich(props: React.ComponentProps<typeof PhoneInput>) {
  return <PhoneInput {...props} flags={flags} />;
}
