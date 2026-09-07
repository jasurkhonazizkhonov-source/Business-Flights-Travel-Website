"use client";

import dynamic from "next/dynamic";

// Same rationale as DeferredFloatingDealsButton: nothing about cookie
// preferences needs to be part of the critical initial render or the
// server-rendered HTML — it's a purely client-side interactive layer that
// reads localStorage (which doesn't exist during SSR anyway) — so it ships
// as its own later-loaded chunk instead of adding to every page's first
// hydration pass.
const CookieConsent = dynamic(() => import("./CookieConsent").then((m) => m.CookieConsent), { ssr: false });

export function DeferredCookieConsent() {
  return <CookieConsent />;
}
