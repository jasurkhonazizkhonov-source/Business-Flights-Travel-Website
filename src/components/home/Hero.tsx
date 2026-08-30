import Image from "next/image";
import { Reveal } from "@/components/Reveal";
import { FlightRequestForm } from "@/components/flight-form/FlightRequestForm";
import { SITE_TAGLINE } from "@/lib/constants";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-[var(--color-navy-950)]">
      <div className="absolute inset-0">
        <Image
          src="https://images.unsplash.com/photo-1747441977439-f8ded946d957?q=80&w=2400&auto=format&fit=crop"
          alt=""
          fill
          priority
          className="object-cover opacity-70"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--color-navy-950)]/35 via-[var(--color-navy-950)]/55 to-[var(--color-navy-950)]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-16 sm:px-6 sm:pt-20 lg:px-8 lg:pt-28">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <p className="text-xs font-semibold tracking-[0.3em] text-[var(--color-gold-400)]">BUSINESS FLIGHTS TRAVEL</p>
          </Reveal>
          <Reveal delay={0.08}>
            <h1 className="mt-4 text-balance text-[clamp(2rem,6vw,3.75rem)] font-display font-semibold leading-[1.08] text-white">
              {SITE_TAGLINE}
            </h1>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mx-auto mt-5 max-w-xl text-balance text-base text-white/75 sm:text-lg">
              Business class, first class, and international flights — requested in minutes, handled personally by a dedicated travel
              specialist from search to booking.
            </p>
          </Reveal>
        </div>

        <Reveal delay={0.24} className="mx-auto mt-10 max-w-4xl lg:mt-14">
          <FlightRequestForm />
        </Reveal>
      </div>
    </section>
  );
}
