"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Users, Minus, Plus } from "lucide-react";
import { useClickOutside } from "@/hooks/useClickOutside";
import { usePopoverAlign } from "@/hooks/usePopoverAlign";
// Imported from the zod-free options module, not from
// @/lib/validations/flight-request, so this client component's bundle
// doesn't pull in zod and the full validation schema — see the comment in
// flight-request-options.ts.
import { CABIN_CLASSES } from "@/lib/validations/flight-request-options";
import { cn } from "@/lib/cn";

const CABIN_LABELS: Record<(typeof CABIN_CLASSES)[number], string> = {
  ECONOMY: "Economy",
  PREMIUM_ECONOMY: "Premium Economy",
  BUSINESS: "Business",
  FIRST: "First Class",
};

type Passengers = { adults: number; children: number; infants: number };

function Stepper({
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <div>
        <p className="text-sm font-medium text-[var(--color-navy-950)]">{label}</p>
        <p className="text-xs text-[var(--color-navy-950)]/65">{hint}</p>
      </div>
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
          aria-label={`Decrease ${label}`}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--color-navy-950)]/15 text-[var(--color-navy-900)] transition-colors hover:bg-[var(--color-cream-100)] disabled:opacity-30"
        >
          <Minus size={15} />
        </button>
        <span className="w-5 text-center text-sm font-semibold tabular-nums">{value}</span>
        <button
          type="button"
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
          aria-label={`Increase ${label}`}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--color-navy-950)]/15 text-[var(--color-navy-900)] transition-colors hover:bg-[var(--color-cream-100)] disabled:opacity-30"
        >
          <Plus size={15} />
        </button>
      </div>
    </div>
  );
}

export function PassengerCabinField({
  passengers,
  onPassengersChange,
  cabinClass,
  onCabinClassChange,
}: {
  passengers: Passengers;
  onPassengersChange: (p: Passengers) => void;
  cabinClass: (typeof CABIN_CLASSES)[number];
  onCabinClassChange: (c: (typeof CABIN_CLASSES)[number]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);
  const align = usePopoverAlign(ref, open, 320);

  const total = passengers.adults + passengers.children + passengers.infants;

  return (
    <div className="relative" ref={ref}>
      <label className="mb-1.5 block text-xs font-semibold tracking-wide text-[var(--color-navy-700)]">Travelers &amp; Cabin</label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-xl border bg-white px-3.5 py-3 text-left text-sm text-[var(--color-navy-950)] transition-colors",
          "border-[var(--color-navy-950)]/12 hover:border-[var(--color-navy-950)]/25",
          open && "border-[var(--color-gold-500)] ring-2 ring-[var(--color-gold-400)]/30",
        )}
      >
        <Users size={17} className="shrink-0 text-[var(--color-navy-600)]" aria-hidden="true" />
        <span className="truncate">
          {total} {total === 1 ? "Traveler" : "Travelers"} · {CABIN_LABELS[cabinClass]}
        </span>
      </button>

      {/* Always mounted; visibility/interactivity driven reactively by
          `animate`/`inert` rather than AnimatePresence mount-unmount — see
          the comment in DateField.tsx for why a conditionally-*mounted*
          popover makes `inert={!open}` a tautology once framer-motion's
          exit-clone freezes it. */}
      <motion.div
        animate={open ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: -6, scale: 0.98 }}
        initial={false}
        transition={{ duration: 0.16, ease: "easeOut" }}
        role="dialog"
        inert={!open}
        className={cn(
          "absolute z-30 mt-2 w-80 max-w-[calc(100vw-2.5rem)] rounded-2xl border border-[var(--color-navy-950)]/10 bg-white p-4 shadow-xl",
          align === "right" ? "right-0" : "left-0",
        )}
      >
            <div className="divide-y divide-[var(--color-navy-950)]/8">
              <Stepper
                label="Adults"
                hint="Age 18+"
                value={passengers.adults}
                min={1}
                max={9}
                onChange={(v) => onPassengersChange({ ...passengers, adults: v })}
              />
              <Stepper
                label="Children"
                hint="Age 2–17"
                value={passengers.children}
                min={0}
                max={8}
                onChange={(v) => onPassengersChange({ ...passengers, children: v })}
              />
              <Stepper
                label="Infants"
                hint="Under 2, on lap"
                value={passengers.infants}
                min={0}
                max={passengers.adults}
                onChange={(v) => onPassengersChange({ ...passengers, infants: v })}
              />
            </div>

            <div className="mt-3 border-t border-[var(--color-navy-950)]/8 pt-3">
              <p className="mb-2 text-xs font-semibold tracking-wide text-[var(--color-navy-700)]">Cabin Class</p>
              <div className="grid grid-cols-2 gap-2">
                {CABIN_CLASSES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => onCabinClassChange(c)}
                    className={cn(
                      "min-h-11 rounded-lg border px-3 py-2.5 text-xs font-medium transition-colors",
                      cabinClass === c
                        ? "border-[var(--color-navy-900)] bg-[var(--color-navy-900)] text-white"
                        : "border-[var(--color-navy-950)]/15 text-[var(--color-navy-800)] hover:border-[var(--color-navy-950)]/30",
                    )}
                  >
                    {CABIN_LABELS[c]}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-4 min-h-11 w-full rounded-lg bg-[var(--color-navy-950)] py-3 text-sm font-semibold text-white hover:bg-[var(--color-gold-600)]"
            >
              Done
            </button>
      </motion.div>
    </div>
  );
}
