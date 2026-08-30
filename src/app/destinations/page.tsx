import type { Metadata } from "next";
import Link from "next/link";
import { Reveal } from "@/components/Reveal";
import { DestinationCard } from "@/components/destinations/DestinationCard";
import { PopularAirlines } from "@/components/sections/PopularAirlines";
import { REGIONS, getFeaturedDestinations, getDestinationsByRegion } from "@/data/destinations";
import { FARE_DISCLAIMER } from "@/lib/fares";

export const metadata: Metadata = {
  title: "Business-Class Flight Destinations",
  description:
    "Explore business-class flight destinations from the United States, organized by region — Europe, the Middle East, Asia, Africa, Oceania, North America, and South America.",
  alternates: { canonical: "/destinations" },
};

const featured = getFeaturedDestinations(8);

export default function DestinationsPage() {
  return (
    <>
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <Reveal>
          <p className="text-xs font-semibold tracking-[0.25em] text-[var(--color-gold-600)]">DESTINATIONS</p>
          <h1 className="mt-3 max-w-2xl text-[clamp(2rem,4.5vw,3rem)] font-display font-semibold leading-tight text-[var(--color-navy-950)]">
            Where We Fly, Business Class
          </h1>
          <p className="mt-4 max-w-2xl text-[var(--color-navy-950)]/70">
            International business-class destinations, organized by region. Don&apos;t see your destination? Submit a flight
            request and we&apos;ll search it for you.
          </p>
          <p className="mt-3 max-w-2xl text-xs leading-relaxed text-[var(--color-navy-950)]/65">*{FARE_DISCLAIMER}</p>
          <nav aria-label="Jump to region" className="mt-6 flex flex-wrap gap-2">
            {REGIONS.map((r) => (
              <a
                key={r.slug}
                href={`#${r.slug}`}
                className="rounded-full border border-[var(--color-navy-950)]/12 px-4 py-2 text-xs font-semibold text-[var(--color-navy-800)] hover:border-[var(--color-gold-500)] hover:text-[var(--color-gold-600)]"
              >
                {r.label}
              </a>
            ))}
          </nav>
        </Reveal>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <Reveal>
          <p className="text-xs font-semibold tracking-[0.25em] text-[var(--color-gold-600)]">FEATURED</p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-[var(--color-navy-950)] sm:text-3xl">
            This Season&apos;s Highlights
          </h2>
        </Reveal>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {featured.map((d, i) => (
            <Reveal key={d.citySlug} delay={(i % 4) * 0.05}>
              <DestinationCard destination={d} priority={i < 4} />
            </Reveal>
          ))}
        </div>
      </section>

      {/* Continent → destination-card grid. Cards are sorted by country
          within each region (see the .sort() below) so same-country cities
          land next to each other without needing a separate visible
          country heading/section — keeps the page a scannable grid rather
          than dozens of small country blocks. */}
      {REGIONS.map((region, ri) => {
        const cities = [...getDestinationsByRegion(region.slug)].sort(
          (a, b) => a.country.localeCompare(b.country) || a.city.localeCompare(b.city),
        );
        if (cities.length === 0) return null;
        return (
          <section
            key={region.slug}
            id={region.slug}
            className={`scroll-mt-24 px-4 py-14 sm:px-6 sm:py-16 lg:px-8 ${ri % 2 === 1 ? "bg-[var(--color-cream-100)]" : ""}`}
          >
            <div className="mx-auto max-w-7xl">
              <Reveal>
                <h2 className="font-display text-2xl font-semibold text-[var(--color-navy-950)] sm:text-3xl">
                  {region.label.toUpperCase()}
                </h2>
                <p className="mt-1.5 max-w-xl text-sm text-[var(--color-navy-950)]/65">{region.blurb}</p>
              </Reveal>
              <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {cities.map((d, i) => (
                  <Reveal key={d.citySlug} delay={(i % 4) * 0.04}>
                    <DestinationCard destination={d} />
                  </Reveal>
                ))}
              </div>
            </div>
          </section>
        );
      })}

      <div>
        <PopularAirlines />
      </div>

      <section className="mx-auto max-w-7xl px-4 pb-16 pt-14 sm:px-6 lg:px-8">
        <Reveal>
          <div className="rounded-2xl border border-dashed border-[var(--color-navy-950)]/15 bg-[var(--color-cream-100)] p-6 text-center sm:p-8">
            <p className="text-sm text-[var(--color-navy-950)]/70">
              Not seeing your destination? We arrange business-class travel to international cities beyond this list.{" "}
              <Link href="/flights" className="font-semibold text-[var(--color-navy-900)] underline decoration-dotted underline-offset-2 hover:text-[var(--color-gold-600)]">
                Submit a flight request
              </Link>{" "}
              and tell us where you&apos;re headed.
            </p>
          </div>
        </Reveal>
      </section>
    </>
  );
}
