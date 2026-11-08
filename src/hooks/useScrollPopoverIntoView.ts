import { useEffect, type RefObject } from "react";

/**
 * The date and traveller popovers open BELOW their trigger. On the home page (the form sits at the bottom of the first screen)
 * and on a phone, that put most of the calendar under the fold: measured on the production build at 375x812, `/flights` opens
 * the calendar at y=678..948 in an 812px viewport, and on `/` at 1440x900 it opens at y=762..1086 - so the last rows of days
 * (and the month arrows' neighbours) were off screen until the visitor noticed and scrolled.
 *
 * When a popover opens and its bottom edge is past the viewport, scroll the page just far enough to show it, but never so far
 * that the trigger itself would slide under the sticky header. Honours `prefers-reduced-motion` (instant instead of smooth).
 * Nothing happens when the popover already fits, so desktop layouts that have room are unchanged.
 */
export function useScrollPopoverIntoView(containerRef: RefObject<HTMLElement | null>, open: boolean) {
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const container = containerRef.current;
      const popover = container?.querySelector<HTMLElement>('[role="dialog"]');
      if (!container || !popover) return;
      const margin = 16;
      const overflow = popover.getBoundingClientRect().bottom - (window.innerHeight - margin);
      if (overflow <= 0) return;
      const room = Math.max(0, container.getBoundingClientRect().top - 96); // 96 = sticky header + breathing room
      const delta = Math.min(overflow, room);
      if (delta <= 0) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollBy({ top: delta, behavior: reduce ? "auto" : "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [containerRef, open]);
}
