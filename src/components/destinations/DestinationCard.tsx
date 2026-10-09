import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { destinationPath, type Destination } from "@/data/destinations";
import { formatFareUSD } from "@/lib/fares";

export function DestinationCard({
  destination,
  priority = false,
  // Default matches the /destinations full continent grid (grid-cols-1 →
  // sm:grid-cols-2 → lg:grid-cols-3 → xl:grid-cols-4) — the one call site
  // that actually renders 1 column on mobile. Grids with a different real
  // column count (e.g. the homepage preview's grid-cols-2 on mobile) must
  // pass their own accurate value, or next/image has no way to know the
  // card renders at ~50vw instead of 100vw and fetches a much larger
  // source width than the image is ever displayed at.
  sizes = "(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw",
}: {
  destination: Destination;
  priority?: boolean;
  sizes?: string;
}) {
  return (
    <Link
      href={destinationPath(destination)}
      className="group relative block overflow-hidden rounded-2xl bg-[var(--color-navy-950)] shadow-[0_1px_2px_rgba(10,26,48,0.08)] transition-[translate,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_16px_32px_-12px_rgba(10,26,48,0.35)]"
    >
      <div className="relative aspect-[3/2] w-full overflow-hidden">
        <Image
          src={destination.heroImage}
          alt={`${destination.city} skyline, ${destination.country} — business-class flight destination`}
          fill
          sizes={sizes}
          className="object-cover transition-transform duration-700 ease-out group-hover:scale-110"
          priority={priority}
        />
        {/* The scrim reaches further up the photo than a bare fade-to-navy so
            the white text below keeps >= 4.5:1 over bright skylines (e.g.
            Copenhagen's façades, Dubai's sky), not just over dark ones. */}
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-navy-950)] via-[var(--color-navy-950)]/55 via-45% to-transparent" />
      </div>
      <div className="absolute inset-x-0 bottom-0 p-3.5 [text-shadow:0_1px_6px_rgba(10,26,48,0.55)] sm:p-5">
        <h3 className="flex items-center gap-1.5 font-display text-base font-semibold text-white sm:text-xl">
          {destination.city}
          <ArrowUpRight size={16} className="hidden opacity-0 transition-opacity group-hover:opacity-100 sm:inline" />
        </h3>
        <p className="truncate text-xs text-white/85 sm:text-sm">
          {destination.country}
          {/* The airport code is a nicety, not needed to identify the card — dropped on
              the two-up phone grid where a long country name (e.g. United Arab Emirates)
              would otherwise wrap onto a second line. */}
          <span className="hidden text-white/65 sm:inline"> · {destination.iata}</span>
        </p>
        <p className="mt-1.5 text-xs font-medium text-white sm:text-sm">From {formatFareUSD(destination.startingFareUSD)}*</p>
      </div>
    </Link>
  );
}
