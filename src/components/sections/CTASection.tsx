import Link from "next/link";
import { Reveal } from "@/components/Reveal";
import { PRIMARY_CTA_LABEL } from "@/lib/constants";

export function CTASection({
  title = "Ready to request your business-class fare?",
  description = "Tell us your route and dates — a travel specialist will follow up with options tailored to your trip.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <section className="bg-[var(--color-navy-950)] py-14 sm:py-20">
      <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
        <Reveal>
          <h2 className="font-display text-3xl font-semibold text-white sm:text-4xl">{title}</h2>
          <p className="mx-auto mt-3 max-w-xl text-[var(--color-cream-100)]/70">{description}</p>
          <Link
            href="/flights"
            className="mt-8 inline-flex items-center rounded-full bg-[var(--color-gold-500)] px-8 py-4 text-base font-semibold text-[var(--color-navy-950)] shadow-lg transition-transform hover:scale-[1.03] hover:bg-[var(--color-gold-400)]"
          >
            {PRIMARY_CTA_LABEL}
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
