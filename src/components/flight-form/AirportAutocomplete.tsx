"use client";

import { useEffect, useId, useRef, useState } from "react";
import { motion } from "framer-motion";
import { PlaneTakeoff, PlaneLanding, Loader2 } from "lucide-react";
import { useClickOutside } from "@/hooks/useClickOutside";
import { cn } from "@/lib/cn";
import { prefetchAirports, searchAirports } from "@/data/airports";
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
  const [loading, setLoading] = useState(false);
  // -1 = no option highlighted (plain typing). Set by ArrowUp/ArrowDown,
  // consumed by Enter — the keyboard half of this combobox, which previously
  // had none: the roles/aria attributes below described a combobox, but
  // there was no way to reach or choose an option without a mouse.
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  function selectOption(option: AirportOption) {
    onChange(option);
    setQuery(`${option.city} (${option.iata})`);
    setOpen(false);
    setHighlightedIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showResults) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      if (highlightedIndex < 0) return; // let the form submit normally when nothing is highlighted
      e.preventDefault();
      selectOption(results[highlightedIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setHighlightedIndex(-1);
    }
  }

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

  // Warm the lazy-loaded airport dataset shortly after mount, well after
  // this field has had its chance to paint and become interactive, so it's
  // typically already cached by the time the user focuses the field and
  // starts typing. Both the "From" and "To" instances of this component
  // call this independently — harmless, since the underlying load is
  // memoized module-wide and only ever fetched once.
  useEffect(() => {
    // This form renders directly in the homepage hero (Hero.tsx), so this
    // effect runs on the site's single most-visited page. requestIdleCallback
    // alone isn't a strong enough guarantee that the ~770KB airports.json
    // fetch+parse (the largest single chunk in the app) stays out of the
    // window performance tools measure Total Blocking Time over: the browser
    // can report an idle gap between early paint frames well before other
    // startup work (image decode, hydration) has actually settled. Waiting
    // for the page's `load` event first, on top of requestIdleCallback,
    // keeps this speculative fetch from competing with that critical work —
    // it still typically completes well before a real user finishes reading
    // the hero and focuses the field, which is all this is for.
    let cancelled = false;
    let cancelIdle: (() => void) | undefined;

    function schedule() {
      if (cancelled) return;
      if (typeof requestIdleCallback === "function") {
        const idleId = requestIdleCallback(() => prefetchAirports(), { timeout: 4000 });
        cancelIdle = () => cancelIdleCallback(idleId);
      } else {
        const timeoutId = window.setTimeout(() => prefetchAirports(), 1500);
        cancelIdle = () => window.clearTimeout(timeoutId);
      }
    }

    if (document.readyState === "complete") {
      schedule();
    } else {
      window.addEventListener("load", schedule, { once: true });
    }

    return () => {
      cancelled = true;
      window.removeEventListener("load", schedule);
      cancelIdle?.();
    };
  }, []);

  const trimmedQuery = query.trim();
  const isSearchable = trimmedQuery.length >= 2 && query !== labelFor(value);

  // The ~9,000-airport dataset (src/data/airports.ts) is code-split out of
  // this page's initial bundle and only downloaded the first time a user
  // focuses an airport field — see the comment in that file. That first
  // search has a real (if small) async gap while the chunk loads and
  // parses; every search after that resolves against the same in-memory
  // index almost instantly. A short debounce avoids kicking off that work
  // on every keystroke while still typing, and the requestId guard below
  // discards a response that resolves out of order (a slower, older
  // request completing after a newer one) rather than flashing stale
  // results.
  const requestIdRef = useRef(0);
  useEffect(() => {
    if (!isSearchable) return;
    const requestId = ++requestIdRef.current;
    const timeoutId = setTimeout(() => {
      setLoading(true);
      searchAirports(trimmedQuery)
        .then((found) => {
          if (requestIdRef.current !== requestId) return; // superseded by a newer keystroke
          setResults(found);
        })
        .catch(() => {
          if (requestIdRef.current !== requestId) return;
          setResults([]);
        })
        .finally(() => {
          if (requestIdRef.current === requestId) setLoading(false);
        });
    }, 150);
    return () => clearTimeout(timeoutId);
  }, [trimmedQuery, isSearchable]);

  // A new result set invalidates whatever index was highlighted for the
  // previous one — without this, e.g. index 2 could stay "highlighted" into
  // a shorter new list (or point at a completely different airport) as the
  // user keeps typing. Same "adjust state during render" idiom already used
  // above for prevValue/query, rather than a useEffect (which would add an
  // extra cascading render for what's really a synchronous derivation).
  const [prevResults, setPrevResults] = useState(results);
  if (results !== prevResults) {
    setPrevResults(results);
    setHighlightedIndex(-1);
  }

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
          onKeyDown={handleKeyDown}
          className="w-full bg-transparent text-sm text-[var(--color-navy-950)] outline-none placeholder:text-[var(--color-navy-950)]/40"
          autoComplete="off"
          role="combobox"
          aria-expanded={showResults}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={highlightedIndex >= 0 ? `${listboxId}-option-${highlightedIndex}` : undefined}
        />
        {loading && <Loader2 size={15} className="animate-spin text-[var(--color-navy-950)]/40" aria-hidden="true" />}
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
            // Opacity-only — no `y` — for the same reason as the mega menu's
            // panel (see DestinationsMegaMenu.tsx): a transform on this
            // wrapper shifts every option's real rendered/hit-tested
            // position for the whole transition, so a click landing early
            // in that window can miss its target.
            animate={showResults ? { opacity: 1 } : { opacity: 0 }}
            initial={false}
            transition={{ duration: 0.14 }}
            inert={!showResults}
            className="absolute z-30 mt-2 max-h-72 w-full max-w-[calc(100vw-2.5rem)] overflow-auto rounded-xl border border-[var(--color-navy-950)]/10 bg-white py-1.5 shadow-xl"
            role="listbox"
          >
            {results.map((r, i) => (
              <li key={r.iata}>
                <button
                  id={`${listboxId}-option-${i}`}
                  type="button"
                  role="option"
                  aria-selected={value?.iata === r.iata}
                  onClick={() => selectOption(r)}
                  onMouseEnter={() => setHighlightedIndex(i)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-[var(--color-cream-100)]",
                    highlightedIndex === i && "bg-[var(--color-cream-100)]",
                  )}
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
