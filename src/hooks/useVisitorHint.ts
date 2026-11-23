import { useEffect, useState } from "react";
// The visitor's approximate, server-derived hint (the country code, for the phone prefix; no airport: that comes only from the device's own position) - see src/app/api/visitor-hint/route.ts. Fetched ONCE per
// page load, after the page has loaded and gone idle (never competing with first paint), shared by every form on the page, and sanitised here
// again because it is data from the network. A failed or empty answer is simply "no hint": the forms then behave exactly as they do without one.

export type VisitorHint = { countryCode?: string };

const EMPTY: VisitorHint = {};
let pending: Promise<VisitorHint> | null = null;

export function sanitizeHint(raw: unknown): VisitorHint {
  if (!raw || typeof raw !== "object") return EMPTY;
  const data = raw as Record<string, unknown>;
  const hint: VisitorHint = {};
  if (typeof data.countryCode === "string" && /^[A-Z]{2}$/.test(data.countryCode)) hint.countryCode = data.countryCode;
  return hint;
}

export function loadVisitorHint(): Promise<VisitorHint> {
  pending ??= (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch("/api/visitor-hint", { cache: "no-store", credentials: "omit", headers: { accept: "application/json" }, signal: controller.signal });
      return response.ok ? sanitizeHint(await response.json()) : EMPTY;
    } catch {
      return EMPTY;
    } finally {
      clearTimeout(timer);
    }
  })();
  return pending;
}

/** `null` until the answer is in (or when no hint exists yet), then the hint (possibly empty). Starts the one request after the page has loaded. */
export function useVisitorHint(): VisitorHint | null {
  const [hint, setHint] = useState<VisitorHint | null>(null);
  useEffect(() => {
    let cancelled = false;
    let cancelIdle: (() => void) | undefined;
    const run = () => {
      if (cancelled) return;
      const start = () => void loadVisitorHint().then((h) => !cancelled && setHint(h));
      if (typeof requestIdleCallback === "function") {
        const id = requestIdleCallback(start, { timeout: 1500 });
        cancelIdle = () => cancelIdleCallback(id);
      } else {
        const id = window.setTimeout(start, 300);
        cancelIdle = () => window.clearTimeout(id);
      }
    };
    if (document.readyState === "complete") run();
    else window.addEventListener("load", run, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener("load", run);
      cancelIdle?.();
    };
  }, []);
  return hint;
}
