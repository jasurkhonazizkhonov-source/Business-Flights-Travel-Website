"use client";

import { LazyMotion, MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

// LazyMotion + the `m` component (used by every animated component in this
// app — see Reveal.tsx and friends) keeps the full framer-motion animation
// engine out of the main synchronous bundle. Passing a function (rather
// than the `domAnimation` feature bundle directly) is what tells the
// bundler to fetch ./motion-features as its own async chunk in parallel,
// instead of folding animations + hover/tap/focus gestures + AnimatePresence
// + whileInView — everything this app actually uses; no drag, no layout
// animations — into the main bundle's parse/eval cost. `strict` makes
// LazyMotion throw if any `motion.*` component slips in instead of `m.*`,
// which is exactly the safety net we want here — it would silently defeat
// this optimization otherwise.
//
// reducedMotion="user" makes every Framer Motion animation in the tree
// automatically honor prefers-reduced-motion — the CSS-level override in
// globals.css only catches CSS transitions/animations, not Motion's
// JS-driven ones, so this is the other half of that same requirement.
const loadFeatures = () => import("@/lib/motion-features").then((mod) => mod.default);

export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
