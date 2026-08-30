"use client";

import { useState, useTransition } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { subscribeToNewsletter } from "@/server/actions/subscribe-newsletter";
import { cn } from "@/lib/cn";

export function NewsletterForm({ variant = "dark" }: { variant?: "dark" | "light" }) {
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    startTransition(async () => {
      const res = await subscribeToNewsletter({ email, website });
      if (res.ok) {
        setStatus("success");
        setMessage(res.alreadySubscribed ? "You're already on the list." : "You're subscribed.");
        setEmail("");
      } else {
        setStatus("error");
        setMessage(res.error);
      }
    });
  }

  const isDark = variant === "dark";

  if (status === "success") {
    return (
      <div className={cn("flex items-center gap-2 text-sm", isDark ? "text-white" : "text-[var(--color-navy-950)]")}>
        <CheckCircle2 size={18} className="shrink-0 text-[var(--color-gold-400)]" />
        {message}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <label htmlFor="newsletter-email" className="sr-only">
          Email address
        </label>
        <input
          id="newsletter-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Your email address"
          className={cn(
            "min-h-11 w-full rounded-full border px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--color-gold-400)]/40 sm:max-w-xs",
            isDark
              ? "border-white/20 bg-white/5 text-white placeholder:text-white/40 focus:border-[var(--color-gold-400)]"
              : "border-[var(--color-navy-950)]/15 bg-white text-[var(--color-navy-950)] placeholder:text-[var(--color-navy-950)]/40 focus:border-[var(--color-gold-500)]",
          )}
        />
        <div className="hidden" aria-hidden="true">
          <label htmlFor="newsletter-website">Website</label>
          <input id="newsletter-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[var(--color-gold-500)] px-6 py-2.5 text-sm font-semibold text-[var(--color-navy-950)] transition-colors hover:bg-[var(--color-gold-400)] disabled:opacity-70"
        >
          {pending ? <Loader2 size={16} className="animate-spin" /> : "Subscribe"}
        </button>
      </div>
      {status === "error" && <p className="mt-2 text-xs text-red-400">{message}</p>}
      <p className={cn("mt-3 text-xs leading-relaxed", isDark ? "text-white/50" : "text-[var(--color-navy-950)]/65")}>
        By subscribing, you agree to our{" "}
        <a href="/terms-of-service" className="underline decoration-dotted underline-offset-2 hover:text-[var(--color-gold-400)]">
          Terms of Service
        </a>{" "}
        and{" "}
        <a href="/privacy-policy" className="underline decoration-dotted underline-offset-2 hover:text-[var(--color-gold-400)]">
          Privacy Policy
        </a>
        .
      </p>
    </form>
  );
}
