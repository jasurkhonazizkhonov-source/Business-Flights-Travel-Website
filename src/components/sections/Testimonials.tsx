import { Star, ExternalLink } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { testimonials } from "@/data/testimonials";
import { TRUSTPILOT_URL } from "@/lib/constants";

// Deliberately does not fabricate star ratings, review counts, names, or
// quotes. `testimonials` (src/data/testimonials.ts) is empty until real,
// verified feedback exists — this renders a clean, honest state either way
// rather than inventing content to fill the section.
export function Testimonials() {
  return (
    <section className="border-y border-[var(--color-navy-950)]/8 bg-[var(--color-cream-100)] py-14 sm:py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <p className="text-xs font-semibold tracking-[0.25em] text-[var(--color-gold-600)]">CUSTOMER FEEDBACK</p>
          <h2 className="mt-3 font-display text-2xl font-semibold text-[var(--color-navy-950)] sm:text-3xl">What Travelers Say</h2>
        </Reveal>

        {testimonials.length > 0 ? (
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {testimonials.map((t, i) => (
              <Reveal key={t.name + i} delay={i * 0.06}>
                <figure className="h-full rounded-2xl border border-[var(--color-navy-950)]/8 bg-white p-6">
                  <blockquote className="text-sm leading-relaxed text-[var(--color-navy-950)]/75">&ldquo;{t.quote}&rdquo;</blockquote>
                  <figcaption className="mt-4 text-xs font-semibold text-[var(--color-navy-950)]">
                    {t.name} <span className="font-normal text-[var(--color-navy-950)]/65">— {t.context}</span>
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        ) : (
          <Reveal delay={0.08}>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-[var(--color-navy-950)]/65">
              We publish real traveler feedback here as it comes in — nothing invented in the meantime.
            </p>
          </Reveal>
        )}

        <Reveal delay={0.14}>
          <a
            href={TRUSTPILOT_URL}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="mt-8 inline-flex items-center gap-2 rounded-full border border-[var(--color-navy-950)]/15 bg-white px-5 py-3 text-sm font-semibold text-[var(--color-navy-900)] transition-colors hover:border-[var(--color-gold-500)] hover:text-[var(--color-gold-600)]"
          >
            <span className="flex items-center gap-0.5 text-[#00b67a]" aria-hidden="true">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} size={14} fill="currentColor" strokeWidth={0} />
              ))}
            </span>
            See Our Reviews on Trustpilot
            <ExternalLink size={14} className="text-[var(--color-navy-950)]/40" />
          </a>
        </Reveal>
      </div>
    </section>
  );
}
