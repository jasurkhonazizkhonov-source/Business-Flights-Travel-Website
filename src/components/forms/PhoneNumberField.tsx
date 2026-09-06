"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/cn";

// react-phone-number-input + country-flag-icons' full ~245-flag SVG set +
// libphonenumber-js metadata are, together, the single largest client
// bundle contributor on this page (real measurement via
// `next build --experimental-analyze` — see PhoneInputRich.tsx) — real
// weight for a field a user doesn't reach until partway through the form.
// `ssr: false` keeps it out of the server-rendered HTML/RSC payload too.
//
// The `loading` render-prop next/dynamic offers doesn't receive this
// component's own props (id/value/onChange/etc.) — it's a fixed-signature
// placeholder, not a substitute component — so it can't share state with
// whatever field the user is mid-typing into. Instead, PhoneNumberField
// below tracks its own "has the chunk resolved" state and renders
// PlainPhoneInputFallback (same value/onChange) until it has, then swaps
// to this one. Both branches are controlled from the same value/onChange,
// so nothing typed is ever lost across the swap.
const PhoneInputRich = dynamic(() => import("./PhoneInputRich").then((mod) => mod.PhoneInputRich), {
  ssr: false,
});

function PlainPhoneInputFallback({
  id,
  value,
  onChange,
  placeholder,
  ariaRequired,
  ariaInvalid,
  ariaDescribedBy,
}: {
  id: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  placeholder: string;
  ariaRequired: boolean;
  ariaInvalid: boolean;
  ariaDescribedBy: string | undefined;
}) {
  return (
    <input
      id={id}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || undefined)}
      placeholder={placeholder}
      aria-required={ariaRequired}
      aria-invalid={ariaInvalid}
      aria-describedby={ariaDescribedBy}
      className="w-full bg-transparent text-sm text-[var(--color-navy-950)] outline-none placeholder:text-[var(--color-navy-950)]/40"
    />
  );
}

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

  // Mirrors the module the dynamic() call above already points at — this
  // just gives PhoneNumberField its own signal for when that chunk (fetched
  // once, cached by the browser/module registry either way) has resolved,
  // so it knows when to swap from the plain fallback to the rich input.
  const [richReady, setRichReady] = useState(false);
  useEffect(() => {
    let active = true;
    import("./PhoneInputRich").then(() => {
      if (active) setRichReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

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
        {richReady ? (
          <PhoneInputRich
            id={id}
            international
            defaultCountry="US"
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            aria-required={required}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
          />
        ) : (
          <PlainPhoneInputFallback
            id={id}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            ariaRequired={required}
            ariaInvalid={Boolean(error)}
            ariaDescribedBy={error ? errorId : undefined}
          />
        )}
      </div>
      {error && (
        <p id={errorId} className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
