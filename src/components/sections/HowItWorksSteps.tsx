import Image from "next/image";
import { Reveal } from "@/components/Reveal";
import { howItWorksSteps } from "@/data/how-it-works";
import { cn } from "@/lib/cn";

export function HowItWorksSteps() {
  return (
    <div className="space-y-16 sm:space-y-24">
      {howItWorksSteps.map((step, i) => {
        const reversed = i % 2 === 1;
        return (
          <div
            key={step.title}
            className={cn(
              "grid grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-14",
              reversed && "lg:[&>*:first-child]:order-2",
            )}
          >
            <Reveal className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl">
              <Image
                src={step.image}
                alt={step.imageAlt}
                fill
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="object-cover"
                loading={i === 0 ? undefined : "lazy"}
                priority={i === 0}
              />
            </Reveal>
            <Reveal delay={0.08}>
              <span className="font-display text-4xl font-semibold text-[var(--color-gold-500)]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-3 font-display text-2xl font-semibold text-[var(--color-navy-950)] sm:text-3xl">{step.title}</h3>
              <p className="mt-3 max-w-md text-[15px] leading-relaxed text-[var(--color-navy-950)]/70">{step.description}</p>
            </Reveal>
          </div>
        );
      })}
    </div>
  );
}
