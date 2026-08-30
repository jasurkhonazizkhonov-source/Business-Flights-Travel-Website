import { ImageResponse } from "next/og";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/constants";

// Shared by src/app/opengraph-image.tsx and src/app/twitter-image.tsx —
// Next.js treats those as two separate route handlers, but there's no
// reason to keep two copies of the same generated artwork. Destination
// pages override this default with their real hero photo via
// `openGraph.images` in generateMetadata (see
// src/app/destinations/[region]/[country]/[city]/page.tsx).
export const OG_IMAGE_SIZE = { width: 1200, height: 630 };
export const OG_IMAGE_ALT = `${SITE_NAME} — ${SITE_TAGLINE}`;

export function renderBrandOgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0a1a30",
          backgroundImage: "linear-gradient(135deg, #0a1a30 0%, #0f2440 60%, #0a1a30 100%)",
          position: "relative",
        }}
      >
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 10, display: "flex", backgroundColor: "#d29c4a" }} />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 64,
            height: 64,
            borderRadius: 999,
            border: "2px solid #e3b876",
          }}
        >
          {/* A simple vector mark instead of an emoji glyph — emoji
              rendering ignores CSS color and varies by platform/crawler,
              which would put an off-brand colored icon in the social
              preview. */}
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{ transform: "rotate(45deg)" }}>
            <path
              d="M21 3 3 10.5l6.5 2.5m11.5-10L13.5 21l-2.5-6.5m10-11.5L9.5 13"
              stroke="#e3b876"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div style={{ marginTop: 36, fontSize: 60, fontWeight: 700, color: "#ffffff", letterSpacing: -1, display: "flex" }}>
          {SITE_NAME}
        </div>
        <div
          style={{ marginTop: 20, fontSize: 26, color: "#f5f1e8", opacity: 0.8, maxWidth: 860, textAlign: "center", display: "flex" }}
        >
          {SITE_TAGLINE}
        </div>
      </div>
    ),
    { ...OG_IMAGE_SIZE },
  );
}
