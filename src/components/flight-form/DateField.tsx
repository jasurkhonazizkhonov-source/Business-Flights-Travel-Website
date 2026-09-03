"use client";

import { useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import { motion } from "framer-motion";
import { CalendarDays } from "lucide-react";
import { format } from "date-fns";
import "react-day-picker/style.css";
import { useClickOutside } from "@/hooks/useClickOutside";
import { usePopoverAlign } from "@/hooks/usePopoverAlign";
import { cn } from "@/lib/cn";

function parseIso(value: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function toIso(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function DateField({
  label,
  value,
  onChange,
  minDate,
  error,
  placeholder = "Select date",
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  minDate?: Date;
  error?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  useClickOutside(containerRef, () => setOpen(false), open);
  const align = usePopoverAlign(containerRef, open, 320);

  const selected = parseIso(value);
  const floor = minDate ?? new Date(new Date().setHours(0, 0, 0, 0));
  const maxDate = new Date();
  maxDate.setFullYear(maxDate.getFullYear() + 1);

  return (
    <div className="relative" ref={containerRef}>
      <label className="mb-1.5 block text-xs font-semibold tracking-wide text-[var(--color-navy-700)]">{label}</label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-xl border bg-white px-3.5 py-3 text-left text-sm text-[var(--color-navy-950)] transition-colors",
          error ? "border-red-400" : "border-[var(--color-navy-950)]/12 hover:border-[var(--color-navy-950)]/25",
          open && "border-[var(--color-gold-500)] ring-2 ring-[var(--color-gold-400)]/30",
        )}
      >
        <CalendarDays size={17} className="shrink-0 text-[var(--color-navy-600)]" aria-hidden="true" />
        <span className={cn(!selected && "text-[var(--color-navy-950)]/65")}>
          {selected ? format(selected, "EEE, MMM d, yyyy") : placeholder}
        </span>
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}

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
      <motion.div
        animate={open ? { opacity: 1 } : { opacity: 0 }}
        initial={false}
        transition={{ duration: 0.16, ease: "easeOut" }}
        role="dialog"
        inert={!open}
        className={cn(
          "absolute z-30 mt-2 w-max max-w-[calc(100vw-2.5rem)] overflow-x-auto rounded-2xl border border-[var(--color-navy-950)]/10 bg-white p-2.5 shadow-xl sm:p-3",
          align === "right" ? "right-0" : "left-0",
        )}
      >
        <DayPicker
          mode="single"
          selected={selected}
          defaultMonth={selected ?? floor}
          startMonth={floor}
          endMonth={maxDate}
          disabled={{ before: floor, after: maxDate }}
          onSelect={(date) => {
            if (!date) return;
            onChange(toIso(date));
            setOpen(false);
          }}
          className="bfw-daypicker"
        />
      </motion.div>
    </div>
  );
}
