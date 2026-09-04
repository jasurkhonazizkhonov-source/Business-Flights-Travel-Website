import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { MapPin, Search, MessagesSquare, PlaneTakeoff, Users2, Building2, Briefcase, Globe2 } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { CTASection } from "@/components/sections/CTASection";
import { COMPANY_ADDRESS, CONTACT_PHONE_DISPLAY, CONTACT_PHONE_E164, SITE_NAME, SITE_URL } from "@/lib/constants";

export const metadata: Metadata = {
  title: "About Us",
  description:
    "Business Flights Travel is a San Francisco-based agency focused specifically on business-class, first-class, and international flight requests, handled personally by a travel specialist.",
  alternates: { canonical: "/about" },
};

const howWeHelp = [
  {
    title: "Itinerary and routing research",
    body: "We look beyond the first nonstop option — comparing routings, connection airports, and alliance networks to find business-class availability that a single search engine might not surface.",
  },
  {
    title: "Cabin and seat comparison",
    body: "Business-class seat products vary widely between airlines and even between aircraft on the same airline. We explain the actual seat configuration, privacy, and lie-flat availability for the specific option we're proposing.",
  },
  {
    title: "Schedule and connection planning",
    body: "For multi-city and connecting itineraries, we look at layover length, terminal changes, and realistic transfer times — not just whether a connection is technically legal.",
  },
  {
    title: "Fare comparison and terms",
    body: "We compare fare classes across airlines, not just headline prices, and explain what each option actually includes: baggage allowance, change and cancellation rules, and lounge access.",
  },
  {
    title: "Preference matching",
    body: "Preferred airline, alliance, seat type, or budget range — tell us what matters for your trip, and we search with that in mind rather than defaulting to whatever a generic engine ranks first.",
  },
  {
    title: "Support through the booking process",
    body: "Once you choose an option, your specialist stays involved through booking and remains your point of contact afterward for questions, changes, or schedule irregularities.",
  },
];

const whyTravelers = [
  {
    icon: Search,
    title: "Human research, not just a filter",
    body: "A booking engine returns whatever fare classes happen to be open at that moment. A specialist can check alternate routings, call an airline directly, or watch for a fare to reopen — work an automated filter doesn't do.",
  },
  {
    icon: MessagesSquare,
    title: "Clear answers before you decide",
    body: "Seat type, baggage allowance, and change rules differ by airline and fare class. We explain the specific terms of an option before you book, not after — so there are no surprises at the airport.",
  },
  {
    icon: PlaneTakeoff,
    title: "Premium-cabin focus",
    body: "Business and first class are our entire focus, not an upsell tab on an economy-first search tool. That shapes how we search, compare, and present every option we send you.",
  },
  {
    icon: Users2,
    title: "One point of contact",
    body: "The specialist who handles your original request is the same person who handles follow-up questions, changes, and schedule irregularities — not a rotating general support queue.",
  },
];

const whoWeServe = [
  {
    icon: Briefcase,
    title: "Business travelers and executives",
    body: "Individual professionals booking an important international trip who want premium-cabin options compared properly before committing.",
  },
  {
    icon: Building2,
    title: "Corporate and organizational travel",
    body: "Companies that send people internationally on a recurring basis and want a consistent specialist who understands their routing and cabin preferences over time.",
  },
  {
    icon: Globe2,
    title: "International and long-haul travelers",
    body: "Travelers planning a long-haul or multi-city international itinerary where routing, connections, and cabin choice meaningfully affect the trip.",
  },
  {
    icon: Users2,
    title: "Travelers upgrading a long flight",
    body: "Leisure and family travelers who want a genuine business or first-class experience for a long-haul trip and would rather have a specialist compare options than search alone.",
  },
];

const values = [
  {
    title: "Clarity",
    body: "We explain what a fare actually includes — in plain terms — before you decide, not in fine print after.",
  },
  {
    title: "Accuracy",
    body: "We confirm real availability and current terms rather than quoting a fare we haven't verified is actually bookable.",
  },
  {
    title: "Personal attention",
    body: "Every request is reviewed by a person. Follow-up questions go to the same specialist who handled the original search.",
  },
  {
    title: "Efficient planning",
    body: "We aim to turn a request into a genuinely useful set of options quickly, without back-and-forth that wastes your time.",
  },
];

const approachSteps = [
  {
    step: "01",
    title: "You tell us your trip",
    body: "Route, travel dates, cabin class, and any preferences — preferred airline, budget range, or flexible dates — through the flight request form.",
  },
  {
    step: "02",
    title: "A specialist researches it personally",
    body: "Your request is reviewed by a person, who compares routing, airline, and fare options against what you've told us matters for the trip.",
  },
  {
    step: "03",
    title: "You receive real options to compare",
    body: "We follow up with the options we found — with the seat, fare, and routing details explained — rather than a single automated quote.",
  },
  {
    step: "04",
    title: "We stay involved through booking and after",
    body: "Once you choose an option, the same specialist supports the booking process and remains your point of contact for any changes afterward.",
  },
];

