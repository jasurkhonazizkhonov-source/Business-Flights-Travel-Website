import type { Metadata } from "next";
import { Reveal } from "@/components/Reveal";
import { CTASection } from "@/components/sections/CTASection";

const values = [
  {
    title: "We work requests, not just fares",
    body: "A search engine returns whatever fare classes happen to be open. A specialist can call an airline, check an alternate routing, or wait for a fare to reopen — we do the parts of the job a filter can't.",
  },
  {
    title: "We tell you what a fare actually includes",
    body: "Seat type, baggage allowance, change and cancellation rules, and lounge access all vary by airline and fare class. We explain the specific terms of an option before you decide, not after.",
  },
  {
    title: "We stay the point of contact after booking",
    body: "Flight changes, schedule irregularities, and follow-up questions go to the same specialist who handled your original request — not a general support queue.",
  },
];

export const metadata: Metadata = {
  title: "About Us",
  description: "Business Flights Travel is a premium travel agency focused specifically on business-class, first-class, and international flight requests.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <>
      <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <Reveal>
          <p className="text-xs font-semibold tracking-[0.25em] text-[var(--color-gold-600)]">ABOUT US</p>
          <h1 className="mt-3 text-[clamp(2rem,4.5vw,3rem)] font-display font-semibold leading-tight text-[var(--color-navy-950)]">
            A Travel Agency Built Around Business-Class Flying
          </h1>
        </Reveal>

        <Reveal delay={0.08}>
          <div className="mt-8 space-y-5 leading-relaxed text-[var(--color-navy-950)]/75">
            <p>
              Business Flights Travel exists for a specific reason: general-purpose flight search tools are built for economy travel
              first, and treat business and first class as an afterthought. We built this agency to do the opposite — to focus
              specifically on premium and international cabins, and the routing, fare, and comfort decisions that come with them.
            </p>
            <p>
              Every flight request that comes through our site is reviewed by a travel specialist, not resolved entirely by an
              algorithm. We think that matters for business-class travel in particular, where the right answer often depends on details
              a search filter can&apos;t capture — a specific seat configuration, a preferred alliance, a tight connection that needs a
              second look.
            </p>
            <p>
              Our focus areas are business-class and first-class flights, international routing, and corporate travel — for individual
              travelers booking an important trip and for organizations that travel internationally on a recurring basis.
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.14}>
          <div className="mt-10 border-l-2 border-[var(--color-gold-500)] pl-6">
            <p className="text-sm leading-relaxed text-[var(--color-navy-950)]/70">
              Every request that reaches us is read by a person before it becomes a search. If there&apos;s something specific about
              how your trip is booked or handled, ask us directly through the{" "}
              <a href="/contact" className="underline decoration-dotted underline-offset-2 hover:text-[var(--color-gold-600)]">
                contact page
              </a>{" "}
              — a specialist, not a script, will answer.
            </p>
          </div>
        </Reveal>
      </section>

      <section className="bg-[var(--color-cream-100)] py-14 sm:py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <p className="text-xs font-semibold tracking-[0.25em] text-[var(--color-gold-600)]">HOW WE WORK</p>
            <h2 className="mt-3 font-display text-2xl font-semibold text-[var(--color-navy-950)] sm:text-3xl">What we actually do differently</h2>
          </Reveal>
          <div className="mt-8 grid grid-cols-1 gap-x-8 gap-y-8 sm:grid-cols-3">
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

      <CTASection />
    </>
  );
}
