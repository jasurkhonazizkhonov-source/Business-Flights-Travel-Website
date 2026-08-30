import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, MapPin, Clock, PlaneTakeoff, Info, Route as RouteIcon } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { DestinationCard } from "@/components/destinations/DestinationCard";
import { destinations, destinationPath, getDestination, regionLabel } from "@/data/destinations";
import { SITE_URL } from "@/lib/constants";
import { FARE_DISCLAIMER, formatFareUSD } from "@/lib/fares";

export function generateStaticParams() {
  return destinations.map((d) => ({ region: d.region, country: d.countrySlug, city: d.citySlug }));
}

export async function generateMetadata({ params }: PageProps<"/destinations/[region]/[country]/[city]">): Promise<Metadata> {
  const { region, country, city } = await params;
  const destination = getDestination(region, country, city);
  if (!destination) return {};
  const title = `Business Class Flights to ${destination.city}`;
  const description = `Business-class flight guidance for ${destination.city}, ${destination.country} — starting fares, airport info, best times to travel, and how to request a quote.`;
  return {
    title,
    description,
    alternates: { canonical: destinationPath(destination) },
    openGraph: { title, description, images: [{ url: destination.heroImage }] },
    // Without an explicit twitter.images, Next falls back to the generic
    // branded twitter-image.tsx rather than reusing openGraph.images — set
    // it explicitly so sharing this page on X/Twitter also shows the real
    // destination photo, not the generic brand card.
    twitter: { title, description, images: [destination.heroImage] },
  };
}

