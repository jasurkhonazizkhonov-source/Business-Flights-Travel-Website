"use client";

import { useEffect, useRef, useState } from "react";
import { PhoneCall } from "lucide-react";
import { m } from "framer-motion";
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
  const [coversCta, setCoversCta] = useState(false);
  // While someone is typing in a field (on a phone the on-screen keyboard raises
  // this fixed pill to sit right over the field being edited) it steps aside too.
  const [fieldFocused, setFieldFocused] = useState(false);
  // While a date / traveler / menu popup is open this fixed pill sat on top of its bottom-right corner: on a phone it
  // covered two selectable calendar days, so tapping them started a phone call (`tel:`) instead of choosing the date.
  const [popupOpen, setPopupOpen] = useState(false);
  // The cookie banner is fixed above this pill (z-50 vs z-40) and is mounted after this component's observer ran, so the pill stayed
  // focusable while completely hidden underneath it (WCAG 2.4.11 failure, caught at 1280x720). It steps aside until a choice is made.
  const [cookieBannerOpen, setCookieBannerOpen] = useState(false);
  const hidden = coversCta || fieldFocused || popupOpen || cookieBannerOpen;
  // Tracks which observed elements are currently intersecting — a Set kept
  // across observer callbacks, since each callback only reports elements
  // whose state just changed, not the full current state of every target.
  const intersecting = useRef<Set<Element>>(new Set());

  useEffect(() => {
    const isField = (t: EventTarget | null) => t instanceof HTMLElement && t.matches("input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea, select");
    const onIn = (e: FocusEvent) => { if (isField(e.target)) setFieldFocused(true); };
    const onOut = () => setFieldFocused(false);
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    return () => {
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const check = () => setCookieBannerOpen(root.dataset.cookieBanner === "open");
    const observer = new MutationObserver(check);
    observer.observe(root, { attributes: true, attributeFilter: ["data-cookie-banner"] });
    check();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const check = () => setPopupOpen(document.querySelector('[aria-haspopup][aria-expanded="true"]') !== null);
    const observer = new MutationObserver(check);
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["aria-expanded"] });
    check();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const targets = document.querySelectorAll<HTMLElement>("[data-hide-floating-cta]");
    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) intersecting.current.add(entry.target);
          else intersecting.current.delete(entry.target);
        }
        setCoversCta(intersecting.current.size > 0);
      },
      // A little extra margin at the bottom so the pill steps aside slightly
      // before the button it would otherwise cover is even fully in view.
      { rootMargin: "0px 0px -72px 0px", threshold: 0 },
    );

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    // A landmark of its own: this fixed link sits outside <main>/<header>/<footer>, so without one
    // axe's `region` rule (best practice) reports its text as content outside any landmark.
    <aside aria-label="Call us">
    <m.a
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
        <span className="hidden text-xs font-medium text-[var(--color-navy-950)]/85 sm:inline">{CONTACT_PHONE_DISPLAY}</span>
      </span>
    </m.a>
    </aside>
  );
}
