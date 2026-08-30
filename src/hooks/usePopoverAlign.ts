import { useLayoutEffect, useState, type RefObject } from "react";

/**
 * A popover anchored to its trigger's left edge (the default for every
 * dropdown in the flight form) overflows the viewport whenever that
 * trigger sits in the right-hand column of a multi-column row — e.g. the
 * "Departure Date" field, third in the From/To/Date row. Measures whether
 * the popover would run past the right edge if left-aligned, and flips to
 * right-aligned when it would.
 *
 * Measures on mount, not just on open: the popover itself is always
 * mounted (see the comment in DateField.tsx on why — it's shown/hidden via
 * `inert` + opacity rather than conditional rendering), so even while
 * closed and invisible it has a real position and width that contributes
 * to the page's layout and scrollable area. A field that's never been
 * opened previously kept the default "left" alignment indefinitely — for
 * a field in the right-hand column, that silently overflowed the
 * viewport's right edge and produced a horizontal scrollbar for the whole
 * page, even though nothing was visibly open. Re-measures on resize too,
 * since a viewport resize can flip which side has room.
 */
export function usePopoverAlign(containerRef: RefObject<HTMLElement | null>, open: boolean, popoverWidth: number) {
  const [align, setAlign] = useState<"left" | "right">("left");

  useLayoutEffect(() => {
    function measure() {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const margin = 16;
      const overflowsRight = rect.left + popoverWidth > window.innerWidth - margin;
      const fitsLeft = rect.right - popoverWidth >= margin;
      setAlign(overflowsRight && fitsLeft ? "right" : "left");
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [containerRef, open, popoverWidth]);

  return align;
}
