import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants";

export default function robots(): MetadataRoute.Robots {
  // No `disallow` needed: the site has no API routes to hide from crawlers
  // (every form submission is a server action, not a route handler) and no
  // other non-public paths.
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
