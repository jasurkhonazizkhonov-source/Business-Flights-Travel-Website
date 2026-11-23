import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { REGIONS, destinationPath, getDestinationsByRegion, regionHasHub, regionHubRegions, regionLabel, type Region } from "@/data/destinations";
import { blogPosts } from "@/data/blog-posts";
import { GENERAL_REGION_GUIDE_SLUGS, REGION_GUIDES } from "@/data/region-guides";
import { jsonLd } from "@/lib/json-ld";
import { SITE_NAME, SITE_URL } from "@/lib/constants";

// A hub for a region with enough destinations to be worth reading: the region's countries, each with its cities, plus the planning guides that
// genuinely cover it. It replaces the "#europe" fragment the destination pages used as their region breadcrumb (a fragment is not a page, so it
// was no use as a BreadcrumbList item or as a crawlable link target) and gives every destination one more crawlable link from a topical parent.
// Regions with only a handful of destinations (North and South America) have no hub: they stay a section of /destinations.

// Only the regions that have a hub are pre-rendered; any other value is a real 404, never a streamed 200 not-found page (see the destination page).
export const dynamicParams = false;

export function generateStaticParams() {
  return regionHubRegions().map((region) => ({ region }));
}

function regionFrom(slug: string): Region | undefined {
  const region = REGIONS.find((r) => r.slug === slug)?.slug;
  return region && regionHasHub(region) ? region : undefined;
}

function countriesOf(region: Region) {
  const byCountry = new Map<string, { country: string; countrySlug: string; cities: ReturnType<typeof getDestinationsByRegion> }>();
  for (const d of getDestinationsByRegion(region)) {
    const entry = byCountry.get(d.countrySlug) ?? { country: d.country, countrySlug: d.countrySlug, cities: [] };
    entry.cities.push(d);
    byCountry.set(d.countrySlug, entry);
  }
  return [...byCountry.values()]
    .sort((a, b) => a.country.localeCompare(b.country))
    .map((c) => ({ ...c, cities: [...c.cities].sort((a, b) => a.city.localeCompare(b.city)) }));
}