export default function AboutPage() {
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "About Us", item: `${SITE_URL}/about` },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      {/* Hero */}
      <section className="relative overflow-hidden bg-[var(--color-navy-950)] py-20 sm:py-28">
        <div className="absolute inset-0">
          <Image
            src="https://images.unsplash.com/photo-1501594907352-04cda38ebc29?q=80&w=2400&auto=format&fit=crop"
            alt=""
            fill
            priority
            className="object-cover opacity-30"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[var(--color-navy-950)]/55 via-[var(--color-navy-950)]/85 to-[var(--color-navy-950)]" />
        </div>
        <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <Reveal>
            <p className="text-xs font-semibold tracking-[0.3em] text-[var(--color-gold-400)]">ABOUT US</p>
            <h1 className="mt-4 text-[clamp(2rem,4.5vw,3rem)] font-display font-semibold leading-tight text-white">
              A San Francisco Agency Built Around Business-Class Flying
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-white/75">
              Business Flights Travel researches and arranges business-class, first-class, and international flights — personally,
              request by request, from our office at 580 California Street.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Who we are / our focus */}
      <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <Reveal>
          <p className="text-xs font-semibold tracking-[0.25em] text-[var(--color-gold-600)]">WHO WE ARE</p>
          <h2 className="mt-3 font-display text-2xl font-semibold text-[var(--color-navy-950)] sm:text-3xl">
            Premium travel needs a different kind of search
          </h2>
        </Reveal>
        <Reveal delay={0.08}>
          <div className="mt-6 space-y-5 leading-relaxed text-[var(--color-navy-950)]/75">
            <p>
              Business Flights Travel exists for a specific reason: general-purpose flight search tools are built for economy travel
              first, and treat business and first class as an afterthought — a filter you apply after the real search is already
              done. We built this agency to do the opposite. Premium and international cabins, and the routing, fare, and comfort
              decisions that come with them, are the entire focus, not a side feature.
            </p>
            <p>
              We&apos;re based in San Francisco, and every flight request that reaches us through the site is read and researched by
              a travel specialist — not resolved entirely by an algorithm. That distinction matters most for business-class travel,
              where the right answer often depends on details a search filter can&apos;t capture: a specific seat configuration on a
              particular aircraft variant, a preferred airline alliance, or a tight connection that genuinely needs a second look
              before it&apos;s booked.
            </p>
            <p>
              Our focus areas are business-class and first-class flights, international routing, and corporate travel — for
              individual travelers booking an important trip and for organizations that travel internationally on a recurring basis.
              You can see what that focus covers in more detail on our{" "}
              <Link href="/business-class" className="underline decoration-dotted underline-offset-2 hover:text-[var(--color-gold-600)]">
                Business Class page
              </Link>
              , or start a request directly on the{" "}
              <Link href="/flights" className="underline decoration-dotted underline-offset-2 hover:text-[var(--color-gold-600)]">
                flight request page
              </Link>
              .
            </p>
          </div>
        </Reveal>
      </section>

      {/* How we help */}
      <section className="bg-[var(--color-cream-100)] py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <Reveal>
              <p className="text-xs font-semibold tracking-[0.25em] text-[var(--color-gold-600)]">HOW WE HELP</p>
              <h2 className="mt-3 font-display text-2xl font-semibold text-[var(--color-navy-950)] sm:text-3xl">
                What a specialist actually does with your request
              </h2>
              <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-[var(--color-navy-950)]/70">
                None of this is guesswork after the fact — it&apos;s the concrete research and comparison work that happens between
                your flight request and the options we send back.
              </p>
            </Reveal>
            <Reveal delay={0.1}>
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl">
                <Image
                  src="https://images.unsplash.com/photo-1517048676732-d65bc937f952?q=80&w=1400&auto=format&fit=crop"
                  alt="Travel specialists reviewing an itinerary and comparing flight options"
                  fill
                  sizes="(min-width: 1024px) 40vw, 90vw"
                  className="object-cover"
                />
              </div>
            </Reveal>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-x-8 gap-y-8 sm:grid-cols-2">
            {howWeHelp.map((h, i) => (
              <Reveal key={h.title} delay={(i % 3) * 0.06}>
                <div className="border-t-2 border-[var(--color-gold-500)] pt-4">
                  <h3 className="font-display text-base font-semibold text-[var(--color-navy-950)]">{h.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-navy-950)]/65">{h.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Why travelers work with us */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <Reveal>
          <p className="text-xs font-semibold tracking-[0.25em] text-[var(--color-gold-600)]">WHY TRAVELERS WORK WITH US</p>
          <h2 className="mt-3 font-display text-2xl font-semibold text-[var(--color-navy-950)] sm:text-3xl">
            What we do differently
          </h2>
        </Reveal>
        <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2">
          {whyTravelers.map((w, i) => (
            <Reveal key={w.title} delay={i * 0.06}>
              <div className="flex gap-4">
                <w.icon className="h-6 w-6 shrink-0 text-[var(--color-navy-800)]" aria-hidden="true" strokeWidth={1.75} />
                <div>
                  <h3 className="font-display text-base font-semibold text-[var(--color-navy-950)]">{w.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-navy-950)]/65">{w.body}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Our approach */}
      <section className="bg-[var(--color-navy-950)] py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <p className="text-xs font-semibold tracking-[0.25em] text-[var(--color-gold-400)]">OUR APPROACH</p>
            <h2 className="mt-3 font-display text-2xl font-semibold text-white sm:text-3xl">From request to a real quote</h2>
          </Reveal>
          <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {approachSteps.map((s, i) => (
              <Reveal key={s.step} delay={i * 0.06}>
                <div className="border-t-2 border-[var(--color-gold-500)] pt-4">
                  <p className="font-display text-2xl font-semibold text-[var(--color-gold-400)]">{s.step}</p>
                  <h3 className="mt-2 font-display text-base font-semibold text-white">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-white/65">{s.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Who we serve */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <Reveal>
          <p className="text-xs font-semibold tracking-[0.25em] text-[var(--color-gold-600)]">WHO WE SERVE</p>
          <h2 className="mt-3 font-display text-2xl font-semibold text-[var(--color-navy-950)] sm:text-3xl">
            Travelers and organizations we work with
          </h2>
        </Reveal>
        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {whoWeServe.map((w, i) => (
            <Reveal key={w.title} delay={i * 0.06}>
              <div className="h-full rounded-2xl border border-[var(--color-navy-950)]/8 bg-white p-5 shadow-sm">
                <w.icon className="h-6 w-6 text-[var(--color-gold-600)]" aria-hidden="true" strokeWidth={1.75} />
                <h3 className="mt-3 font-display text-base font-semibold text-[var(--color-navy-950)]">{w.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-navy-950)]/65">{w.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* What matters to us */}
      <section className="bg-[var(--color-cream-100)] py-16 sm:py-24">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <p className="text-xs font-semibold tracking-[0.25em] text-[var(--color-gold-600)]">WHAT MATTERS TO US</p>
            <h2 className="mt-3 font-display text-2xl font-semibold text-[var(--color-navy-950)] sm:text-3xl">
              The standard we hold every request to
            </h2>
          </Reveal>
          <div className="mt-10 grid grid-cols-1 gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            {values.map((v, i) => (
              <Reveal key={v.title} delay={i * 0.06}>
                <div className="h-full border-t-2 border-[var(--color-gold-500)] pt-4">
                  <h3 className="font-display text-base font-semibold text-[var(--color-navy-950)]">{v.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--color-navy-950)]/65">{v.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Location */}
      <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <Reveal>
          <div className="flex flex-col items-start gap-6 rounded-2xl border border-[var(--color-navy-950)]/8 bg-white p-8 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <MapPin className="mt-1 h-6 w-6 shrink-0 text-[var(--color-gold-600)]" aria-hidden="true" />
              <div>
                <p className="text-xs font-semibold tracking-[0.2em] text-[var(--color-gold-600)]">OUR LOCATION</p>
                <h2 className="mt-1.5 font-display text-lg font-semibold text-[var(--color-navy-950)]">{SITE_NAME}</h2>
                <p className="mt-1 text-sm leading-relaxed text-[var(--color-navy-950)]/70">{COMPANY_ADDRESS}</p>
                <a
                  href={`tel:${CONTACT_PHONE_E164}`}
                  className="mt-1 inline-block text-sm text-[var(--color-navy-950)]/70 hover:text-[var(--color-gold-600)]"
                >
                  {CONTACT_PHONE_DISPLAY}
                </a>
              </div>
            </div>
            <Link
              href="/contact"
              className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-[var(--color-navy-950)] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-gold-600)]"
            >
              Get in Touch
            </Link>
          </div>
        </Reveal>
      </section>

      <CTASection
        title="Ready to have a specialist research your trip?"
        description="Tell us your route, dates, and cabin preference — we'll take it from there."
      />
    </>
  );
}
