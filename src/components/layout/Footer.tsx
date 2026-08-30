import Link from "next/link";
import { Star } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { PaymentIcons } from "@/components/brand/PaymentIcons";
import { AirlineStrip } from "@/components/layout/AirlineStrip";
import { NewsletterForm } from "@/components/newsletter/NewsletterForm";
import { destinationPath, getFeaturedDestinations } from "@/data/destinations";
import {
  COMPANY_ADDRESS,
  CONTACT_EMAIL,
  CONTACT_PHONE_DISPLAY,
  NAV_LINKS,
  PRIMARY_CTA_LABEL,
  SITE_DESCRIPTION,
  SOCIAL_LINKS,
  TRUST_BADGES,
  TRUSTPILOT_URL,
} from "@/lib/constants";

const featuredDestinations = getFeaturedDestinations(6);

const LEGAL_LINKS = [
  { label: "Privacy Policy", href: "/privacy-policy" },
  { label: "Cookie Policy", href: "/cookie-policy" },
  { label: "Terms of Service", href: "/terms-of-service" },
] as const;

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[var(--color-navy-950)] text-[var(--color-cream-100)]">
      <AirlineStrip />
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 sm:gap-x-8 sm:gap-y-12 lg:grid-cols-[1.2fr_0.9fr_0.9fr_1.2fr]">
          <div className="sm:col-span-2 lg:col-span-1">
            <Logo variant="white" className="h-7" />
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-[var(--color-cream-100)]/70">{SITE_DESCRIPTION}</p>
            <Link
              href="/flights"
              className="mt-6 inline-flex min-h-11 items-center rounded-full border border-[var(--color-gold-500)]/60 px-5 py-2.5 text-sm font-semibold text-[var(--color-gold-400)] transition-colors hover:bg-[var(--color-gold-500)] hover:text-[var(--color-navy-950)]"
            >
              {PRIMARY_CTA_LABEL}
            </Link>
            {SOCIAL_LINKS.length > 0 && (
              <div className="mt-6 flex gap-3">
                {SOCIAL_LINKS.map((s) => (
                  <a
                    key={s.href}
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--color-cream-100)]/60 hover:text-[var(--color-gold-400)]"
                  >
                    {s.label}
                  </a>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-xs font-semibold tracking-[0.2em] text-white/50">EXPLORE</h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="inline-block py-0.5 text-[var(--color-cream-100)]/80 hover:text-[var(--color-gold-400)]">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold tracking-[0.2em] text-white/50">POPULAR DESTINATIONS</h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              {featuredDestinations.map((d) => (
                <li key={d.citySlug}>
                  <Link
                    href={destinationPath(d)}
                    className="inline-block py-0.5 text-[var(--color-cream-100)]/80 hover:text-[var(--color-gold-400)]"
                  >
                    {d.city}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/destinations" className="inline-block py-0.5 text-[var(--color-gold-400)] hover:text-[var(--color-gold-300)]">
                  View all destinations →
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold tracking-[0.2em] text-white/50">TRAVEL INSPIRATION</h3>
            <p className="mt-4 text-sm leading-relaxed text-[var(--color-cream-100)]/70">
              Destination guides and business-class travel tips, every so often — no spam.
            </p>
            <div className="mt-4">
              <NewsletterForm variant="dark" />
            </div>
          </div>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-8 border-t border-white/10 pt-10 sm:grid-cols-2 sm:mt-14">
          <div>
            <h3 className="text-xs font-semibold tracking-[0.2em] text-white/50">CONTACT</h3>
            <ul className="mt-4 space-y-2.5 text-sm text-[var(--color-cream-100)]/80">
              <li>
                <a href={`tel:${CONTACT_PHONE_DISPLAY.replace(/[^+\d]/g, "")}`} className="inline-block py-0.5 hover:text-[var(--color-gold-400)]">
                  {CONTACT_PHONE_DISPLAY}
                </a>
              </li>
              <li>
                <a href={`mailto:${CONTACT_EMAIL}`} className="inline-block py-0.5 break-all hover:text-[var(--color-gold-400)]">
                  {CONTACT_EMAIL}
                </a>
              </li>
              <li className="py-0.5 text-[var(--color-cream-100)]/60">{COMPANY_ADDRESS}</li>
            </ul>
          </div>
          <div className="sm:text-right">
            <h3 className="text-xs font-semibold tracking-[0.2em] text-white/50 sm:text-right">WE WORK WITH THESE PAYMENT TYPES</h3>
            <div className="mt-4 sm:flex sm:justify-end">
              <PaymentIcons />
            </div>
            <p className="mt-2 text-xs text-[var(--color-cream-100)]/60">
              Informational only — your travel specialist arranges payment directly with you during booking.
            </p>
          </div>
        </div>

        {/* Trust row: a real, verifiable Trustpilot link plus any confirmed
            accreditation badges. TRUST_BADGES (lib/constants.ts) is empty
            until a real IATA/ARC/BBB accreditation is confirmed — this
            renders nothing extra beyond Trustpilot while that stays empty,
            rather than a fabricated or placeholder credential. */}
        <div className="mt-10 flex flex-wrap items-center gap-4 border-t border-white/10 pt-8">
          <a
            href={TRUSTPILOT_URL}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-[var(--color-cream-100)]/80 transition-colors hover:border-[var(--color-gold-500)]/60 hover:text-[var(--color-gold-400)]"
          >
            <span className="flex items-center gap-0.5 text-[#00b67a]" aria-hidden="true">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} size={12} fill="currentColor" strokeWidth={0} />
              ))}
            </span>
            Read Our Reviews on Trustpilot
          </a>
          {TRUST_BADGES.map((badge) => (
            <span
              key={badge.label}
              title={badge.description}
              className="inline-flex items-center rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-[var(--color-cream-100)]/80"
            >
              {badge.label}
            </span>
          ))}
        </div>

        <div className="mt-8 flex flex-col gap-4 border-t border-white/10 pt-8 text-xs text-[var(--color-cream-100)]/50">
          <nav aria-label="Legal" className="flex flex-wrap gap-x-6 gap-y-2">
            {LEGAL_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="hover:text-[var(--color-cream-100)]/80">
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} Business Flights Travel. All rights reserved.</p>
            <p>Fares and availability are confirmed by a travel specialist prior to booking.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
