import Image from "next/image";
import { cn } from "@/lib/cn";

// The real Business Flights Travel wordmark (public/logo.png, supplied by
// the company), processed into two on-brand variants — no invented mark or
// icon:
//   - logo-navy.png: navy text + gold accents, trimmed, transparent background
//     — for light/cream sections (header, light footer areas).
//   - logo-white.png: same shape, navy recolored to white, gold accents kept
//     — for dark navy sections (footer, hero over photography).
// Intrinsic size 1077x402 (~2.68:1) is preserved via width/height so Next
// never distorts it; actual display size is controlled by the className's
// height, with width auto-following the aspect ratio.
const LOGO_WIDTH = 1077;
const LOGO_HEIGHT = 402;

export function Logo({
  variant = "navy",
  className = "h-8 w-auto",
  sizes = "96px",
  priority,
}: {
  variant?: "navy" | "white";
  className?: string;
  // Real rendered width in CSS px at the largest breakpoint this instance
  // is shown at (e.g. the header's h-9 ≈ 36px tall × ~2.68:1 ≈ 96px wide).
  // Without this, next/image has no way to know the logo is displayed far
  // smaller than its 1077px source and generates a srcset sized for the
  // full intrinsic width — this is what was costing ~20KB for a ~96×36
  // logo. Override per call site when the real display width differs.
  sizes?: string;
  priority?: boolean;
}) {
  const src = variant === "white" ? "/brand/logo-white.png" : "/brand/logo-navy.png";
  return (
    <Image
      src={src}
      alt="Business Flights Travel"
      width={LOGO_WIDTH}
      height={LOGO_HEIGHT}
      sizes={sizes}
      priority={priority}
      className={cn("w-auto select-none", className)}
    />
  );
}
