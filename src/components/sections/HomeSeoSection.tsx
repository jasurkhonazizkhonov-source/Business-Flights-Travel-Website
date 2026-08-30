import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/Reveal";

// Homepage-only search-oriented content, written in our own voice — not a
// duplicate of the Flights or Business Class pages, which go into the
// mechanics of the request form and cabin features respectively. This
// section exists to plainly state what the site does, in the terms a
// searcher would actually use.
export function HomeSeoSection() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
        <Reveal>
          <p className="text-xs font-semibold tracking-[0.25em] text-[var(--color-gold-600)]">HOW WE HELP</p>
          <h2 className="mt-3 text-[clamp(1.6rem,3.4vw,2.25rem)] font-display font-semibold leading-tight text-[var(--color-navy-950)]">
            Business-class flight requests, handled by a specialist
          </h2>
          <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-[var(--color-navy-950)]/70">
            <p>
              Business Flights Travel helps travelers departing the United States request premium economy, business-class, and
              first-class fares for international travel — round-trip, one-way, or multi-city. Rather than searching a public fare
              engine yourself, you describe the trip once, and a specialist compares options across airlines on your behalf.
            </p>
            <p>
              This works well for a single international business trip, a recurring travel pattern for a company, or a
              once-a-year premium leisure trip where getting the routing and cabin right matters more than saving a few
              minutes on a search form.
            </p>
          </div>
          <Link
            href="/flights"
            className="mt-6 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-[var(--color-navy-950)] px-6 py-3 text-sm font-semibold text-white hover:bg-[var(--color-gold-600)]"
          >
            Get a Free Flight Quote <ArrowRight size={16} />
          </Link>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="relative aspect-[4/3] overflow-hidden rounded-3xl">
            <Image
              src="https://images.unsplash.com/photo-1769454625177-b031788425da?q=80&w=1400&auto=format&fit=crop"
              alt="A quiet international airport departure gate"
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover"
            />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
