"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/cn";
import { FieldError } from "@/components/forms/FieldError";
import { loadPhoneValidator } from "@/lib/phone-validator";

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
      className="w-full bg-transparent py-3 text-sm text-[var(--color-navy-950)] outline-none"
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
  suggestedCountry,
  onBlurValue,
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
  /**
   * ISO 3166-1 alpha-2 code of the country the visitor appears to be in (server-derived, approximate - see src/lib/visitor-hint.ts). It pre-selects
   * that country's calling code, but only while the field is untouched: once the visitor has typed a number or picked a country themselves, a
   * suggestion that arrives (or changes) later is ignored, so nothing the visitor chose is ever overwritten. With no suggestion the field is
   * neutral - no country is assumed; the visitor picks one or types a number starting with "+".
   */
  suggestedCountry?: string;
  /** Called with the current value when focus leaves the whole field (number input AND country select), for validate-on-blur. */
  onBlurValue?: (value: string | undefined) => void;
}) {
  const errorId = `${id}-error`;
  // The country in effect once the visitor has made the field their own: the suggestion as it stood at that moment.
  const [frozen, setFrozen] = useState<{ country: string | undefined } | null>(null);
  const defaultCountry = (frozen ? frozen.country : suggestedCountry) as React.ComponentProps<typeof PhoneInputRich>["defaultCountry"];
  // Set when the visitor changes the country while a number is already in the field. The phone input library (international mode) clears the typed
  // digits when the country changes - the same digits under another calling code would be a different, possibly valid but WRONG number - so the visitor
  // is told that it happened and can put the previous number back with one click.
  const [countryNotice, setCountryNotice] = useState<{ text: string; previous: string } | null>(null);
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  });
  // Set by the country <select>, read by the very next onChange (the library reports the reset number right after the change).
  const countryJustChangedRef = useRef(false);

  function handleChange(next: string | undefined) {
    if (!frozen && next) setFrozen({ country: suggestedCountry });
    const changedCountry = countryJustChangedRef.current;
    countryJustChangedRef.current = false;
    // A country change keeps its notice; any other edit of the number dismisses it.
    if (!changedCountry) setCountryNotice(null);
    onChange(next);
  }

  function restorePreviousNumber() {
    if (!countryNotice) return;
    const previous = countryNotice.previous;
    setCountryNotice(null);
    onChange(previous);
  }

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

  // The phone-number validator (libphonenumber, ~120 KB) is not part of the page's initial JavaScript: it is fetched the first time the visitor
  // touches, focuses or fills this field (a capture handler, so it never interferes with the input's own events), and again at submit if needed.
  // See src/lib/phone-validator.ts.
  useEffect(() => {
    if (value) void loadPhoneValidator();
  }, [value]);
  const warmValidator = () => void loadPhoneValidator();

  return (
    <div
      id={`field-${fieldKey}`}
      onFocusCapture={warmValidator}
      onPointerDownCapture={warmValidator}
      onTouchStartCapture={warmValidator}
      // The country <select> is part of the phone control: choosing a country is the visitor making the field theirs, and when a number is
      // already there the digits now sit under a different country code, so say so.
      onChangeCapture={(event) => {
        const target = event.target as HTMLElement;
        if (target.tagName !== "SELECT") return;
        if (!frozen) setFrozen({ country: suggestedCountry });
        const chosen = (target as HTMLSelectElement).value;
        if (valueRef.current && /^[A-Z]{2}$/.test(chosen) && chosen !== "ZZ") {
          countryJustChangedRef.current = true;
          const previous = valueRef.current;
          let name: string | undefined;
          try {
            name = new Intl.DisplayNames(["en"], { type: "region" }).of(chosen);
          } catch {
            name = undefined;
          }
          setCountryNotice({ text: `Country changed to ${name && name !== chosen ? name : chosen}. The number you had entered was cleared, because it belonged to the previous country code.`, previous: previous! });
        }
      }}
      onBlur={(event) => {
        // Only when focus really leaves the control, not when it moves between the country select and the number input.
        if (onBlurValue && !event.currentTarget.contains(event.relatedTarget as Node | null)) onBlurValue(value);
      }}
    >
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold tracking-wide text-[var(--color-navy-700)]">
        {label} {required && <span className="text-[var(--color-gold-600)]">*</span>}
      </label>
      <div
        className={cn(
          // No vertical padding here: the (fallback or rich) input carries `py-3` itself, so the
          // whole 46px field — not just a 20px strip in its middle — is the tap/focus target.
          "rounded-xl border bg-white px-3.5 text-sm focus-within:border-[var(--color-navy-700)] focus-within:ring-2 focus-within:ring-[var(--color-gold-400)]/55",
          error ? "border-red-500" : "border-[var(--color-navy-950)]/12",
        )}
      >
        {richReady ? (
          <PhoneInputRich
            id={id}
            international
            defaultCountry={defaultCountry}
            value={value}
            onChange={handleChange}
            placeholder={placeholder}
            aria-required={required}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
          />
        ) : (
          <PlainPhoneInputFallback
            id={id}
            value={value}
            onChange={handleChange}
            placeholder={placeholder}
            ariaRequired={required}
            ariaInvalid={Boolean(error)}
            ariaDescribedBy={error ? errorId : undefined}
          />
        )}
      </div>
      {error && (
        <FieldError id={errorId}>{error}</FieldError>
      )}
      {countryNotice && (
        <p role="status" id={`${id}-country-notice`} className="mt-1.5 text-xs text-[var(--color-navy-800)]">
          {countryNotice.text}{" "}
          <button
            type="button"
            onClick={restorePreviousNumber}
            // Safari does not focus a button when it is clicked, so pressing this one would first BLUR the phone control: the blur validation (onBlurValue) would show or remove an
            // error message, the layout would shift under the pointer and the click would be lost. Keeping the press from moving focus avoids that; the keyboard is unaffected.
            onMouseDown={(event) => event.preventDefault()}
            className="font-semibold underline underline-offset-2 hover:text-[var(--color-gold-600)]"
          >
            Restore it
          </button>
        </p>
      )}
    </div>
  );
}
