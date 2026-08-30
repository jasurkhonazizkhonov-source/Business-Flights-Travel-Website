import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Armchair, Utensils, Luggage, Wifi } from "lucide-react";
import { Reveal } from "@/components/Reveal";

const highlights = [
  { icon: Armchair, title: "Lie-flat comfort", description: "Full lie-flat seating on qualifying long-haul aircraft for genuine rest in the air." },
  { icon: Utensils, title: "Elevated dining", description: "Curated in-flight dining service, on airlines and routes where it's offered." },
  { icon: Luggage, title: "Generous baggage", description: "Higher baggage allowances than economy fares on nearly every business-class ticket." },
  { icon: Wifi, title: "Priority everything", description: "Priority check-in, boarding, and lounge access on most business-class itineraries." },
];

export function BusinessClassHighlights() {
  return (
    <section className="bg-[var(--color-cream-100)] py-14 sm:py-20">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
        <Reveal>
          <div className="relative aspect-[4/3] overflow-hidden rounded-3xl">
            <Image
              src="https://images.unsplash.com/photo-1700811476524-ebfc7ddff253?q=80&w=1400&auto=format&fit=crop"
              alt="A lie-flat business-class bed and seat on a long-haul international flight"
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover"
            />
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="text-xs font-semibold tracking-[0.25em] text-[var(--color-gold-600)]">BUSINESS CLASS</p>
          <h2 className="mt-3 font-display text-3xl font-semibold text-[var(--color-navy-950)] sm:text-4xl">
            Purpose-built for business and premium travel
          </h2>
          <p className="mt-4 text-[var(--color-navy-950)]/70">
            We specialize in business, first-class, and premium economy itineraries — not economy fares as an afterthought. That focus
            shapes how we search, compare, and present every option.
          </p>
          <dl className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
            {highlights.map((h) => (
              <div key={h.title}>
                <h.icon className="h-6 w-6 text-[var(--color-navy-800)]" aria-hidden="true" />
                <dt className="mt-2.5 font-display text-base font-semibold text-[var(--color-navy-950)]">{h.title}</dt>
                <dd className="mt-1 text-sm text-[var(--color-navy-950)]/65">{h.description}</dd>
              </div>
            ))}
          </dl>
          <Link
            href="/business-class"
            className="mt-8 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--color-navy-900)] hover:text-[var(--color-gold-600)]"
          >
            Learn more about our business-class service <ArrowRight size={16} />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
