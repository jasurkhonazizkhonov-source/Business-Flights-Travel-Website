"use client";

// Route-level error boundary — catches a render/hydration error anywhere
// under the root layout (a page, a section, a client component) that isn't
// already handled by a server action's own try/catch (see
// src/server/actions/*.ts, which already return a friendly error object
// rather than throwing). Without this file, an uncaught error here falls
// through to Next's generic, unstyled default error UI — this replaces
// that with something that matches the site and gives the visitor a real
// way forward instead of a dead end.
import { useEffect } from "react";
import Link from "next/link";
import { RefreshCw, MessageCircle } from "lucide-react";
import { CONTACT_EMAIL, CONTACT_PHONE_DISPLAY } from "@/lib/constants";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // No error-tracking service is integrated (the site has no analytics
    // of any kind — see cookie-policy). console.error is what actually
    // surfaces this in Vercel's own function/runtime logs, which is the
    // only observability available without adding a new third-party
    // service nobody asked for. Never logs anything about the user
    // (no form input, no personal data) — only the error itself and
    // Next's own digest id for correlating with server logs.
    console.error("[app/error.tsx] Unhandled render error", error);
  }, [error]);

  return (
    <section className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center px-4 py-20 text-center sm:px-6 sm:py-28 lg:px-8">
      <p className="font-display text-[clamp(2.5rem,10vw,4rem)] font-semibold leading-none text-[var(--color-gold-500)]">
        Something went wrong
      </p>
      <h1 className="mt-4 text-[clamp(1.4rem,4vw,1.9rem)] font-display font-semibold leading-tight text-[var(--color-navy-950)]">
        This page hit an unexpected error
      </h1>
      <p className="mt-4 max-w-md text-[15px] leading-relaxed text-[var(--color-navy-950)]/65">
        It&apos;s not something you did — try again, and if it keeps happening, reach a travel specialist directly and we&apos;ll help
        you the other way.
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={reset}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[var(--color-navy-950)] px-7 text-[0.95rem] font-semibold text-white shadow-lg transition-colors hover:bg-[var(--color-gold-600)]"
        >
          <RefreshCw size={17} aria-hidden="true" />
          Try Again
        </button>
        <Link
          href="/"
          className="inline-flex min-h-12 items-center justify-center rounded-full border border-[var(--color-navy-950)]/15 px-7 text-[0.95rem] font-semibold text-[var(--color-navy-950)] transition-colors hover:border-[var(--color-navy-950)]/30"
        >
          Back to Home
        </Link>
      </div>

      <div className="mt-10 flex items-center gap-3 rounded-2xl border border-[var(--color-navy-950)]/8 bg-white p-4 text-left">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-cream-100)] text-[var(--color-navy-800)]">
          <MessageCircle size={18} aria-hidden="true" />
        </span>
        <span>
          <span className="block text-sm font-semibold text-[var(--color-navy-950)]">Reach a specialist directly</span>
          <span className="block text-xs text-[var(--color-navy-950)]/65">
            Call {CONTACT_PHONE_DISPLAY} or email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="underline decoration-dotted underline-offset-2">
              {CONTACT_EMAIL}
            </a>
          </span>
        </span>
      </div>
    </section>
  );
}