export async function generateMetadata({ params }: PageProps<"/destinations/[region]">): Promise<Metadata> {
  const { region: slug } = await params;
  const region = regionFrom(slug);
  if (!region) return {};
  const label = regionLabel(region);
  const countries = countriesOf(region);
  const total = countries.reduce((n, c) => n + c.cities.length, 0);
  // Not "Business Class Flights to X": for some regions an article already has that title (Africa), and the hub is a different page with a different job (browse by country).
  const title = `Business-Class Destinations in ${label}`;
  const description = `Business-class flights from the United States to ${total} destinations in ${countries.length} countries across ${label}: browse by country, see each airport and best time to travel, then request a quote.`;
  const fullTitle = `${title} | ${SITE_NAME}`;
  const path = `/destinations/${region}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", title: fullTitle, description, url: path, siteName: SITE_NAME, images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: `${SITE_NAME} — Business-class and international flights, arranged personally` }] },
    twitter: { card: "summary_large_image", title: fullTitle, description, images: [{ url: "/twitter-image", width: 1200, height: 630, alt: `${SITE_NAME} — Business-class and international flights, arranged personally` }] },
  };
}

export default async function RegionHubPage({ params }: PageProps<"/destinations/[region]">) {
  const { region: slug } = await params;
  const region = regionFrom(slug);
  if (!region) notFound();

  const label = regionLabel(region);
  const countries = countriesOf(region);
  const total = countries.reduce((n, c) => n + c.cities.length, 0);
  const guide = REGION_GUIDES[region];
  const guideSlugs = [...new Set([...(guide?.guideSlugs ?? []), ...GENERAL_REGION_GUIDE_SLUGS])];
  const guides = guideSlugs.map((s) => blogPosts.find((p) => p.slug === s)).filter((p): p is (typeof blogPosts)[number] => Boolean(p));

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Destinations", item: `${SITE_URL}/destinations` },
      { "@type": "ListItem", position: 3, name: label, item: `${SITE_URL}/destinations/${region}` },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbJsonLd) }} />

      <section className="bg-[var(--color-navy-950)]">
        <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <Reveal>
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs text-white/70">
              <Link href="/destinations" className="-my-1.5 inline-block py-1.5 hover:text-white">Destinations</Link>
              <span aria-hidden="true">/</span>
              <span className="text-white/90">{label}</span>
            </nav>
            <p className="mt-4 text-xs font-semibold tracking-[0.25em] text-[var(--color-gold-400)]">
              {total} DESTINATIONS · {countries.length} COUNTRIES
            </p>
            <h1 className="mt-3 text-[clamp(1.9rem,5vw,3rem)] font-display font-semibold leading-tight text-white">Business-Class Destinations in {label}</h1>
            {guide?.intro.map((paragraph) => (
              <p key={paragraph.slice(0, 24)} className="mt-4 max-w-3xl leading-relaxed text-white/75">
                {paragraph}
              </p>
            ))}
            <Link
              href="/flights"
              className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-full bg-[var(--color-gold-500)] px-7 py-3.5 text-sm font-semibold text-[var(--color-navy-950)] hover:bg-[var(--color-gold-400)]"
            >
              Get a Free Flight Quote <ArrowRight size={16} />
            </Link>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-14 sm:px-6 lg:px-8">
        <h2 className="font-display text-2xl font-semibold text-[var(--color-navy-950)]">Browse {label} by Country</h2>
        <p className="mt-2 max-w-3xl text-sm text-[var(--color-navy-950)]/65">
          {countries.length} countries, {total} destinations. Each page shows the airport, the best time to travel and the airlines commonly flying there.
        </p>
        <div className="mt-8 grid grid-cols-1 gap-x-10 gap-y-8 md:grid-cols-2">
          {countries.map((c) => (
            <div key={c.countrySlug}>
              <h3 className="font-display text-lg font-semibold text-[var(--color-navy-950)]">
                {c.country} <span className="text-sm font-normal text-[var(--color-navy-950)]/60">({c.cities.length})</span>
              </h3>
              <ul className="mt-2 space-y-2">
                {c.cities.map((d) => (
                  <li key={d.citySlug}>
                    <Link href={destinationPath(d)} className="font-medium text-[var(--color-navy-800)] underline decoration-[var(--color-navy-950)]/25 underline-offset-2 hover:text-[var(--color-gold-600)]">
                      {d.city}
                    </Link>{" "}
                    <span className="text-xs text-[var(--color-navy-950)]/60">{d.iata}</span>
                    <span className="block text-sm text-[var(--color-navy-950)]/65">{d.tagline}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {guides.length > 0 && (
        <section className="bg-[var(--color-cream-100)] px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <h2 className="font-display text-xl font-semibold text-[var(--color-navy-950)]">Planning guides</h2>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {guides.map((p) => (
                <li key={p.slug}>
                  <Link href={`/blog/${p.slug}`} className="font-medium text-[var(--color-navy-800)] underline decoration-[var(--color-navy-950)]/25 underline-offset-2 hover:text-[var(--color-gold-600)]">
                    {p.title}
                  </Link>
                  <span className="block text-sm text-[var(--color-navy-950)]/65">{p.excerpt}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="mx-auto max-w-5xl px-4 pb-16 pt-12 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-dashed border-[var(--color-navy-950)]/15 bg-[var(--color-cream-100)] p-6 text-center sm:p-8">
          <p className="text-sm text-[var(--color-navy-950)]/70">
            Not seeing the city you need in {label}? We arrange business-class travel beyond this list.{" "}
            <Link href="/flights" className="font-semibold text-[var(--color-navy-900)] underline decoration-dotted underline-offset-2 hover:text-[var(--color-gold-600)]">
              Submit a flight request
            </Link>{" "}
            and tell us where you&apos;re headed, or browse{" "}
            <Link href="/destinations" className="font-semibold text-[var(--color-navy-900)] underline decoration-dotted underline-offset-2 hover:text-[var(--color-gold-600)]">
              all destinations
            </Link>
            .
          </p>
        </div>
      </section>
    </>
  );
}
