import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/constants";

// A standard web app manifest — not a PWA in any deeper sense, just the
// additional, legitimate "this site's name and icon are X" signal browsers
// (Chrome's "install site" prompt, Android's "add to home screen") and some
// crawlers read, alongside the <title>, OG siteName, and Organization/
// WebSite JSON-LD in layout.tsx. Reuses the same square brand mark those
// use for the same reason: square renders correctly wherever an icon is
// expected, unlike the wide wordmark.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#fbf9f5",
    theme_color: "#0a1a30",
    icons: [
      { src: "/icon.png", sizes: "128x128", type: "image/png" },
      // 192 + 512 are the pair Chrome/Android want for an installable site; this is the
      // 512 brand mark (see /brand-mark.png) scaled down, not a different design.
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
      { src: "/brand-mark.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
