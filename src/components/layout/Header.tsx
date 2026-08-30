"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X, ChevronDown } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { DestinationsMegaMenu } from "@/components/layout/DestinationsMegaMenu";
import { REGIONS, destinationPath, getDestinationsByRegion } from "@/data/destinations";
import { NAV_LINKS, PRIMARY_CTA_LABEL } from "@/lib/constants";
import { cn } from "@/lib/cn";

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileDestOpen, setMobileDestOpen] = useState(false);
  const pathname = usePathname();

  // Closing the mobile menu on navigation is "adjusting state when a prop
  // changes" — done during render (React's recommended alternative to an
  // effect here) rather than as a post-render effect.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setMobileOpen(false);
    setMobileDestOpen(false);
  }

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lock background scroll while the mobile panel is open so it reads as a
  // proper overlay/sheet rather than content that happens to sit above a
  // still-scrollable page.
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  // The mobile panel locks background scroll while open, so it behaves like
  // a modal overlay for a keyboard/screen-reader user even though it isn't
  // marked up as one — closing on Escape is the behavior that expects.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full transition-colors duration-300",
        scrolled || mobileOpen ? "bg-[var(--color-cream-50)]/95 shadow-[0_1px_0_rgba(10,26,48,0.08)] backdrop-blur" : "bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:h-20 lg:px-8">
        <Link href="/" className="shrink-0" aria-label="Business Flights Travel — home">
          <Logo variant="navy" className="h-7 sm:h-8 lg:h-9" priority />
        </Link>

        <nav className="hidden items-center gap-5 xl:gap-7 lg:flex" aria-label="Primary">
          {NAV_LINKS.map((link) => {
            const active = pathname === link.href;
            if (link.href === "/destinations") {
              return <DestinationsMegaMenu key={link.href} active={active} />;
            }
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "whitespace-nowrap text-[0.8rem] font-medium tracking-wide text-[var(--color-navy-800)] transition-colors hover:text-[var(--color-gold-600)] xl:text-[0.85rem]",
                  active && "text-[var(--color-gold-600)]",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden lg:block">
          <Link
            href="/flights"
            className="inline-flex items-center whitespace-nowrap rounded-full bg-[var(--color-navy-950)] px-4 py-2.5 text-[0.8rem] font-semibold text-white shadow-sm transition-colors hover:bg-[var(--color-gold-600)] xl:px-5 xl:text-sm"
          >
            {PRIMARY_CTA_LABEL}
          </Link>
        </div>

        <button
          type="button"
          className="-mr-2 inline-flex items-center justify-center rounded-md p-2 text-[var(--color-navy-950)] lg:hidden"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="overflow-hidden border-t border-[var(--color-navy-950)]/10 bg-[var(--color-cream-50)] lg:hidden"
          >
            <nav
              className="flex max-h-[calc(100dvh-4rem)] flex-col gap-0.5 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4"
              aria-label="Mobile"
            >
              {NAV_LINKS.map((link) => {
                if (link.href === "/destinations") {
                  return (
                    <div key={link.href}>
                      <button
                        type="button"
                        onClick={() => setMobileDestOpen((v) => !v)}
                        aria-expanded={mobileDestOpen}
                        className="flex min-h-11 w-full items-center justify-between rounded-lg px-3 py-3 text-base font-medium text-[var(--color-navy-900)] active:bg-[var(--color-navy-950)]/8"
                      >
                        Destinations
                        <ChevronDown size={18} className={cn("transition-transform", mobileDestOpen && "rotate-180")} />
                      </button>
                      <AnimatePresence initial={false}>
                        {mobileDestOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.18 }}
                            className="overflow-hidden pl-3"
                          >
                            {REGIONS.map((region) => {
                              const cities = [...getDestinationsByRegion(region.slug)]
                                .sort((a, b) => Number(b.featured) - Number(a.featured))
                                .slice(0, 4);
                              if (cities.length === 0) return null;
                              return (
                                <div key={region.slug} className="py-2">
                                  <p className="px-3 text-xs font-semibold tracking-[0.15em] text-[var(--color-gold-600)]">
                                    {region.label.toUpperCase()}
                                  </p>
                                  <div className="mt-1 flex flex-col">
                                    {cities.map((d) => (
                                      <Link
                                        key={d.citySlug}
                                        href={destinationPath(d)}
                                        className="min-h-10 rounded-lg px-3 py-2 text-sm text-[var(--color-navy-800)] active:bg-[var(--color-navy-950)]/8"
                                      >
                                        {d.city}
                                      </Link>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                            <Link
                              href="/destinations"
                              className="mt-1 block min-h-10 rounded-lg px-3 py-2 text-sm font-semibold text-[var(--color-gold-600)] active:bg-[var(--color-navy-950)]/8"
                            >
                              View all destinations →
                            </Link>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                }
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="min-h-11 rounded-lg px-3 py-3 text-base font-medium text-[var(--color-navy-900)] active:bg-[var(--color-navy-950)]/8"
                  >
                    {link.label}
                  </Link>
                );
              })}
              <Link
                href="/flights"
                className="mt-2 inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--color-navy-950)] px-5 py-3 text-[0.95rem] font-semibold text-white"
              >
                {PRIMARY_CTA_LABEL}
              </Link>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
