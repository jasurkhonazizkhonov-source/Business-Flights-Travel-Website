"use client";

// A small standalone client component (not part of Footer.tsx itself,
// which is a Server Component reading destination data directly — making
// the whole footer client-side would ship the full destinations dataset
// to the browser) so the footer can offer a "Cookie Settings" re-open
// control without that tradeoff. Matches the existing NewsletterForm
// pattern of a small client island inside an otherwise server-rendered
// footer.
import { openCookiePreferences } from "@/lib/consent";

export function CookieSettingsLink({ className }: { className?: string }) {
  return (
    <button type="button" onClick={openCookiePreferences} className={className}>
      Cookie Settings
    </button>
  );
}
