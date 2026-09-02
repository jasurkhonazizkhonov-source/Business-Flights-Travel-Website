"use client";

import { Toaster as SonnerToaster } from "sonner";

// One <Toaster/>, mounted once at the root (works fine inside this Server
// Component tree — see layout.tsx). Styled at the "classNames" rung of
// Sonner's own styling ladder: enough to match the site's navy/gold/cream
// palette and rounded-xl vocabulary without going fully headless, which
// this restrained use doesn't need.
export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-center"
      toastOptions={{
        classNames: {
          toast:
            "!rounded-2xl !border !border-[var(--color-navy-950)]/10 !bg-white !shadow-[0_20px_60px_-24px_rgba(10,26,48,0.35)] !font-sans",
          title: "!text-[var(--color-navy-950)] !font-medium",
          description: "!text-[var(--color-navy-950)]/65",
          actionButton: "!bg-[var(--color-navy-950)] !text-white",
          cancelButton: "!bg-[var(--color-cream-100)] !text-[var(--color-navy-950)]",
          closeButton: "!border-[var(--color-navy-950)]/10 !bg-white !text-[var(--color-navy-950)]/60",
          success: "![&>svg]:!text-[var(--color-gold-600)]",
          error: "![&>svg]:!text-red-600",
        },
      }}
    />
  );
}
