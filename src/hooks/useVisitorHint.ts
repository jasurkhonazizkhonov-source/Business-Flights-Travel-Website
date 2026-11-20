import { useEffect, useState } from "react";
import type { AirportOption } from "@/lib/validations/flight-request";

// The visitor's approximate, server-derived hint (country code and nearest major airport) - see src/app/api/visitor-hint/route.ts. Fetched ONCE per
// page load, after the page has loaded and gone idle (never competing with first paint), shared by every form on the page, and sanitised here
// again because it is data from the network. A failed or empty answer is simply "no hint": the forms then behave exactly as they do without one.

export type VisitorHint = { countryCode?: string; airport?: AirportOption };

const EMPTY: VisitorHint = {};
let pending: Promise<VisitorHint> | null = null;

function text(value: unknown, max: number): string | undefined {
  return typeof value === "string" && value.length > 0 && value.length <= max ? value : undefined;
}

export function sanitizeHint(raw: unknown): VisitorHint {
  if (!raw || typeof raw !== "object") return EMPTY;
  const data = raw as Record<string, unknown>;
  const hint: VisitorHint = {};
  if (typeof data.countryCode === "string" && /^[A-Z]{2}$/.test(data.countryCode)) hint.countryCode = data.countryCode;
  const a = data.airport as Record<string, unknown> | undefined;
  if (a && typeof a === "object" && typeof a.iata === "string" && /^[A-Z]{3}$/.test(a.iata)) {
    const city = text(a.city, 120);
    const name = text(a.name, 120);
    const country = text(a.country, 120);
    if (city && name && country) hint.airport = { iata: a.iata, city, name, country };
  }
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
