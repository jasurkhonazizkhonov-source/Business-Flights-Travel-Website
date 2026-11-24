"use client";

import { useId, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { m } from "framer-motion";
import { CalendarDays } from "lucide-react";
import { differenceInCalendarDays, format } from "date-fns";
import { useClickOutside } from "@/hooks/useClickOutside";
import { usePopoverAlign } from "@/hooks/usePopoverAlign";
import { useScrollPopoverIntoView } from "@/hooks/useScrollPopoverIntoView";
import { useFullWidthPopover } from "@/hooks/useFullWidthPopover";
import { cn } from "@/lib/cn";
import { maxSelectableDate } from "@/lib/flight-date-window";
import { FieldError } from "@/components/forms/FieldError";

// react-day-picker (+ its CSS, pulled in inside DayPickerCalendar.tsx) is
// fetched as its own chunk instead of bundling straight into this
// always-mounted-in-the-hero component — see the comment on
// DeferredFloatingDealsButton for why `ssr: false` here is safe even though
// this calendar is always present (just opacity/inert-hidden) rather than
// conditionally mounted. No loading fallback is needed: it's invisible
// behind `inert`/opacity:0 until a user opens it, well after this chunk has
// had time to load in the background.
const DayPickerCalendar = dynamic(() => import("./DayPickerCalendar").then((mod) => mod.DayPickerCalendar), {
  ssr: false,
});

function parseIso(value: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function toIso(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** How the visitor last interacted with the calendar: decides whether a tap selects at once or first previews the range. */
type PointerKind = "mouse" | "touch" | "keyboard";

export function DateField({
  label,
  value,
  onChange,
  minDate,
  error,
  placeholder = "Select date",
  rangeStart,
  rangeEnd,
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  minDate?: Date;
  error?: string;
  placeholder?: string;
  /**
   * Round-trip RETURN field: the departure date (ISO). The calendar then shows the departure → return range and previews it
   * while the visitor hovers (mouse), moves focus (keyboard) or taps (touch: tap previews, a second tap or the button confirms).
   * The caller already passes the departure date as `minDate`, so no earlier return date can be chosen.
   */
  rangeStart?: string;
  /** Round-trip DEPARTURE field: the chosen return date (ISO) — shown as a highlighted range when the calendar is reopened. */
  rangeEnd?: string;
}) {
  const [open, setOpen] = useState(false);
  // Range preview state. `preview` follows the mouse / keyboard focus; `pending` is a touch tap that is not confirmed yet.
  const [preview, setPreview] = useState<Date | undefined>();
  const [pending, setPending] = useState<Date | undefined>();
  const pointerRef = useRef<PointerKind>("mouse");
  const containerRef = useRef<HTMLDivElement>(null);
  const labelId = useId();
  const valueId = useId();
  const errorId = useId();
  const summaryId = useId();

  function close() {
    setOpen(false);
    setPreview(undefined);
    setPending(undefined);
  }
  useClickOutside(containerRef, close, open);
  const align = usePopoverAlign(containerRef, open, 320);
  useScrollPopoverIntoView(containerRef, open);
  // Below 640px the open calendar spans the screen (see the hook): 44px day buttons instead of 32px, inside the viewport. Null from 640px up and while closed.
  const phone = useFullWidthPopover(containerRef, open);

  const selected = parseIso(value);
  const floor = minDate ?? new Date(new Date().setHours(0, 0, 0, 0));
  // The last bookable day: 11 calendar months after today (src/lib/flight-date-window.ts; the server applies the same rule).
  const maxDate = maxSelectableDate();

  // --- date-range display -------------------------------------------------------------------------------------------------
  const start = rangeStart ? parseIso(rangeStart) : undefined;
  const previewing = Boolean(start); // return field of a round trip
  const rangeFrom = previewing ? start : rangeEnd ? selected : undefined;
  const rangeTo = previewing ? (pending ?? preview ?? selected) : rangeEnd ? parseIso(rangeEnd) : undefined;
  const hasRange = Boolean(rangeFrom && rangeTo && rangeTo.getTime() > rangeFrom.getTime());
  const nights = hasRange ? differenceInCalendarDays(rangeTo!, rangeFrom!) : 0;
  const summary =
    previewing && rangeFrom && rangeTo
      ? hasRange
        ? `${format(rangeFrom, "EEE, MMM d")} → ${format(rangeTo, "EEE, MMM d")} · ${nights} ${nights === 1 ? "night" : "nights"}`
        : `${format(rangeTo, "EEE, MMM d")} · same-day return`
      : previewing && rangeFrom
        ? `Departing ${format(rangeFrom, "EEE, MMM d")} — choose a return date`
        : "";

  function commit(date: Date) {
    onChange(toIso(date));
    close();
  }

  return (
    <div className="relative" ref={containerRef}>
      <label id={labelId} className="mb-1.5 block text-xs font-semibold tracking-wide text-[var(--color-navy-700)]">
        {label}
      </label>
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="dialog"
        aria-expanded={open}
        // Name = the label PLUS the current value ("Departure Date Tue, Nov 3, 2026" / "… Select date"). With the
        // label alone, aria-labelledby replaced the button's own text, so a screen reader never announced which
        // date was chosen (WCAG 4.1.2 Name, Role, Value).
        aria-labelledby={`${labelId} ${valueId}`}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-xl border bg-white px-3.5 py-3 text-left text-sm text-[var(--color-navy-950)] transition-colors",
          error ? "border-red-400" : "border-[var(--color-navy-950)]/12 hover:border-[var(--color-navy-950)]/25",
          open && "border-[var(--color-gold-500)] ring-2 ring-[var(--color-gold-400)]/30",
        )}
      >
        <CalendarDays size={17} className="shrink-0 text-[var(--color-navy-600)]" aria-hidden="true" />
        <span id={valueId} className={cn(!selected && "text-[var(--color-navy-950)]/65")}>
          {selected ? format(selected, "EEE, MMM d, yyyy") : placeholder}
        </span>
      </button>
      {error && <FieldError id={errorId}>{error}</FieldError>}

      {/* Always mounted (not conditionally rendered via AnimatePresence) —
          visibility/interactivity are driven reactively by `animate` and
          `inert`, not by mount/unmount. AnimatePresence's exit-clone freezes
          whatever props an element had on its last "present" render, so a
          prop computed from the same condition that gates presence (like
          `!open` when presence itself already implies `open`) is a
          tautology that can never flip back once frozen — react-day-picker
          also sets its own explicit `pointer-events` on day buttons, which
          would override an inherited `pointer-events: none` from a parent
          even if that part weren't frozen. A persistently-mounted element
          has neither problem: every prop, `inert` included, re-evaluates on
          every real render, and `inert` overrides descendant CSS entirely. */}
      {/* Opacity-only entrance — no `y`/`scale` — for the same reason the
          mega menu's panel is opacity-only (see DestinationsMegaMenu.tsx):
          a transform on this wrapper shifts every day button's real
          rendered/hit-tested position for the whole transition, so a click
          landing early in that window can miss the day it visually
          appears to be on. */}
      <m.div
        animate={open ? { opacity: 1 } : { opacity: 0 }}
        initial={false}
        transition={{ duration: 0.16, ease: "easeOut" }}
        role="dialog"
        aria-labelledby={labelId}
        inert={!open}
        style={phone?.popoverStyle}
        // Records HOW the visitor interacts, so a touch tap can preview the range first while a mouse click or the keyboard
        // selects at once (hover does not exist on touch screens).
        onPointerDownCapture={(e) => {
          pointerRef.current = e.pointerType === "mouse" ? "mouse" : "touch";
        }}
        onKeyDownCapture={() => {
          pointerRef.current = "keyboard";
        }}
        onMouseLeave={() => setPreview(undefined)}
        className={cn(
          "absolute z-30 mt-2 w-max max-w-[calc(100vw-2.5rem)] overflow-x-auto rounded-2xl border border-[var(--color-navy-950)]/10 bg-white p-2.5 shadow-xl sm:p-3",
          align === "right" ? "right-0" : "left-0",
          // Closed, the popover is invisible and inert; on a phone it also leaves the layout, so it can never widen the page (it needs no measuring while closed).
          !open && "max-sm:hidden",
        )}
      >
        <DayPickerCalendar
          // react-day-picker keeps the month it is showing and only reads `defaultMonth` once. The calendars stay mounted, so a
          // return calendar created while today's month was the floor kept showing that month after the departure moved to a
          // later one — an empty month with every day before the floor, so the visitor had to page forward to find any date.
          // A new key whenever the calendar opens (or the month it should open on changes) restores `defaultMonth`.
          key={`${open ? "open" : "closed"}-${format(selected ?? floor, "yyyy-MM")}`}
          mode="single"
          selected={selected}
          defaultMonth={selected ?? floor}
          startMonth={floor}
          endMonth={maxDate}
          disabled={{ before: floor, after: maxDate }}
          // Custom modifier names (not react-day-picker's own range_* names, which belong to its range mode).
          modifiers={{
            bfw_range_start: rangeFrom,
            bfw_range_start_band: hasRange ? rangeFrom : undefined,
            bfw_range_end: hasRange ? rangeTo : undefined,
            bfw_range_middle: hasRange ? { after: rangeFrom!, before: rangeTo! } : undefined,
            bfw_range_preview: previewing && hasRange && (pending ?? preview) ? (pending ?? preview) : undefined,
          }}
          modifiersClassNames={{
            bfw_range_start: "bfw-range-start",
            bfw_range_start_band: "bfw-range-start-band",
            bfw_range_end: "bfw-range-end",
            bfw_range_middle: "bfw-range-middle",
            bfw_range_preview: "bfw-range-preview",
          }}
          // Mouse hover and keyboard focus preview the range; the preview is only a preview — nothing is selected until a
          // click / Enter / (touch) confirmation.
          onDayMouseEnter={(date, modifiers) => {
            if (previewing && pointerRef.current === "mouse" && !modifiers.disabled) setPreview(date);
          }}
          onDayFocus={(date, modifiers) => {
            if (previewing && pointerRef.current !== "touch" && !modifiers.disabled) setPreview(date);
          }}
          onDayBlur={() => setPreview(undefined)}
          onSelect={(date) => {
            if (!date) return;
            if (previewing && pointerRef.current === "touch") {
              // Touch: the first tap shows the range, tapping the same day again (or the button below) confirms it.
              if (!pending || pending.getTime() !== date.getTime()) {
                setPending(date);
                return;
              }
            }
            commit(date);
          }}
          className="bfw-daypicker"
          style={phone?.calendarStyle}
        />
        {/* Only while open: the date depends on today, and this component is also part of the pages that are prerendered at build time. */}
        {open && <p className="mt-1 px-1 text-center text-[11px] text-[var(--color-navy-950)]/65">Flights can be requested until {format(maxDate, "MMM d, yyyy")}.</p>}
        {previewing && (
          <div className="mt-1 border-t border-[var(--color-navy-950)]/8 px-1 pt-2 text-center">
            <p id={summaryId} aria-live="polite" className="min-h-5 text-xs font-medium text-[var(--color-navy-800)]">
              {summary}
            </p>
            {pending && (
              <button
                type="button"
                onClick={() => commit(pending)}
                className="mt-2 min-h-11 w-full rounded-full bg-[var(--color-navy-950)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-gold-600)]"
              >
                Select {format(pending, "EEE, MMM d")} as return date
              </button>
            )}
          </div>
        )}
      </m.div>
    </div>
  );
}
