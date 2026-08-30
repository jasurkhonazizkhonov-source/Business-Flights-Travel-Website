"use client";

import PhoneInput from "react-phone-number-input";
// Bundled SVG flag components instead of the library's default behavior of
// hotlinking each flag from an external GitHub Pages CDN at render time —
// keeps this fully self-hosted (works under a same-origin CSP, and never
// depends on a third-party GitHub Pages URL staying up in production).
//
// This is also what makes the flag icon hydration-safe. The library's own
// Flag component (react-phone-number-input/modules/Flag.js) does exactly
// this: `if (flags && flags[country]) return flags[country](...); return
// <img src={flagUrl...}/>`. Server and client would only render different
// elements (svg vs img) for the SAME country if `flags[country]` were
// present in one environment and missing in the other — nothing about this
// map is request- or environment-dependent (no `window`, `navigator`, or
// locale lookups; confirmed by reading the library source, not assumed),
// so that branch resolves identically everywhere. It does resolve the same
// way everywhere because coverage is complete: all 245 countries this
// package's bundled ("min") metadata returns from `getCountries()` have an
// entry in this flags module (checked directly against the installed
// package). So the `<img>` fallback branch is unreachable for any real
// selection, and there is no SVG-vs-img divergence possible between server
// and client render.
import flags from "react-phone-number-input/flags";
import { cn } from "@/lib/cn";

/**
 * Shared phone-number field used by both the flight-request and contact
 * forms — one implementation means the hydration-safety guarantee above,
 * the flag rendering, and the accessibility wiring only exist in one place
 * rather than needing to be kept in sync by hand across two forms.
 */
export function PhoneNumberField({
  id,
  fieldKey = id,
  label,
  required = true,
  value,
  onChange,
  error,
  placeholder = "Enter phone number",
}: {
  /** id of the actual <input> — must be unique on the page (label `htmlFor` targets this). */
  id: string;
  /** Key used for the `field-*` wrapper id that error-focus scrolling looks up by — pass this
   * when the surrounding form's error map uses a different key than `id` (e.g. `id="c-phone"`
   * but the error key is `"phone"`). Defaults to `id`. */
  fieldKey?: string;
  label: string;
  required?: boolean;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  error?: string;
  placeholder?: string;
}) {
  const errorId = `${id}-error`;
  return (
    <div id={`field-${fieldKey}`}>
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold tracking-wide text-[var(--color-navy-700)]">
        {label} {required && <span className="text-[var(--color-gold-600)]">*</span>}
      </label>
      <div
        className={cn(
          "rounded-xl border bg-white px-3.5 py-3 text-sm focus-within:border-[var(--color-gold-500)] focus-within:ring-2 focus-within:ring-[var(--color-gold-400)]/30",
          error ? "border-red-400" : "border-[var(--color-navy-950)]/12",
        )}
      >
        <PhoneInput
          id={id}
          international
          defaultCountry="US"
          flags={flags}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          aria-required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
        />
      </div>
      {error && (
        <p id={errorId} className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
