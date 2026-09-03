"use client";

import dynamic from "next/dynamic";

// FloatingDealsButton is mounted in the root layout, so it hydrates on
// every single page load — but nothing about it is needed for the first
// second of interactivity (nobody clicks a floating "call us" pill that
// fast), and it's purely a client-rendered fixed element, never part of
// what a search engine or no-JS visitor needs from the initial HTML.
// `ssr: false` here means it isn't part of the initial server-rendered
// markup or the critical hydration pass at all — its own module (including
// the framer-motion usage inside it) is fetched and mounted as a separate,
// later task, rather than adding to the one big hydration pass every other
// page element is part of. This wrapper — rather than calling
// `dynamic(..., { ssr: false })` directly in layout.tsx, a Server Component
// — is what makes that combination valid regardless of exactly how strict
// this Next.js version is about `ssr: false` inside a Server Component: the
// dynamic() call itself lives inside a Client Component here, which is
// always allowed.
const FloatingDealsButton = dynamic(
  () => import("./FloatingDealsButton").then((m) => m.FloatingDealsButton),
  { ssr: false },
);

export function DeferredFloatingDealsButton() {
  return <FloatingDealsButton />;
}
