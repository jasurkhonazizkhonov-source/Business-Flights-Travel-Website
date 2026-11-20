import { useCallback, useEffect, useRef, useState } from "react";
import { suggestAirportNear } from "@/data/airports";
import type { AirportOption } from "@/lib/validations/flight-request";

// "Use my current location" for the departure airport: the device's own position, via the browser's Geolocation API, turned into the nearest major
// airport. Rules this hook enforces:
//  - the browser's permission prompt is only ever raised by an explicit request() (a click). Nothing here prompts on page load;
//  - if the visitor has ALREADY granted the permission to this site (Permissions API says "granted") the position is used silently - no prompt;
//  - once the permission is refused the button disappears. The refusal is NOT stored by this site (no cookie, no local or session storage): the browser
//    itself remembers it and reports it through the Permissions API, which this hook reads on every page load, so a reload does not ask again either;
//  - the coordinates stay in this function: only the resulting airport is returned, and nothing is sent to the server or stored;
//  - a missing API, a refusal, an unavailable position and a time-out each end in a plain status, never an error page.

export type DeviceAirportStatus = "unsupported" | "idle" | "locating" | "denied" | "unavailable" | "timeout" | "found" | "none-nearby";

const TIMEOUT_MS = 8000;

export function useDeviceAirport(onFound: (airport: AirportOption, how: "automatic" | "requested") => void) {
  const [status, setStatus] = useState<DeviceAirportStatus>("unsupported");
  const foundRef = useRef(onFound);
  useEffect(() => {
    foundRef.current = onFound;
  });
  const busyRef = useRef(false);

  const locate = useCallback((how: "automatic" | "requested") => {
    if (busyRef.current || typeof navigator === "undefined" || !navigator.geolocation) return;
    busyRef.current = true;
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void suggestAirportNear(position.coords.latitude, position.coords.longitude)
          .then((suggestion) => {
            if (suggestion) {
              foundRef.current(suggestion.airport, how);
              setStatus("found");
            } else {
              setStatus("none-nearby");
            }
          })
          .catch(() => setStatus("unavailable"))
          .finally(() => {
            busyRef.current = false;
          });
      },
      (error) => {
        busyRef.current = false;
        if (error.code === error.PERMISSION_DENIED) {
          setStatus("denied");
        } else if (error.code === error.TIMEOUT) {
          setStatus("timeout");
        } else {
          setStatus("unavailable");
        }
      },
      // Approximate is enough to pick an airport: no high-accuracy mode (battery, longer wait), and a position up to 10 minutes old is fine.
      { enableHighAccuracy: false, timeout: TIMEOUT_MS, maximumAge: 10 * 60_000 },
    );
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return; // stays "unsupported"
    // The first render (server and client) is always "unsupported", so what the server sent and what the browser first draws agree; this
    // moves on to the real state straight after, from a timer callback rather than inside the effect body.
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      setStatus("idle");
      // Permission already granted to this site: use it without asking anything. "prompt" and "denied" do nothing here.
      navigator.permissions
        ?.query({ name: "geolocation" as PermissionName })
        .then((result) => {
          if (cancelled) return;
          if (result.state === "granted") locate("automatic");
          else if (result.state === "denied") setStatus("denied");
        })
        .catch(() => {
          /* Permissions API unavailable or refused the query: nothing happens until the visitor clicks */
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [locate]);

  return { status, request: () => locate("requested") };
}
