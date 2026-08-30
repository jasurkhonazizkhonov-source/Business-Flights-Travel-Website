import type { Metadata } from "next";
import Link from "next/link";
import { Plane, MapPin, Briefcase, MessageCircle } from "lucide-react";
import { PRIMARY_CTA_LABEL } from "@/lib/constants";

// A 404 should never be indexed — it isn't a real destination URL, and
// letting search engines crawl/rank it would just be noise.
export const metadata: Metadata = {
  title: "Page Not Found",
  robots: { index: false, follow: true },
};

const helpfulLinks = [
  { href: "/destinations", label: "Browse Destinations", description: "See where we fly, business class", Icon: MapPin },
  { href: "/business-class", label: "Business Class", description: "What a business-class fare includes", Icon: Briefcase },
  { href: "/flights", label: PRIMARY_CTA_LABEL, description: "Tell us your route and dates", Icon: Plane },
  { href: "/contact", label: "Contact Us", description: "Reach a travel specialist directly", Icon: MessageCircle },
];

export default function NotFound() {
  return (
    <section className="mx-auto flex min-h-[70vh] max-w-3xl flex-col items-center px-4 py-20 text-center sm:px-6 sm:py-28 lg:px-8">
      <p className="font-display text-[clamp(3.5rem,14vw,6rem)] font-semibold leading-none text-[var(--color-gold-500)]">404</p>
      <h1 className="mt-4 text-[clamp(1.6rem,4.5vw,2.25rem)] font-display font-semibold leading-tight text-[var(--color-navy-950)]">
        We couldn&apos;t find that page
      </h1>
      <p className="mt-4 max-w-md text-[15px] leading-relaxed text-[var(--color-navy-950)]/65">
        The page you&apos;re looking for may have moved, been renamed, or never existed. Let&apos;s get you back on route.
      </p>

      <Link
        href="/"
        className="mt-8 inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--color-navy-950)] px-7 text-[0.95rem] font-semibold text-white shadow-lg transition-colors hover:bg-[var(--color-gold-600)]"
      >
        Back to Home
      </Link>

      <div className="mt-14 grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
        {helpfulLinks.map(({ href, label, description, Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-center gap-3.5 rounded-2xl border border-[var(--color-navy-950)]/8 bg-white p-4 text-left transition-colors hover:border-[var(--color-gold-500)]/50 hover:bg-[var(--color-cream-100)]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-cream-100)] text-[var(--color-navy-800)] group-hover:bg-white">
              <Icon size={18} aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-[var(--color-navy-950)]">{label}</span>
              <span className="block text-xs text-[var(--color-navy-950)]/55">{description}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
