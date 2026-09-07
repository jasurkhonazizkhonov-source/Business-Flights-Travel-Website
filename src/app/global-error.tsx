"use client";

// Only fires if the ROOT layout itself throws (not a page/section under
// it — that's error.tsx) — genuinely rare, but required for complete
// coverage per Next's App Router error-boundary model. This file replaces
// the entire document, including <html>/<body>, so it can't assume
// globals.css or the site's fonts loaded successfully (the very thing
// that may have failed) — plain inline styles only, no Tailwind classes,
// no dependency on anything else in the app.
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app/global-error.tsx] Unhandled root layout error", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem 1.5rem",
          textAlign: "center",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          backgroundColor: "#fbf9f5",
          color: "#0a1a30",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: 0 }}>Business Flights Travel is temporarily unavailable</h1>
        <p style={{ marginTop: "0.75rem", maxWidth: 420, color: "rgba(10,26,48,0.7)", lineHeight: 1.5 }}>
          Something went wrong loading the site. Please try again, or call us directly at +1 415 777 7788.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: "1.5rem",
            minHeight: 48,
            padding: "0 1.75rem",
            borderRadius: 999,
            border: "none",
            backgroundColor: "#0a1a30",
            color: "#ffffff",
            fontSize: "0.95rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Try Again
        </button>
      </body>
    </html>
  );
}
