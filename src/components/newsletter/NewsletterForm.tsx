"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { subscribeToNewsletter } from "@/server/actions/subscribe-newsletter";
import { ACTION_FAILURE_MESSAGES, ACTION_TIMEOUT_MS, callAction, isNewsletterResult } from "@/lib/safe-action";
import { cn } from "@/lib/cn";
import { isValidEmail } from "@/lib/validate";

// `idPrefix` must be unique per instance on a page: the home page renders this form twice (the
// newsletter band and the footer), and fixed ids made the second email field's <label for> point at the
// first field and duplicated the honeypot id. The footer keeps the original `newsletter-*` ids.
export function NewsletterForm({ variant = "dark", idPrefix = "newsletter" }: { variant?: "dark" | "light"; idPrefix?: string }) {
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [, startTransition] = useTransition();
  // Our own "a request is in flight" flag. React keeps `useTransition`'s pending flag true until the Server Action itself settles, which after a
  // time-out (callAction) can be much later, so the button must not be driven by it: it is released as soon as the outcome is known.
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const emailId = `${idPrefix}-email`;
  const websiteId = `${idPrefix}-website`;
  const errorId = `${idPrefix}-error`;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Matches the instant-feedback pattern already used in
    // FlightRequestForm/ContactForm — catches a malformed address (missing
    // "@", no TLD, etc.) without a round trip to the server, which
    // previously only caught this via subscribeToNewsletter's zod check.
    if (!isValidEmail(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    setError("");
    setBusy(true);
    startTransition(async () => {
      // A call that fails as a whole (dropped connection, timeout, thrown action, unexpected reply) is an inline message, never the route error
      // page, and the typed address stays in the field. Nothing is retried automatically, and no "subscribed" message is shown unless the server
      // confirmed it.
      const outcome = await callAction(() => subscribeToNewsletter({ email, website }), isNewsletterResult, ACTION_TIMEOUT_MS.newsletter);
      setBusy(false);
      if (!outcome.ok) {
        setError(ACTION_FAILURE_MESSAGES.newsletter);
        toast.error("Subscription failed", { description: ACTION_FAILURE_MESSAGES.newsletter });
        return;
      }
      const res = outcome.value;
      if (res.ok) {
        // A toast, not an inline swap that replaces this compact footer
        // widget — the form (and its input) stays put, so a visitor who
        // wants to subscribe a second address doesn't need to reload.
        toast.success(res.alreadySubscribed ? "You're already on the list" : "You're subscribed", {
          description: res.alreadySubscribed
            ? "That email is already receiving our travel inspiration emails."
            : "We'll send destination guides and business-class tips every so often.",
        });
        setEmail("");
      } else {
        setError(res.error);
        toast.error("Subscription failed", { description: res.error });
      }
    });
  }

  const isDark = variant === "dark";

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <label htmlFor={emailId} className="sr-only">
          Email address
        </label>
        <input
          id={emailId}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Your email address"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            "min-h-11 w-full rounded-full border px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--color-gold-400)]/40 sm:max-w-xs",
            isDark
              ? "border-white/20 bg-white/5 text-white focus:border-[var(--color-gold-400)]"
              : "border-[var(--color-navy-950)]/15 bg-white text-[var(--color-navy-950)] focus:border-[var(--color-gold-400)]",
          )}
        />
        <div className="hidden" aria-hidden="true">
          <label htmlFor={websiteId}>Website</label>
          <input id={websiteId} tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[var(--color-gold-500)] px-6 py-2.5 text-sm font-semibold text-[var(--color-navy-950)] transition-colors hover:bg-[var(--color-gold-400)] disabled:opacity-70"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : "Subscribe"}
        </button>
      </div>
      {/* red-400 is 2.8:1 on the light variant's cream band; red-300 on navy (9:1) and red-700 on cream (6:1) both pass. */}
      {error && (
        <p id={errorId} role="alert" className={cn("mt-2 text-xs", isDark ? "text-red-300" : "text-red-700")}>
          {error}
        </p>
      )}
      <p className={cn("mt-3 text-xs leading-relaxed", isDark ? "text-white/60" : "text-[var(--color-navy-950)]/65")}>
        By subscribing, you agree to our{" "}
        <Link href="/terms-of-service" className="underline decoration-dotted underline-offset-2 hover:text-[var(--color-gold-400)]">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="/privacy-policy" className="underline decoration-dotted underline-offset-2 hover:text-[var(--color-gold-400)]">
          Privacy Policy
        </Link>
        .
      </p>
    </form>
  );
}
