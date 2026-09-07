"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Cookie, X } from "lucide-react";
import { useClickOutside } from "@/hooks/useClickOutside";
import { cn } from "@/lib/cn";
import { getStoredConsent, saveConsent, onOpenPreferencesRequest, type ConsentPreferences } from "@/lib/consent";

const DEFAULT_OPTIONAL: Omit<ConsentPreferences, "necessary"> = { analytics: false, marketing: false };

function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
        checked ? "bg-[var(--color-gold-500)]" : "bg-[var(--color-navy-950)]/20",
        disabled && "opacity-60",
      )}
    >
      <span
        className={cn(
          "inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}

// Lightweight by design (per the requirement that a consent UI shouldn't
// noticeably add to page weight) — plain Tailwind transitions, no animation
// library, no third-party consent SDK. Deferred via next/dynamic (see
// DeferredCookieConsent.tsx) so it's never part of the critical initial
// bundle either.
export function CookieConsent() {
  // Lazy initializers, not an effect: this component is only ever mounted
  // client-side (loaded via next/dynamic with ssr:false — see
  // DeferredCookieConsent.tsx), so there's no server-rendered markup that
  // could mismatch and no "flash of banner" window to guard against —
  // localStorage is readable from the very first render.
  const [bannerVisible, setBannerVisible] = useState(() => !getStoredConsent());
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [draft, setDraft] = useState<Omit<ConsentPreferences, "necessary">>(() => {
    const stored = getStoredConsent();
    return stored ? { analytics: stored.preferences.analytics, marketing: stored.preferences.marketing } : DEFAULT_OPTIONAL;
  });

  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    return onOpenPreferencesRequest(() => {
      const current = getStoredConsent();
      setDraft(current ? { analytics: current.preferences.analytics, marketing: current.preferences.marketing } : DEFAULT_OPTIONAL);
      setPreferencesOpen(true);
    });
  }, []);

  useClickOutside(dialogRef, () => setPreferencesOpen(false), preferencesOpen);

  // Return focus to a sensible place once the dialog closes, and move it
  // into the dialog when it opens — standard modal focus management.
  useEffect(() => {
    if (preferencesOpen) {
      dialogRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }
  }, [preferencesOpen]);

  function acceptAll() {
    saveConsent({ analytics: true, marketing: true });
    setBannerVisible(false);
    setPreferencesOpen(false);
  }
  function rejectNonEssential() {
    saveConsent({ analytics: false, marketing: false });
    setBannerVisible(false);
    setPreferencesOpen(false);
  }
  function savePreferences() {
    saveConsent(draft);
    setBannerVisible(false);
    setPreferencesOpen(false);
  }

  return (
    <>
      {bannerVisible && (
        <div
          data-hide-floating-cta
          role="region"
          aria-label="Cookie notice"
          className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--color-navy-950)]/10 bg-white/97 px-4 py-4 shadow-[0_-12px_32px_-12px_rgba(10,26,48,0.25)] backdrop-blur sm:px-6"
        >
          <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 sm:max-w-2xl">
              <Cookie size={20} className="mt-0.5 shrink-0 text-[var(--color-gold-600)]" aria-hidden="true" />
              <p className="text-sm leading-relaxed text-[var(--color-navy-950)]/80">
                We don&apos;t use advertising or tracking cookies — only what&apos;s required to run this site. If we ever add optional
                analytics, your choice here will control it. See our{" "}
                <Link href="/cookie-policy" className="underline decoration-dotted underline-offset-2 hover:text-[var(--color-gold-600)]">
                  Cookie Policy
                </Link>
                .
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2.5 sm:flex-nowrap">
              <button
                type="button"
                onClick={() => setPreferencesOpen(true)}
                className="min-h-11 rounded-full border border-[var(--color-navy-950)]/15 px-4 text-sm font-semibold text-[var(--color-navy-950)] transition-colors hover:border-[var(--color-navy-950)]/30"
              >
                Manage Preferences
              </button>
              <button
                type="button"
                onClick={rejectNonEssential}
                className="min-h-11 rounded-full border border-[var(--color-navy-950)]/15 px-4 text-sm font-semibold text-[var(--color-navy-950)] transition-colors hover:border-[var(--color-navy-950)]/30"
              >
                Reject Non-Essential
              </button>
              <button
                type="button"
                onClick={acceptAll}
                className="min-h-11 rounded-full bg-[var(--color-navy-950)] px-5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-gold-600)]"
              >
                Accept All
              </button>
            </div>
          </div>
        </div>
      )}

      {preferencesOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[var(--color-navy-950)]/40 p-0 sm:items-center sm:p-4">
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-6 shadow-2xl sm:rounded-2xl sm:p-7"
          >
            <div className="flex items-start justify-between gap-4">
              <h2 id={titleId} className="font-display text-xl font-semibold text-[var(--color-navy-950)]">
                Cookie Preferences
              </h2>
              <button
                type="button"
                data-autofocus
                onClick={() => setPreferencesOpen(false)}
                aria-label="Close cookie preferences"
                className="-m-1.5 shrink-0 rounded-full p-1.5 text-[var(--color-navy-950)]/50 hover:bg-[var(--color-cream-100)] hover:text-[var(--color-navy-950)]"
              >
                <X size={20} />
              </button>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-[var(--color-navy-950)]/70">
              This site currently sets no optional cookies. The choices below are saved for if and when that changes — nothing about
              using the site or submitting a request depends on them.
            </p>

            <div className="mt-6 space-y-5">
              <div className="flex items-start justify-between gap-4 border-b border-[var(--color-navy-950)]/8 pb-5">
                <div>
                  <p className="text-sm font-semibold text-[var(--color-navy-950)]">Strictly Necessary</p>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--color-navy-950)]/60">
                    Required to operate the site — currently nothing beyond standard page delivery. Always on.
                  </p>
                </div>
                <Switch checked disabled label="Strictly necessary cookies (always on)" />
              </div>

              <div className="flex items-start justify-between gap-4 border-b border-[var(--color-navy-950)]/8 pb-5">
                <div>
                  <p className="text-sm font-semibold text-[var(--color-navy-950)]">Analytics</p>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--color-navy-950)]/60">
                    Not currently used. If we add privacy-conscious, aggregate analytics in the future, this controls whether it loads
                    for you.
                  </p>
                </div>
                <Switch checked={draft.analytics} onChange={(v) => setDraft((d) => ({ ...d, analytics: v }))} label="Analytics cookies" />
              </div>

              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-[var(--color-navy-950)]">Marketing</p>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--color-navy-950)]/60">
                    Not currently used — we run no advertising or retargeting cookies, and have no current plans to.
                  </p>
                </div>
                <Switch checked={draft.marketing} onChange={(v) => setDraft((d) => ({ ...d, marketing: v }))} label="Marketing cookies" />
              </div>
            </div>

            <div className="mt-7 flex flex-col gap-2.5 sm:flex-row-reverse">
              <button
                type="button"
                onClick={savePreferences}
                className="min-h-11 flex-1 rounded-full bg-[var(--color-navy-950)] px-5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-gold-600)]"
              >
                Save Preferences
              </button>
              <button
                type="button"
                onClick={acceptAll}
                className="min-h-11 flex-1 rounded-full border border-[var(--color-navy-950)]/15 px-5 text-sm font-semibold text-[var(--color-navy-950)] transition-colors hover:border-[var(--color-navy-950)]/30"
              >
                Accept All
              </button>
              <button
                type="button"
                onClick={rejectNonEssential}
                className="min-h-11 flex-1 rounded-full border border-[var(--color-navy-950)]/15 px-5 text-sm font-semibold text-[var(--color-navy-950)] transition-colors hover:border-[var(--color-navy-950)]/30"
              >
                Reject All
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
