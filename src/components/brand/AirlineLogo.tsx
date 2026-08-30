import Image from "next/image";
import { Plane } from "lucide-react";
import { cn } from "@/lib/cn";

const SIZES = {
  sm: 36,
  md: 48,
  lg: 64,
} as const;

/**
 * Renders one airline's logo in a fixed-size, consistently padded circular
 * container — reused anywhere the site shows an airline (the footer
 * airline strip today; a future quote/itinerary display later). Every
 * badge is the same outer size regardless of the source image's own
 * aspect ratio (`object-contain` keeps the mark itself undistorted), so a
 * wide wordmark and a square icon-mark sit at the same visual weight.
 *
 * `logoUrl` is expected to come from the application's static airline
 * registry (see src/data/airlines.ts) rather than being hard-coded per call
 * site. When an airline has no logo on file, this falls back to a plain
 * icon instead of inventing a text badge.
 */
export function AirlineLogo({
  name,
  logoUrl,
  size = "md",
  className,
}: {
  name: string;
  logoUrl?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const px = SIZES[size];
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white p-2 shadow-sm ring-1 ring-black/5",
        className,
      )}
      style={{ width: px, height: px }}
    >
      {logoUrl ? (
        <Image
          src={logoUrl}
          alt={name}
          width={px}
          height={px}
          loading="lazy"
          className="h-full w-full object-contain"
        />
      ) : (
        <Plane size={px * 0.45} className="text-[var(--color-navy-950)]/30" aria-label={name} strokeWidth={1.75} />
      )}
    </span>
  );
}
