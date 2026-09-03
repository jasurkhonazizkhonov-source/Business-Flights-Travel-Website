"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronDown, ArrowRight } from "lucide-react";
import type { NavMenuRegion } from "@/data/destinations";
import { useClickOutside } from "@/hooks/useClickOutside";
import { cn } from "@/lib/cn";

export function DestinationsMegaMenu({ active, regions }: { active: boolean; regions: NavMenuRegion[] }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useClickOutside(containerRef, () => setOpen(false), open);

  function openNow() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  }
  function closeSoon() {
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  }

  return (
    <div ref={containerRef} className="relative" onMouseEnter={openNow} onMouseLeave={closeSoon}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        className={cn(
          "flex items-center gap-1 whitespace-nowrap text-[0.8rem] font-medium tracking-wide text-[var(--color-navy-800)] transition-colors hover:text-[var(--color-gold-600)] xl:text-[0.85rem]",
          active && "text-[var(--color-gold-600)]",
        )}
      >
        Destinations
        <ChevronDown size={14} className={cn("transition-transform", open && "rotate-180")} />
      </button>

      {/* Always mounted; visibility/interactivity driven by `animate`/`inert`
          rather than mount-unmount — see the note in DateField.tsx for why a
          conditionally-mounted popover makes `inert={!open}` a tautology
          once framer-motion's exit-clone freezes it.

          Opacity-only entrance, deliberately not also `y`/`scale`: a
          transform on this wrapper shifts the actual rendered (and
          hit-tested) position of every link inside it for the whole
          transition — a real click landing early in that ~160ms window,
          mouse or touch, can miss its target as the link's true pixel
          position keeps moving out from under it. Root-caused via a
          reproducible ~10% Playwright flake (clicking "London" a moment
          after the menu opened intermittently hit nothing and never
          navigated) that traced to exactly this: the link's bounding box
          moving between the actionability check and the actual click.
          Opacity alone changes no layout or hit-testing geometry, so a
          click is always exactly where it visually appears from the first
          frame — fixing the flake and the same latent risk for a real fast
          click, not just papering over the test. */}
      <motion.div
        role="menu"
        aria-label="Popular destinations"
        animate={open ? { opacity: 1 } : { opacity: 0 }}
        initial={false}
        transition={{ duration: 0.16, ease: "easeOut" }}
        inert={!open}
        className="absolute left-1/2 top-full z-40 mt-3 w-[min(56rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-[var(--color-navy-950)]/8 bg-white p-6 shadow-2xl"
      >
        <div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3 lg:grid-cols-7">
          {regions.map((region) => (
            <div key={region.slug}>
              <Link
                href={`/destinations#${region.slug}`}
                className="text-xs font-semibold tracking-[0.15em] text-[var(--color-gold-600)] hover:text-[var(--color-gold-700)]"
              >
                {region.label.toUpperCase()}
              </Link>
              <ul className="mt-3 space-y-2">
                {region.cities.map((d) => (
                  <li key={d.citySlug}>
                    <Link href={d.path} className="text-sm text-[var(--color-navy-800)] hover:text-[var(--color-gold-600)]">
                      {d.city}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-6 flex items-center justify-between border-t border-[var(--color-navy-950)]/8 pt-4">
          <p className="text-xs text-[var(--color-navy-950)]/65">Don&apos;t see your destination? We can search it for you.</p>
          <Link
            href="/destinations"
            className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-[var(--color-navy-900)] hover:text-[var(--color-gold-600)]"
          >
            View all destinations <ArrowRight size={15} />
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
