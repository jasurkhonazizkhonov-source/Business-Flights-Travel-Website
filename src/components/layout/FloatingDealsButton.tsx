"use client";

import { useEffect, useRef, useState } from "react";
import { PhoneCall } from "lucide-react";
import { motion } from "framer-motion";
import { CONTACT_PHONE_DISPLAY, CONTACT_PHONE_E164 } from "@/lib/constants";

// Persistent, viewport-fixed CTA — stays visible while scrolling. Kept
// compact on mobile (icon + short label) so it never covers the flight
// form's fields or the bottom-of-screen area a thumb needs for scrolling.
//
// It temporarily hides itself while any element marked
// `data-hide-floating-cta` (e.g. a page's own full-width submit button) is
// near the bottom of the viewport, so this fixed pill never sits on top of
// — and intercepts taps meant for — another primary call-to-action.
export function FloatingDealsButton() {
  const [hidden, setHidden] = useState(false);
  // Tracks which observed elements are currently intersecting — a Set kept
  // across observer callbacks, since each callback only reports elements
  // whose state just changed, not the full current state of every target.
  const intersecting = useRef<Set<Element>>(new Set());

  useEffect(() => {
    const targets = document.querySelectorAll<HTMLElement>("[data-hide-floating-cta]");
    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) intersecting.current.add(entry.target);
          else intersecting.current.delete(entry.target);
        }
        setHidden(intersecting.current.size > 0);
      },
      // A little extra margin at the bottom so the pill steps aside slightly
      // before the button it would otherwise cover is even fully in view.
      { rootMargin: "0px 0px -72px 0px", threshold: 0 },
    );

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <motion.a
      href={`tel:${CONTACT_PHONE_E164}`}
      initial={{ opacity: 0, y: 12 }}
      animate={hidden ? { opacity: 0, y: 12 } : { opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      whileHover={hidden ? undefined : { scale: 1.03 }}
      whileTap={hidden ? undefined : { scale: 0.97 }}
      aria-hidden={hidden}
      tabIndex={hidden ? -1 : undefined}
      // No aria-label: the visible text (below) is already a clear, fully
      // sufficient accessible name on its own — "Best Deals" on mobile,
      // "Call for the Best Deals" + the phone number on desktop. A custom
      // aria-label here would need to reproduce that text byte-for-byte
      // (including whatever whitespace the browser's own accessible-name
      // computation inserts between the two adjacent <span>s) to satisfy
      // WCAG 2.5.3 "Label in Name" — letting the browser compute it from
      // the actual content instead guarantees the two can never drift.
      className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-[var(--color-gold-500)] px-4 py-3 text-[var(--color-navy-950)] shadow-[0_12px_32px_-8px_rgba(10,26,48,0.45)] transition-colors hover:bg-[var(--color-gold-400)] sm:bottom-6 sm:right-6 sm:px-5 sm:py-3.5"
      style={hidden ? { pointerEvents: "none" } : undefined}
    >
      <PhoneCall size={18} className="shrink-0" strokeWidth={2.25} />
      <span className="flex flex-col leading-tight">
        <span className="text-xs font-semibold sm:text-sm">
          <span className="sm:hidden">Best Deals</span>
          <span className="hidden sm:inline">Call for the Best Deals</span>
        </span>
        <span className="hidden text-[0.7rem] font-medium text-[var(--color-navy-950)]/80 sm:inline">{CONTACT_PHONE_DISPLAY}</span>
      </span>
    </motion.a>
  );
}
