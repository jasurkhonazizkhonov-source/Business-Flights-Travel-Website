import { ShieldCheck, Headset, Compass, ReceiptText } from "lucide-react";
import { Reveal } from "@/components/Reveal";

const points = [
  {
    icon: Headset,
    title: "A dedicated travel specialist",
    description: "Every request is reviewed personally by a specialist — not routed through an automated fare engine alone.",
  },
  {
    icon: Compass,
    title: "Business-class expertise",
    description: "We focus specifically on business, first-class, and international itineraries, and the routing decisions that come with them.",
  },
  {
    icon: ReceiptText,
    title: "Transparent process, no pressure",
    description: "You'll see clear options and pricing before deciding anything. Submitting a request never obligates you to book.",
  },
  {
    icon: ShieldCheck,
    title: "Support through booking and beyond",
    description: "Your specialist stays your point of contact through booking and for any changes that come up afterward.",
  },
];

export function TrustSection() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
      <Reveal>
        <p className="text-center text-xs font-semibold tracking-[0.25em] text-[var(--color-gold-600)]">WHY BUSINESS FLIGHTS TRAVEL</p>
        <h2 className="mx-auto mt-3 max-w-2xl text-center font-display text-3xl font-semibold text-[var(--color-navy-950)] sm:text-4xl">
          Personalized assistance, built around business-class travel
        </h2>
      </Reveal>
      <div className="mt-12 grid grid-cols-1 gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
        {points.map((p, i) => (
          <Reveal key={p.title} delay={i * 0.06}>
            <div className="h-full border-t-2 border-[var(--color-gold-500)] pt-5">
              <p.icon className="h-6 w-6 text-[var(--color-navy-800)]" aria-hidden="true" strokeWidth={1.75} />
              <h3 className="mt-3.5 font-display text-base font-semibold text-[var(--color-navy-950)]">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-navy-950)]/65">{p.description}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
