import { ImageResponse } from "next/og";

// A dedicated, high-resolution, genuinely SQUARE brand mark — used only for
// the Organization structured-data `logo` field (see layout.tsx) and the
// web manifest icon, not for on-page display (the header/footer use the
// full wordmark, public/brand/logo-navy.png / logo-white.png).
//
// Why this exists as its own asset: Google's own Organization/logo
// guidance for how a brand mark can appear in the Knowledge Panel and
// other search surfaces recommends a square (1:1) image of at least
// 112x112px. The site's real wordmark is a wide ~2.68:1 lockup ("BUSINESS
// FLIGHTS TRAVEL" stacked across three lines) — pointing `logo` at that
// wide asset is very likely why the brand hasn't been picking up a
// polished logo treatment in search results (Google either can't use a
// non-square image well, or falls back to no logo at all, which is what
// makes a result look like a bare domain instead of a named business).
// This reuses the exact navy-square + white "B" + gold accent mark already
// established as the site's icon/favicon (src/app/icon.png,
// src/app/apple-icon.png) — same identity, just rendered at a size (512x512)
// suited to a Knowledge Panel rather than a browser tab.
export const size = { width: 512, height: 512 };
export const contentType = "image/png";
// A plain Route Handler (unlike the special icon.png/apple-icon.png/
// opengraph-image.tsx file conventions) is dynamic by default — this asset
// never changes per-request, so render it once at build time instead of
// regenerating the same PNG via Satori on every fetch.
export const dynamic = "force-static";

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0a1a30",
        }}
      >
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 18, display: "flex", backgroundColor: "#d29c4a" }} />
        <div
          style={{
            display: "flex",
            fontSize: 300,
            fontWeight: 700,
            color: "#ffffff",
            fontFamily: "sans-serif",
            letterSpacing: -6,
          }}
        >
          B
        </div>
      </div>
    ),
    { ...size },
  );
}
