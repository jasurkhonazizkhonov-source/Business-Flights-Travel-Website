import { useCallback, useEffect, useRef, useState } from "react";
import { suggestAirportNear } from "@/data/airports";
import type { AirportOption } from "@/lib/validations/flight-request";

// The departure airport from the device's own position: the browser's Geolocation API, turned into the nearest MAJOR commercial airport (never a small
// airfield: src/lib/airport-suggestion.ts, hubs only, within MAX_SUGGESTION_KM). Rules this hook enforces:
//  - the browser's permission prompt is raised by start() and nowhere else, and start() acts ONCE per mounted form: re-renders, navigation within the page and
//    repeated calls never ask again. The prompt itself belongs to the browser (it is not bypassed, and a refusal is remembered by the browser, which reports
//    it through the Permissions API: a "denied" state ends here without a request);
//  - after a refusal (or a dismissed prompt, which browsers report the same way) this page session never asks again, even when the visitor moves on to another
//    page that has the form (a module-level flag in memory: nothing is stored, a reload starts afresh and the browser's own remembered choice applies);
//  - which moment calls start() is the caller's decision (the /flights page: when it opens; the home-page form: on the visitor's first use of it);
//  - the position is read with low accuracy and a time-out, never blocks the form, and a result is only used if it is a usable, reasonably precise position;
//  - the coordinates live inside this function: only the resulting airport leaves it, nothing is sent to the server, stored, logged or put in a URL;
//  - a missing API, a refusal, an unavailable position, a time-out, a useless position and "no major airport nearby" each end in a plain status, never an
//    error page and never a message that carries the position or the browser's error text.

export type DeviceAirportStatus = "idle" | "locating" | "found" | "unsupported" | "denied" | "unavailable" | "timeout" | "inaccurate" | "none-nearby";

/** Wait this long for a position once the browser has permission (the permission prompt itself is not counted by the browser). */
export const GEOLOCATION_TIMEOUT_MS = 8000;
/** A position up to this old is fine: the airport is the only thing taken from it. */
export const GEOLOCATION_MAX_AGE_MS = 10 * 60_000;
/** A position the browser itself describes as less precise than this is ignored: it could pick an airport in the wrong city. */
export const MAX_USABLE_ACCURACY_M = 100_000;

/** True once the visitor has refused (or dismissed) the question in this page session. Memory only: it is not written anywhere and a reload clears it. */
let refusedThisPageSession = false;

export function useDeviceAirport(onFound: (airport: AirportOption) => void) {
  const [status, setStatus] = useState<DeviceAirportStatus>("idle");
  const foundRef = useRef(onFound);
  useEffect(() => {
    foundRef.current = onFound;
  });
  const startedRef = useRef(false);
  const unmountedRef = useRef(false);
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
    };
  }, []);
  const set = useCallback((next: DeviceAirportStatus) => {
    if (!unmountedRef.current) setStatus(next);
  }, []);

  const locate = useCallback(() => {
    set("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        if (typeof accuracy === "number" && Number.isFinite(accuracy) && accuracy > MAX_USABLE_ACCURACY_M) {
          set("inaccurate");
          return;
        }
        suggestAirportNear(latitude, longitude)
          .then((suggestion) => {
            if (unmountedRef.current) return;
            if (suggestion) {
              foundRef.current(suggestion.airport);
              setStatus("found");
            } else {
              setStatus("none-nearby"); // outside every major airport's reach, or not a usable position
            }
          })
          .catch(() => set("unavailable"));
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          refusedThisPageSession = true;
          set("denied");
        }
        else if (error.code === error.TIMEOUT) set("timeout");
        else set("unavailable");
      },
      { enableHighAccuracy: false, timeout: GEOLOCATION_TIMEOUT_MS, maximumAge: GEOLOCATION_MAX_AGE_MS },
    );
  }, [set]);

  /** Asks for the position, once. Safe to call from any number of events (focus, click, mount): only the first call does anything. */
  const start = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (refusedThisPageSession) {
      set("denied");
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      set("unsupported");
      return;
    }
    const permissions = navigator.permissions;
    if (!permissions?.query) {
      locate(); // no Permissions API: the request itself is the only way to find out
      return;
    }
    permissions
      .query({ name: "geolocation" as PermissionName })
      .then((result) => {
        // "denied": the browser already holds a refusal; asking again would only be refused again (and is the "repeated prompt" the visitor must not see).
        if (result.state === "denied") {
          refusedThisPageSession = true;
          set("denied");
        }
        else locate(); // "granted": answered silently; "prompt": the browser asks now
      })
      .catch(() => locate()); // the query itself failed: fall back to the request
  }, [locate, set]);

  return { status, start };
}
