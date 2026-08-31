"use client";

import { useEffect, useId, useRef, useState } from "react";
import { motion } from "framer-motion";
import { PlaneTakeoff, PlaneLanding } from "lucide-react";
import { useClickOutside } from "@/hooks/useClickOutside";
import { cn } from "@/lib/cn";
import { searchAirports } from "@/data/airports";
import type { AirportOption } from "@/lib/validations/flight-request";

function labelFor(airport: AirportOption | null): string {
  return airport ? `${airport.city} (${airport.iata})` : "";
}

export function AirportAutocomplete({
  label,
  value,
  onChange,
  icon = "from",
  error,
  placeholder = "City or airport code",
}: {
  label: string;
  value: AirportOption | null;
  onChange: (airport: AirportOption) => void;
  icon?: "from" | "to";
  error?: string;
  placeholder?: string;
}) {
  const [query, setQuery] = useState(labelFor(value));
  const [results, setResults] = useState<AirportOption[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  // Adjusting state during render (React's recommended alternative to an
  // effect for "sync local state when a prop changes") — a parent-driven
  // selection change updates the displayed text immediately, in the same
  // render, instead of one render behind via an effect.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setQuery(labelFor(value));
  }

  useClickOutside(containerRef, () => setOpen(false), open);

  const trimmedQuery = query.trim();
  const isSearchable = trimmedQuery.length >= 2 && query !== labelFor(value);

  // Filtering an in-memory array of a few hundred airports (src/data/airports.ts)
  // is effectively instant, so there's no network round trip, no debounce,
  // no loading state — just a plain effect that recomputes `results`
  // whenever the query changes. (Still an effect rather than inline
  // during-render computation: `searchAirports` returns a new array each
  // call, so comparing it against state by reference on every render would
  // never converge.) This is also what makes airport search work
  // identically no matter which PostgreSQL database — or none at all — the
  // site is connected to.
  useEffect(() => {
    if (!isSearchable) return;
    setResults(searchAirports(trimmedQuery));
  }, [trimmedQuery, isSearchable]);

  const showResults = open && isSearchable && results.length > 0;
  const Icon = icon === "from" ? PlaneTakeoff : PlaneLanding;

  return (
    <div className="relative" ref={containerRef}>
      <label className="mb-1.5 block text-xs font-semibold tracking-wide text-[var(--color-navy-700)]">{label}</label>
      <div
        className={cn(
          "flex items-center gap-2.5 rounded-xl border bg-white px-3.5 py-3 transition-colors",
          error ? "border-red-400" : "border-[var(--color-navy-950)]/12 focus-within:border-[var(--color-gold-500)] focus-within:ring-2 focus-within:ring-[var(--color-gold-400)]/30",
        )}
      >
        <Icon size={17} className="shrink-0 text-[var(--color-navy-600)]" aria-hidden="true" />
        <input
          type="text"
          value={query}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          className="w-full bg-transparent text-sm text-[var(--color-navy-950)] outline-none placeholder:text-[var(--color-navy-950)]/40"
          autoComplete="off"
          role="combobox"
          aria-expanded={showResults}
          aria-controls={listboxId}
          aria-autocomplete="list"
        />
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}

      {/* Mounted whenever there are results at all, independent of `open` —
          visibility/interactivity are driven reactively by `animate` and
          `inert` instead of by AnimatePresence mount/unmount. An
          AnimatePresence exit-clone freezes whatever props the element had
          on its last "wanted" render, so any prop computed from the same
          condition that gates presence (e.g. `!open` when presence already
          implies `open`) is a tautology that can never flip back once
          frozen — which is exactly how `inert` ended up permanently `false`
          on a lingering, invisible-but-still-clickable exit-clone here. A
          persistently-mounted element has no such freeze: every prop,
          `inert` included, re-evaluates on every real render. */}
      {results.length > 0 && (
          <motion.ul
            id={listboxId}
            animate={showResults ? { opacity: 1, y: 0 } : { opacity: 0, y: -6 }}
            initial={false}
            transition={{ duration: 0.14 }}
            inert={!showResults}
            className="absolute z-30 mt-2 max-h-72 w-full max-w-[calc(100vw-2.5rem)] overflow-auto rounded-xl border border-[var(--color-navy-950)]/10 bg-white py-1.5 shadow-xl"
            role="listbox"
          >
            {results.map((r) => (
              <li key={r.iata}>
                <button
                  type="button"
                  role="option"
                  aria-selected={value?.iata === r.iata}
                  onClick={() => {
                    onChange(r);
                    setQuery(`${r.city} (${r.iata})`);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-[var(--color-cream-100)]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[var(--color-navy-950)]">
                      {r.city}, {r.country}
                    </span>
                    <span className="block truncate text-xs text-[var(--color-navy-950)]/65">{r.name}</span>
                  </span>
                  <span className="shrink-0 rounded bg-[var(--color-cream-100)] px-1.5 py-0.5 text-xs font-semibold text-[var(--color-navy-700)]">
                    {r.iata}
                  </span>
                </button>
              </li>
            ))}
          </motion.ul>
      )}
    </div>
  );
}
