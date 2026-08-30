import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { REGIONS, getDestinationsByRegion } from "@/data/destinations";

export function PopularRegions() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <Reveal>
        <p className="text-xs font-semibold tracking-[0.25em] text-[var(--color-gold-600)]">EXPLORE BY REGION</p>
        <h2 className="mt-3 max-w-xl text-[clamp(1.5rem,3.4vw,2.25rem)] font-display font-semibold leading-tight text-[var(--color-navy-950)]">
          Six regions, one dedicated specialist
        </h2>
      </Reveal>
      <div className="mt-8 grid grid-cols-2 gap-3 sm:mt-10 sm:gap-4 lg:grid-cols-3">
        {REGIONS.map((region, i) => {
          const cities = getDestinationsByRegion(region.slug);
          if (cities.length === 0) return null;
          const cityNames = cities.slice(0, 4).map((c) => c.city);
          return (
            <Reveal key={region.slug} delay={i * 0.05}>
              <Link
                href={`/destinations#${region.slug}`}
                className="group block h-full rounded-2xl border border-[var(--color-navy-950)]/8 bg-white p-5 transition-colors hover:border-[var(--color-gold-500)]/50"
              >
                <h3 className="flex items-center justify-between font-display text-lg font-semibold text-[var(--color-navy-950)]">
                  {region.label}
                  <ArrowRight size={16} className="text-[var(--color-navy-950)]/30 transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--color-gold-600)]" />
                </h3>
                <p className="mt-1.5 text-sm text-[var(--color-navy-950)]/65">{cityNames.join(" · ")}</p>
              </Link>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
