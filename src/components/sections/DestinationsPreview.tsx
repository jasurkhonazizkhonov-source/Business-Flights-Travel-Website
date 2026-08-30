import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { DestinationCard } from "@/components/destinations/DestinationCard";
import { getFeaturedDestinations } from "@/data/destinations";
import { FARE_DISCLAIMER } from "@/lib/fares";

// Homepage-only curated set (the `featured` flag in the data), distinct
// from the full region-by-region hub at /destinations — this section is
// meant as a taste of the range, not a duplicate of that page.
export function DestinationsPreview() {
  const featured = getFeaturedDestinations(8);
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <Reveal>
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold tracking-[0.25em] text-[var(--color-gold-600)]">POPULAR DESTINATIONS</p>
            <h2 className="mt-3 max-w-xl text-[clamp(1.5rem,3.4vw,2.25rem)] font-display font-semibold leading-tight text-[var(--color-navy-950)]">
              A starting point, from Europe to the Gulf to the Pacific
            </h2>
          </div>
          <Link href="/destinations" className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-[var(--color-navy-800)] hover:text-[var(--color-gold-600)]">
            Browse all destinations <ArrowRight size={16} />
          </Link>
        </div>
      </Reveal>
      <div className="mt-8 grid grid-cols-2 gap-3 sm:mt-10 sm:grid-cols-4 sm:gap-4">
        {featured.map((d, i) => (
          <Reveal key={d.citySlug} delay={(i % 4) * 0.06}>
            <DestinationCard destination={d} priority={i < 4} />
          </Reveal>
        ))}
      </div>
      <p className="mt-6 max-w-2xl text-xs leading-relaxed text-[var(--color-navy-950)]/65">*{FARE_DISCLAIMER}</p>
    </section>
  );
}
