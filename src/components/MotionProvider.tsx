"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

// reducedMotion="user" makes every Framer Motion animation in the tree
// automatically honor prefers-reduced-motion — the CSS-level override in
// globals.css only catches CSS transitions/animations, not Motion's
// JS-driven ones, so this is the other half of that same requirement.
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
