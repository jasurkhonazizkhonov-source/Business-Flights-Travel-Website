import type { Metadata } from "next";
import Link from "next/link";
import { Phone, Mail, ArrowRight } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { ContactForm } from "@/components/contact/ContactForm";
import { CONTACT_EMAIL, CONTACT_PHONE_DISPLAY, PRIMARY_CTA_LABEL } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Contact Us",
  description: "Get in touch with Business Flights Travel for business-class flight assistance, or submit a flight request directly.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
      <Reveal>
        <p className="text-xs font-semibold tracking-[0.25em] text-[var(--color-gold-600)]">CONTACT</p>
        <h1 className="mt-3 max-w-xl text-[clamp(2rem,4.5vw,3rem)] font-display font-semibold leading-tight text-[var(--color-navy-950)]">Get in Touch</h1>
        <p className="mt-4 max-w-xl text-[var(--color-navy-950)]/70">
          Have a question before requesting a quote, or need to reach your travel specialist? Send us a message, or go straight to the
          flight request form for a fare search.
        </p>
      </Reveal>

      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_1.3fr]">
        <Reveal>
          <div className="space-y-6">
            <div className="rounded-2xl bg-[var(--color-cream-100)] p-6">
              <Phone className="h-6 w-6 text-[var(--color-navy-800)]" />
              <h2 className="mt-3 font-display text-lg font-semibold text-[var(--color-navy-950)]">Call Us</h2>
              <a href={`tel:${CONTACT_PHONE_DISPLAY.replace(/[^+\d]/g, "")}`} className="mt-1 block text-sm text-[var(--color-navy-950)]/75 hover:text-[var(--color-gold-600)]">
                {CONTACT_PHONE_DISPLAY}
              </a>
            </div>
            <div className="rounded-2xl bg-[var(--color-cream-100)] p-6">
              <Mail className="h-6 w-6 text-[var(--color-navy-800)]" />
              <h2 className="mt-3 font-display text-lg font-semibold text-[var(--color-navy-950)]">Email Us</h2>
              <a href={`mailto:${CONTACT_EMAIL}`} className="mt-1 block text-sm text-[var(--color-navy-950)]/75 hover:text-[var(--color-gold-600)]">
                {CONTACT_EMAIL}
              </a>
            </div>
            <div className="rounded-2xl border-2 border-dashed border-[var(--color-gold-500)]/40 bg-white p-6">
              <h2 className="font-display text-lg font-semibold text-[var(--color-navy-950)]">Ready to fly?</h2>
              <p className="mt-1 text-sm text-[var(--color-navy-950)]/65">Skip the message and request a fare directly.</p>
              <Link
                href="/flights"
                className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[var(--color-navy-950)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-gold-600)]"
              >
                {PRIMARY_CTA_LABEL} <ArrowRight size={15} />
              </Link>
            </div>
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <ContactForm />
        </Reveal>
      </div>
    </section>
  );
}
