import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants";

export default function robots(): MetadataRoute.Robots {
  // Every form submission is a server action, so the only route handler is the
  // liveness probe (/api/health) — nothing a crawler needs; it also answers
  // with X-Robots-Tag: noindex.
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
