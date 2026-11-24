import { useEffect, useState, type CSSProperties, type RefObject } from "react";

/** The popover's own padding (p-2.5 = 10px each side) plus its 1px border each side: what the calendar grid cannot use. */
const POPOVER_CHROME_PX = 22;
const GUTTER_PX = 8;
/** react-day-picker draws a day as a button inside a cell; the button is 2px smaller (the default is a 44px cell with a 42px button). */
const MAX_CELL_PX = 46;
const MIN_CELL_PX = 34;
const SMALL_SCREEN = "(max-width: 639.98px)";

export type FullWidthGeometry = {
  /** Inline position of the popover, relative to its trigger's container: spans the screen with an 8px gutter on each side. */
  popoverStyle: CSSProperties;
  /** react-day-picker size variables: seven cells fill the popover, up to 46px (a 44px day button). */
  calendarStyle: CSSProperties;
  cellPx: number;
};

/**
 * A calendar popover anchored to its field is only as wide as the space to the right of that field's left edge, and the field is inset from the screen by the page and
 * card padding. On a 320-375px phone that left room for 32px day buttons (and any wider cell pushed the invisible, closed popover past the screen and made the page scroll
 * sideways). Below 640px the OPEN popover therefore spans the screen width (8px gutters) and its seven columns share that width: 44px day buttons from about 360px
 * up, and the largest that fits (about 38px) at 320px. Nothing changes from 640px up, and nothing is returned while the popover is closed (the caller hides it
 * from layout on small screens, so it cannot widen the page either).
 */
export function useFullWidthPopover(containerRef: RefObject<HTMLElement | null>, open: boolean): FullWidthGeometry | null {
  const [geometry, setGeometry] = useState<FullWidthGeometry | null>(null);

  useEffect(() => {
    if (!open) return;
    const query = window.matchMedia(SMALL_SCREEN);
    function measure() {
      const el = containerRef.current;
      if (!el || !query.matches) {
        setGeometry(null);
        return;
      }
      const left = el.getBoundingClientRect().left;
      const width = document.documentElement.clientWidth - GUTTER_PX * 2;
      const cellPx = Math.max(MIN_CELL_PX, Math.min(MAX_CELL_PX, Math.floor((width - POPOVER_CHROME_PX) / 7)));
      setGeometry({
        popoverStyle: { left: GUTTER_PX - left, right: "auto", width, maxWidth: "none" },
        calendarStyle: {
          ["--rdp-day-width" as string]: `${cellPx}px`,
          ["--rdp-day-height" as string]: `${cellPx}px`,
          ["--rdp-day_button-width" as string]: `${cellPx - 2}px`,
          ["--rdp-day_button-height" as string]: `${cellPx - 2}px`,
          fontSize: "0.875rem",
        },
        cellPx,
      });
    }
    // On the next frame, not synchronously: the popover is still fading in from transparent, so the first measurement costs no visible jump.
    const frame = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    query.addEventListener("change", measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      query.removeEventListener("change", measure);
    };
  }, [containerRef, open]);

  return open ? geometry : null;
}
