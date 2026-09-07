"use client";

// Real, working consent-preference infrastructure — not a banner that just
// stores a fake choice. As of this writing the site sets NO cookies and
// loads NO analytics/marketing scripts at all (verified directly against
// the codebase, not assumed — see cookie-policy/page.tsx for the same
// finding). "necessary" therefore currently has nothing to gate either,
// but is kept as a real category (always-on, non-optional) rather than
// omitted, since it's the correct place for anything genuinely required to
// run the site if that ever changes. "analytics" and "marketing" are real,
// functioning categories: if a script is ever added, wrapping its loader in
// `hasConsent("analytics")` (or "marketing") makes it actually honor
// whatever the visitor chose — nothing here needs to change when that
// happens, only the script itself needs to start checking it.
export type ConsentCategory = "necessary" | "analytics" | "marketing";

export type ConsentPreferences = {
  necessary: true; // always on — not a real user choice, kept for shape consistency
  analytics: boolean;
  marketing: boolean;
};

export type ConsentRecord = {
  version: number;
  decidedAt: string; // ISO timestamp
  preferences: ConsentPreferences;
};

// Bump this if the categories offered here ever materially change (e.g. a
// new one is added) — a stale stored record won't be trusted, and the
// banner reappears so the visitor can make an informed choice again under
// the new categories.
const CONSENT_VERSION = 1;
const STORAGE_KEY = "bft-cookie-consent";
const CONSENT_EVENT = "bft-consent-change";

export function getStoredConsent(): ConsentRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentRecord;
    if (parsed.version !== CONSENT_VERSION) return null;
    if (typeof parsed.preferences?.analytics !== "boolean" || typeof parsed.preferences?.marketing !== "boolean") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveConsent(preferences: Omit<ConsentPreferences, "necessary">): void {
  if (typeof window === "undefined") return;
  const record: ConsentRecord = {
    version: CONSENT_VERSION,
    decidedAt: new Date().toISOString(),
    preferences: { necessary: true, ...preferences },
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Private-browsing/storage-blocked contexts: consent still works for
    // this page view (the in-memory choice already gated whatever it
    // needed to), it just won't be remembered next visit — same graceful
    // degradation as any localStorage-backed preference.
  }
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: record }));
}

// Real gating check — this is what a future analytics/marketing script
// loader calls before it does anything, not just what the banner reads to
// paint its own toggles.
export function hasConsent(category: ConsentCategory): boolean {
  if (category === "necessary") return true;
  const stored = getStoredConsent();
  return stored?.preferences[category] ?? false;
}

export function onConsentChange(handler: (record: ConsentRecord) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (e: Event) => handler((e as CustomEvent<ConsentRecord>).detail);
  window.addEventListener(CONSENT_EVENT, listener);
  return () => window.removeEventListener(CONSENT_EVENT, listener);
}

// Dispatched by the footer's "Cookie Settings" link to reopen the
// preferences panel without the two components needing a shared parent
// state — CookieConsent.tsx listens for this the same way it listens for
// consent changes.
const OPEN_PREFERENCES_EVENT = "bft-open-cookie-preferences";
export function openCookiePreferences(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OPEN_PREFERENCES_EVENT));
}
export function onOpenPreferencesRequest(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(OPEN_PREFERENCES_EVENT, handler);
  return () => window.removeEventListener(OPEN_PREFERENCES_EVENT, handler);
}