export default async function DestinationPage({ params }: PageProps<"/destinations/[region]/[country]/[city]">) {
  const { region, country, city } = await params;
  const destination = getDestination(region, country, city);
  if (!destination) notFound();

  const related = destinations
    .filter((d) => d.citySlug !== destination.citySlug && (d.region === destination.region || d.country === destination.country))
    .slice(0, 4);
  const relatedFallback =
    related.length >= 4 ? related : [...related, ...destinations.filter((d) => d.citySlug !== destination.citySlug && !related.includes(d))].slice(0, 4);

  const quoteHref = `/flights?to=${destination.iata}`;

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Destinations", item: `${SITE_URL}/destinations` },
      { "@type": "ListItem", position: 3, name: regionLabel(destination.region), item: `${SITE_URL}/destinations#${destination.region}` },
      { "@type": "ListItem", position: 4, name: destination.city, item: `${SITE_URL}${destinationPath(destination)}` },
    ],
  };

  const faqJsonLd = destination.faqs.length
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: destination.faqs.map((f) => ({
          "@type": "Question",
          name: f.question,
          acceptedAnswer: { "@type": "Answer", text: f.answer },
        })),
      }
    : null;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      {faqJsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />}

      <section className="relative overflow-hidden bg-[var(--color-navy-950)]">
        <div className="absolute inset-0">
          <Image src={destination.heroImage} alt={`${destination.city}, ${destination.country}`} fill priority className="object-cover opacity-45" sizes="100vw" />
          <div className="absolute inset-0 bg-gradient-to-b from-[var(--color-navy-950)]/40 via-[var(--color-navy-950)]/80 to-[var(--color-navy-950)]" />
        </div>
        <div className="relative mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
          <Reveal>
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs text-white/60">
              <Link href="/destinations" className="hover:text-white">Destinations</Link>
              <span aria-hidden="true">/</span>
              <Link href={`/destinations#${destination.region}`} className="hover:text-white">{regionLabel(destination.region)}</Link>
              <span aria-hidden="true">/</span>
              <span>{destination.country}</span>
              <span aria-hidden="true">/</span>
              <span className="text-white/85">{destination.city}</span>
            </nav>
            <p className="mt-4 text-xs font-semibold tracking-[0.25em] text-[var(--color-gold-400)]">
              {destination.country.toUpperCase()} · {destination.iata}
            </p>
            <h1 className="mt-3 text-[clamp(1.9rem,5vw,3rem)] font-display font-semibold leading-tight text-white">
              Business Class Flights to {destination.city}
            </h1>
            <p className="mt-4 max-w-2xl text-white/75">{destination.tagline}</p>

            <div className="mt-7 border-t border-white/15 pt-6">
              <p className="text-xs font-medium uppercase tracking-wide text-white/50">Business class from the United States, round trip</p>
              <p className="mt-1 font-display text-3xl font-semibold text-white sm:text-4xl">
                Starting from {formatFareUSD(destination.startingFareUSD)}
                <span className="ml-1 align-top text-lg text-[var(--color-gold-400)]">*</span>
              </p>
            </div>

            <Link
              href={quoteHref}
              className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-full bg-[var(--color-gold-500)] px-7 py-3.5 text-sm font-semibold text-[var(--color-navy-950)] hover:bg-[var(--color-gold-400)]"
            >
              Get a Free Flight Quote <ArrowRight size={16} />
            </Link>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[2fr_1fr]">
          <div>
            <Reveal>
              <h2 className="font-display text-2xl font-semibold text-[var(--color-navy-950)]">Business Class Flights to {destination.city}</h2>
              <p className="mt-3 leading-relaxed text-[var(--color-navy-950)]/75">{destination.overview}</p>
            </Reveal>

            <Reveal delay={0.05}>
              <h2 className="mt-10 font-display text-2xl font-semibold text-[var(--color-navy-950)]">Why Travel to {destination.city}?</h2>
              <ul className="mt-3 space-y-2.5">
                {destination.whyVisit.map((w) => (
                  <li key={w} className="flex items-start gap-2.5 text-[var(--color-navy-950)]/75">
                    <PlaneTakeoff className="mt-1 h-4 w-4 shrink-0 text-[var(--color-gold-600)]" />
                    {w}
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal delay={0.08}>
              <h2 className="mt-10 font-display text-2xl font-semibold text-[var(--color-navy-950)]">Business Travel to {destination.city}</h2>
              <p className="mt-3 leading-relaxed text-[var(--color-navy-950)]/75">{destination.businessTravel}</p>
            </Reveal>

            <Reveal delay={0.1}>
              <h2 className="mt-10 font-display text-2xl font-semibold text-[var(--color-navy-950)]">Flying from the United States</h2>
              <p className="mt-3 leading-relaxed text-[var(--color-navy-950)]/75">{destination.flyingFromUS}</p>
            </Reveal>

            <Reveal delay={0.12}>
              <h2 className="mt-10 font-display text-2xl font-semibold text-[var(--color-navy-950)]">What to Expect</h2>
              <p className="mt-3 leading-relaxed text-[var(--color-navy-950)]/75">{destination.whatToExpect}</p>
            </Reveal>

            {destination.popularAirlines.length > 0 && (
              <Reveal delay={0.14}>
                <h2 className="mt-10 font-display text-2xl font-semibold text-[var(--color-navy-950)]">Airlines Serving This Route</h2>
                <p className="mt-3 leading-relaxed text-[var(--color-navy-950)]/75">
                  Carriers commonly operating business-class service on this route include {destination.popularAirlines.join(", ")}.
                  Exact schedules, aircraft, and cabin availability vary by date — your specialist will confirm current options when
                  preparing your quote.
                </p>
                <p className="mt-2 flex items-start gap-2 text-xs text-[var(--color-navy-950)]/65">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {SITE_NAME_NOTE}
                </p>
              </Reveal>
            )}

            {destination.popularRoutes && (
              <Reveal delay={0.16}>
                <h2 className="mt-10 flex items-center gap-2 font-display text-2xl font-semibold text-[var(--color-navy-950)]">
                  <RouteIcon className="h-5 w-5 text-[var(--color-gold-600)]" /> Popular Routes &amp; Connections
                </h2>
                <p className="mt-3 leading-relaxed text-[var(--color-navy-950)]/75">{destination.popularRoutes}</p>
              </Reveal>
            )}

            {destination.faqs.length > 0 && (
              <Reveal delay={0.18}>
                <h2 className="mt-10 font-display text-2xl font-semibold text-[var(--color-navy-950)]">Frequently Asked Questions</h2>
                <div className="mt-4 space-y-4">
                  {destination.faqs.map((f) => (
                    <div key={f.question} className="rounded-xl bg-[var(--color-cream-100)] p-5">
                      <h3 className="font-display text-base font-semibold text-[var(--color-navy-950)]">{f.question}</h3>
                      <p className="mt-1.5 text-sm text-[var(--color-navy-950)]/70">{f.answer}</p>
                    </div>
                  ))}
                </div>
              </Reveal>
            )}

            <Reveal delay={0.2}>
              <div className="mt-12 rounded-2xl bg-[var(--color-navy-950)] p-7 text-center sm:p-9">
                <h2 className="font-display text-xl font-semibold text-white sm:text-2xl">Request a Flight Quote to {destination.city}</h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-white/70">
                  Tell us your dates and cabin preference — a travel specialist will follow up with suitable options.
                </p>
                <Link
                  href={quoteHref}
                  className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-full bg-[var(--color-gold-500)] px-7 py-3.5 text-sm font-semibold text-[var(--color-navy-950)] hover:bg-[var(--color-gold-400)]"
                >
                  Get a Free Flight Quote <ArrowRight size={16} />
                </Link>
              </div>
            </Reveal>
          </div>

          <Reveal delay={0.08}>
            <aside className="space-y-6 rounded-2xl border border-[var(--color-navy-950)]/8 bg-[var(--color-cream-100)] p-6 lg:sticky lg:top-24">
              <div>
                <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-[var(--color-navy-700)]">STARTING FARE</h3>
                <p className="mt-1.5 font-display text-2xl font-semibold text-[var(--color-navy-950)]">
                  {formatFareUSD(destination.startingFareUSD)}
                  <span className="ml-0.5 text-sm text-[var(--color-navy-950)]/65">*</span>
                </p>
                <p className="text-xs text-[var(--color-navy-950)]/65">Round trip, business class, from the U.S.</p>
              </div>
              <div>
                <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-[var(--color-navy-700)]">
                  <MapPin size={14} /> AIRPORT
                </h3>
                <p className="mt-1.5 text-sm text-[var(--color-navy-950)]">{destination.airportInfo}</p>
              </div>
              <div>
                <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-[var(--color-navy-700)]">
                  <Clock size={14} /> BEST TIME TO TRAVEL
                </h3>
                <p className="mt-1.5 text-sm text-[var(--color-navy-950)]">{destination.bestTimeToVisit}</p>
              </div>
              <Link
                href={quoteHref}
                className="block min-h-12 w-full rounded-full bg-[var(--color-navy-950)] px-5 py-3 text-center text-sm font-semibold text-white hover:bg-[var(--color-gold-600)]"
              >
                Request a Fare to {destination.city}
              </Link>
              <p className="text-[11px] leading-relaxed text-[var(--color-navy-950)]/65">*{FARE_DISCLAIMER}</p>
            </aside>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
        <Reveal>
          <h2 className="font-display text-2xl font-semibold text-[var(--color-navy-950)]">Related Destinations</h2>
        </Reveal>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {relatedFallback.map((d) => (
            <DestinationCard key={`${d.region}-${d.citySlug}`} destination={d} />
          ))}
        </div>
      </section>
    </>
  );
}

const SITE_NAME_NOTE =
  "Mentioned for general information only — Business Flights Travel is not affiliated with, endorsed by, or an authorized representative of these airlines.";
