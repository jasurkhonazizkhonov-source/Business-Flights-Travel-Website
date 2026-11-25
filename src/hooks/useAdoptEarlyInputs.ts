"use client";

import { useLayoutEffect, useRef } from "react";

type EarlyWindow = Window & { __bftEarlyInputs?: Record<string, string>; __bftEarlyClosed?: Record<string, true> };

/**
 * Gives a form back what the visitor typed (or the browser autofilled) into its server-rendered fields before React hydrated it (see src/lib/early-input-capture.ts).
 * Pass, per field id, a function that accepts the raw text and returns whether to use it (so a select can refuse a value that is not one of its options). It runs once,
 * right after hydration and before the browser paints, then closes those ids: later typing is never recorded, so nothing stale can come back when a form mounts again.
 */
export function useAdoptEarlyInputs(adopters: Record<string, (value: string) => void>) {
  const latest = useRef(adopters);
  useLayoutEffect(() => {
    latest.current = adopters;
  });
  useLayoutEffect(() => {
    const w = window as EarlyWindow;
    const early = w.__bftEarlyInputs;
    const closed = (w.__bftEarlyClosed ??= {});
    for (const [id, adopt] of Object.entries(latest.current)) {
      const value = early?.[id];
      if (early) delete early[id];
      closed[id] = true;
      if (typeof value === "string" && value !== "") adopt(value);
    }
  }, []);
}
