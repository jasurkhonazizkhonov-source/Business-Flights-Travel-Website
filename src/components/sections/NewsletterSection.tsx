import { Reveal } from "@/components/Reveal";
import { NewsletterForm } from "@/components/newsletter/NewsletterForm";

export function NewsletterSection() {
  return (
    <section className="border-y border-[var(--color-navy-950)]/8 bg-[var(--color-cream-100)] py-14 sm:py-16">
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
        <Reveal>
          <p className="text-xs font-semibold tracking-[0.25em] text-[var(--color-gold-600)]">STAY IN THE LOOP</p>
          <h2 className="mt-3 font-display text-2xl font-semibold text-[var(--color-navy-950)] sm:text-3xl">
            Travel Inspiration &amp; Business-Class Updates
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-[var(--color-navy-950)]/65">
            Destination guides and practical business-class travel tips, sent occasionally — nothing else.
          </p>
          <div className="mx-auto mt-6 max-w-md">
            <NewsletterForm variant="light" />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
