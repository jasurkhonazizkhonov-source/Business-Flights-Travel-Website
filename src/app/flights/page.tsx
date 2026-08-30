import type { Metadata } from "next";
import { FlightRequestForm } from "@/components/flight-form/FlightRequestForm";
import { Reveal } from "@/components/Reveal";
import { SITE_NAME, CONTACT_PHONE_DISPLAY } from "@/lib/constants";
import { resolveAirportByIata } from "@/server/queries/airports";

export const metadata: Metadata = {
  title: "Request a Business-Class Flight Quote",
  description:
    "Request business-class, first-class, or international flights in minutes. Round-trip, one-way, or multi-city — a dedicated specialist follows up with tailored options.",
  alternates: { canonical: "/flights" },
};

const processSteps = [
  {
    title: "Tell us your route and dates",
    body: "Choose round-trip, one-way, or multi-city, then enter your origin, destination, dates, cabin class, and traveler count. Multi-city requests let you add or remove flight segments as your itinerary changes.",
  },
  {
    title: "Add your contact details",
    body: "First and last name, email, and a phone number with the correct country code — this is how your specialist reaches you, not for marketing.",
  },
  {
    title: "A specialist reviews your request",
    body: "Requests are reviewed personally, not routed through an automated quote engine alone. If anything in your request needs clarifying, your specialist will follow up directly.",
  },
  {
    title: "You receive fare options to compare",
    body: "Your specialist searches available business, first-class, or premium economy options across airlines and presents the ones that actually fit your route, dates, and budget.",
  },
];

const cabinNotes = [
  { name: "Premium Economy", body: "More legroom and recline than standard economy, at a lower fare than business class — a middle option on routes where it's offered." },
  { name: "Business Class", body: "Typically includes lie-flat or near-flat seating on long-haul aircraft, priority check-in and boarding, lounge access, and an elevated dining service." },
  { name: "First Class", body: "Offered by a smaller number of airlines on select long-haul routes — usually a private suite-style seat and the most personalized service on board." },
];

export default async function FlightsPage({ searchParams }: PageProps<"/flights">) {
  const params = await searchParams;
  const toParam = typeof params.to === "string" ? params.to : undefined;
  const initialDestination = resolveAirportByIata(toParam);

  return (
    <>
      <section className="bg-[var(--color-navy-950)] pb-14 pt-14 sm:pt-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <Reveal>
              <p className="text-xs font-semibold tracking-[0.3em] text-[var(--color-gold-400)]">FLIGHT REQUEST</p>
              <h1 className="mt-4 text-[clamp(2rem,4.5vw,3rem)] font-display font-semibold leading-tight text-white">
                {initialDestination ? `Business Class to ${initialDestination.city}` : "Find Your Flight"}
              </h1>
              <p className="mt-4 text-white/70">
                Business class, first class, and international flights — round-trip, one-way, or multi-city. Tell us your route and a
                specialist from {SITE_NAME} will follow up with options.
              </p>
            </Reveal>
          </div>
          <Reveal delay={0.1} className="mx-auto mt-10 max-w-4xl">
            <FlightRequestForm initialDestination={initialDestination} />
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <Reveal>
          <p className="text-xs font-semibold tracking-[0.25em] text-[var(--color-gold-600)]">HOW A REQUEST BECOMES A QUOTE</p>
          <h2 className="mt-3 text-[clamp(1.6rem,3.4vw,2.25rem)] font-display font-semibold leading-tight text-[var(--color-navy-950)]">
            What happens after you submit a request
          </h2>
        </Reveal>
        <ol className="mt-10 grid grid-cols-1 gap-x-8 gap-y-8 sm:grid-cols-2">
          {processSteps.map((step, i) => (
            // <li> must be ol's direct child — Reveal (a motion.div) goes
            // inside it, not around it, so the DOM stays valid (an <ol> with
            // a <div> wrapping each <li> fails browser/AT list semantics).
            <li key={step.title} className="border-t-2 border-[var(--color-gold-500)] pt-4">
              <Reveal delay={i * 0.06}>
                <span className="text-xs font-semibold text-[var(--color-navy-950)]/65">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="mt-1 font-display text-lg font-semibold text-[var(--color-navy-950)]">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-navy-950)]/70">{step.body}</p>
              </Reveal>
            </li>
          ))}
        </ol>
      </section>

      <section className="bg-[var(--color-cream-100)] py-16 sm:py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <p className="text-xs font-semibold tracking-[0.25em] text-[var(--color-gold-600)]">TRIP TYPES &amp; CABINS</p>
            <h2 className="mt-3 text-[clamp(1.6rem,3.4vw,2.25rem)] font-display font-semibold leading-tight text-[var(--color-navy-950)]">
              Round-trip, one-way, or multi-city — in any cabin
            </h2>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[var(--color-navy-950)]/70">
              The request form supports all three trip types. Multi-city itineraries — say, New York to London, then London to Dubai,
              returning from Dubai — let you add each flight segment individually, so the full itinerary reaches your specialist in one
              request rather than several back-and-forth emails.
            </p>
          </Reveal>
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {cabinNotes.map((c, i) => (
              <Reveal key={c.name} delay={i * 0.06}>
                <div className="h-full rounded-2xl border border-[var(--color-navy-950)]/8 bg-white p-6">
                  <h3 className="font-display text-base font-semibold text-[var(--color-navy-950)]">{c.name}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--color-navy-950)]/65">{c.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={0.2}>
            <p className="mt-6 max-w-2xl text-xs leading-relaxed text-[var(--color-navy-950)]/65">
              Cabin features vary by airline and aircraft — not every carrier offers every feature on every route. Your specialist will
              confirm the specific seat product and service before you book.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <Reveal>
          <p className="text-xs font-semibold tracking-[0.25em] text-[var(--color-gold-600)]">TRAVELERS &amp; CONTACT DETAILS</p>
          <h2 className="mt-3 text-[clamp(1.6rem,3.4vw,2.25rem)] font-display font-semibold leading-tight text-[var(--color-navy-950)]">
            What we ask for, and why
          </h2>
          <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-[var(--color-navy-950)]/70">
            <p>
              The traveler count (adults, children, and infants) determines the fares and aircraft configurations your specialist
              searches — infant fares and seating rules differ from adult and child fares, so it&apos;s worth entering accurately even at
              the request stage.
            </p>
            <p>
              The phone field asks for a country code alongside the number because our specialists work with customers worldwide —
              entering the correct country ensures the number is dialed correctly and validated properly. We call, email, or message
              using the details you provide; see our{" "}
              <a href="/privacy-policy" className="underline decoration-dotted underline-offset-2 hover:text-[var(--color-gold-600)]">
                Privacy Policy
              </a>{" "}
              for how that information is used and stored.
            </p>
            <p>
              Submitting the form does not charge any payment method and does not commit you to booking — it starts a conversation
              with a specialist who reviews suitable options and calls out fare rules and conditions clearly before you&apos;re ever asked
              to pay for anything.
            </p>
          </div>
        </Reveal>
      </section>

      <section className="border-t border-[var(--color-navy-950)]/8 py-14 text-center">
        <Reveal>
          <p className="text-sm text-[var(--color-navy-950)]/65">
            Prefer to talk it through first? Call {CONTACT_PHONE_DISPLAY} or see our{" "}
            <a href="/contact" className="underline decoration-dotted underline-offset-2 hover:text-[var(--color-gold-600)]">
              contact page
            </a>{" "}
            for more ways to reach a specialist.
          </p>
        </Reveal>
      </section>
    </>
  );
}
