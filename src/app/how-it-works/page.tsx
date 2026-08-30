import type { Metadata } from "next";
import { Reveal } from "@/components/Reveal";
import { HowItWorksSteps } from "@/components/sections/HowItWorksSteps";
import { CTASection } from "@/components/sections/CTASection";

export const metadata: Metadata = {
  title: "How It Works",
  description: "How a Business Flights Travel flight request becomes a booked business-class itinerary, from submission to booking assistance.",
  alternates: { canonical: "/how-it-works" },
};

export default function HowItWorksPage() {
  return (
    <>
      <section className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6 lg:px-8 lg:py-24">
        <Reveal>
          <p className="text-xs font-semibold tracking-[0.25em] text-[var(--color-gold-600)]">HOW IT WORKS</p>
          <h1 className="mx-auto mt-3 max-w-2xl text-[clamp(2rem,4.5vw,3rem)] font-display font-semibold leading-tight text-[var(--color-navy-950)]">
            From Request to Booking, Step by Step
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-[var(--color-navy-950)]/70">
            Every request is handled by a real travel specialist, not an automated system alone. Here&apos;s exactly what happens after you
            submit a flight request.
          </p>
        </Reveal>
      </section>
      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
        <HowItWorksSteps />
      </section>
      <CTASection />
    </>
  );
}
