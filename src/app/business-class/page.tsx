import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CheckCircle2, Armchair, Utensils, Wifi, Clock } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { CTASection } from "@/components/sections/CTASection";
import { PRIMARY_CTA_LABEL } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Business Class Flights",
  description:
    "Business-class flight booking assistance for international and long-haul travel — cabin comparisons, fare search, and a dedicated specialist for every request.",
  alternates: { canonical: "/business-class" },
};

const capabilities = [
  "Business-class fare search across airlines and alliances, not a single engine",
  "Comparison of seat products and aircraft types, not just cabin names",
  "First-class options where the route and budget support it",
  "Multi-city and complex international itinerary support",
  "Corporate and recurring business travel handled by a consistent point of contact",
];

const experienceFeatures = [
  {
    icon: Armchair,
    title: "Lie-flat and near-flat seating",
    body: "Most long-haul business-class cabins now offer lie-flat or near-flat seats. Seat width, privacy, and direct aisle access still vary a lot by airline and aircraft — we'll tell you which layout you're getting, not just the cabin name.",
  },
  {
    icon: Clock,
    title: "Priority services on the ground",
    body: "Priority check-in, security, and boarding are standard on most business-class tickets. Lounge access is common but not universal — it depends on the airline, the airport, and sometimes the specific fare class purchased.",
  },
  {
    icon: Utensils,
    title: "An elevated dining service",
    body: "Multi-course meal service, wider beverage selection, and amenity kits are typical on long-haul business class. Service style differs meaningfully between airlines — this is one of the details worth comparing, not assuming.",
  },
  {
    icon: Wifi,
    title: "More room to actually work or rest",
    body: "Beyond the seat itself, business class usually means more personal space, dedicated storage, and better in-seat power and entertainment — the practical difference on a long flight.",
  },
];

const decisionPoints = [
  {
    title: "Nonstop vs. connecting",
    body: "A nonstop flight is usually more comfortable, but a one-stop routing sometimes has better business-class availability or a notably lower fare — worth comparing rather than defaulting to nonstop.",
  },
  {
    title: "Overnight vs. daytime departure",
    body: "An overnight departure timed to arrive in the morning suits a lie-flat seat well; a daytime long-haul flight is a different kind of trip, and your seat preference might change accordingly.",
  },
  {
    title: "Connection time",
    body: "A short connection saves time but adds risk on a multi-leg business itinerary — we'll flag connections that are tight relative to the airport involved.",
  },
  {
    title: "Fare flexibility",
    body: "Some business-class fares allow free changes and cancellation; others are heavily restricted for a lower price. We'll explain the tradeoff for the specific fare we find, before you commit.",
  },
];

export default function BusinessClassPage() {
  return (
    <>
      <section className="relative overflow-hidden bg-[var(--color-navy-950)] py-20 sm:py-28">
        <div className="absolute inset-0">
          <Image
            src="https://images.unsplash.com/photo-1517479149777-5f3b1511d5ad?q=80&w=2400&auto=format&fit=crop"
            alt=""
            fill
            priority
            className="object-cover opacity-35"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[var(--color-navy-950)]/50 via-[var(--color-navy-950)]/85 to-[var(--color-navy-950)]" />
        </div>
        <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <Reveal>
            <p className="text-xs font-semibold tracking-[0.3em] text-[var(--color-gold-400)]">BUSINESS CLASS</p>
            <h1 className="mt-4 text-[clamp(2rem,4.5vw,3rem)] font-display font-semibold leading-tight text-white">
              Business &amp; First-Class Flights, Handled Personally
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-white/75">
              We specialize in premium and international cabins — the routing, fare, and aircraft decisions that come with getting
              business travel right.
            </p>
            <Link
              href="/flights"
              className="mt-8 inline-flex min-h-12 items-center rounded-full bg-[var(--color-gold-500)] px-8 py-4 text-base font-semibold text-[var(--color-navy-950)] shadow-lg transition-transform hover:scale-[1.03]"
            >
              {PRIMARY_CTA_LABEL}
            </Link>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <Reveal>
          <p className="text-xs font-semibold tracking-[0.25em] text-[var(--color-gold-600)]">OUR SERVICE</p>
          <h2 className="mt-3 font-display text-2xl font-semibold text-[var(--color-navy-950)] sm:text-3xl">What our business-class service covers</h2>
        </Reveal>
        <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {capabilities.map((c, i) => (
            <Reveal key={c} delay={i * 0.05}>
              <li className="flex items-start gap-3 rounded-xl bg-[var(--color-cream-100)] p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-gold-600)]" />
                <span className="text-sm text-[var(--color-navy-900)]">{c}</span>
              </li>
            </Reveal>
          ))}
        </ul>
      </section>

      <section className="bg-[var(--color-cream-100)] py-14 sm:py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <p className="text-xs font-semibold tracking-[0.25em] text-[var(--color-gold-600)]">THE EXPERIENCE</p>
            <h2 className="mt-3 font-display text-2xl font-semibold text-[var(--color-navy-950)] sm:text-3xl">What business class typically includes</h2>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[var(--color-navy-950)]/70">
              These features are common on long-haul business class, but not universal — availability depends on the specific
              airline, aircraft, and fare class. We confirm the actual specifics for your route before you book.
            </p>
          </Reveal>
          <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2">
            {experienceFeatures.map((f, i) => (
              <Reveal key={f.title} delay={i * 0.06}>
                <div className="flex gap-4">
                  <f.icon className="h-6 w-6 shrink-0 text-[var(--color-navy-800)]" aria-hidden="true" strokeWidth={1.75} />
                  <div>
                    <h3 className="font-display text-base font-semibold text-[var(--color-navy-950)]">{f.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-navy-950)]/65">{f.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <Reveal>
          <p className="text-xs font-semibold tracking-[0.25em] text-[var(--color-gold-600)]">CHOOSING AN ITINERARY</p>
          <h2 className="mt-3 font-display text-2xl font-semibold text-[var(--color-navy-950)] sm:text-3xl">What we weigh when comparing options</h2>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[var(--color-navy-950)]/70">
            The lowest fare and the best itinerary aren&apos;t always the same option. Here&apos;s what your specialist actually
            considers when comparing business-class routings.
          </p>
        </Reveal>
        <div className="mt-10 grid grid-cols-1 gap-x-8 gap-y-8 sm:grid-cols-2">
          {decisionPoints.map((d, i) => (
            <Reveal key={d.title} delay={i * 0.05}>
              <div className="border-t-2 border-[var(--color-gold-500)] pt-4">
                <h3 className="font-display text-base font-semibold text-[var(--color-navy-950)]">{d.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-navy-950)]/65">{d.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <CTASection
        title="Tell us about your business-class trip"
        description="Share your route, dates, and cabin preference — we'll take it from there."
      />
    </>
  );
}
