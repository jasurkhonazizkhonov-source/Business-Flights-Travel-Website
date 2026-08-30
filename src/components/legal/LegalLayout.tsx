import type { ReactNode } from "react";
import Link from "next/link";
import { Reveal } from "@/components/Reveal";

const LEGAL_NAV = [
  { label: "Privacy Policy", href: "/privacy-policy" },
  { label: "Cookie Policy", href: "/cookie-policy" },
  { label: "Terms of Service", href: "/terms-of-service" },
] as const;

export function LegalLayout({
  title,
  lastUpdated,
  intro,
  currentHref,
  children,
}: {
  title: string;
  lastUpdated: string;
  intro: string;
  currentHref: (typeof LEGAL_NAV)[number]["href"];
  children: ReactNode;
}) {
  return (
    <>
      <section className="border-b border-[var(--color-navy-950)]/8 bg-[var(--color-cream-100)] py-12 sm:py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <p className="text-xs font-semibold tracking-[0.25em] text-[var(--color-gold-600)]">LEGAL</p>
            <h1 className="mt-3 text-[clamp(1.9rem,4.5vw,2.75rem)] font-display font-semibold leading-tight text-[var(--color-navy-950)]">
              {title}
            </h1>
            <p className="mt-3 text-sm text-[var(--color-navy-950)]/55">Last updated: {lastUpdated}</p>
            <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-[var(--color-navy-950)]/70 sm:text-base">{intro}</p>
          </Reveal>
        </div>
      </section>

      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <nav aria-label="Legal pages" className="mb-10 flex flex-wrap gap-2 border-b border-[var(--color-navy-950)]/8 pb-6 text-sm">
          {LEGAL_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={
                item.href === currentHref
                  ? "rounded-full bg-[var(--color-navy-950)] px-4 py-2 font-semibold text-white"
                  : "rounded-full px-4 py-2 font-medium text-[var(--color-navy-800)] hover:bg-[var(--color-cream-100)]"
              }
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="legal-content space-y-10 text-[15px] leading-relaxed text-[var(--color-navy-950)]/80 sm:text-[16px]">
          {children}
        </div>
      </div>
    </>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-xl font-semibold text-[var(--color-navy-950)] sm:text-2xl">{heading}</h2>
      <div className="mt-3 space-y-4">{children}</div>
    </section>
  );
}
