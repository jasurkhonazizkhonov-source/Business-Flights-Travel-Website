import type { MetadataRoute } from "next";
import { destinations, destinationPath } from "@/data/destinations";
import { blogPosts } from "@/data/blog-posts";
import { SITE_URL } from "@/lib/constants";

const staticRoutes: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }> = [
  { path: "", priority: 1, changeFrequency: "weekly" },
  { path: "/flights", priority: 0.9, changeFrequency: "weekly" },
  { path: "/business-class", priority: 0.8, changeFrequency: "monthly" },
  { path: "/destinations", priority: 0.8, changeFrequency: "weekly" },
  { path: "/how-it-works", priority: 0.6, changeFrequency: "monthly" },
  { path: "/about", priority: 0.5, changeFrequency: "monthly" },
  { path: "/blog", priority: 0.7, changeFrequency: "weekly" },
  { path: "/contact", priority: 0.5, changeFrequency: "monthly" },
  { path: "/privacy-policy", priority: 0.2, changeFrequency: "yearly" },
  { path: "/cookie-policy", priority: 0.2, changeFrequency: "yearly" },
  { path: "/terms-of-service", priority: 0.2, changeFrequency: "yearly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  // `lastModified` is deliberately omitted for static routes and
  // destinations below, not set to "now" — this project has no genuine
  // per-page last-updated tracking for either (destinations.ts has no
  // timestamp field at all; static route content changes with ordinary
  // commits, not on a schedule this file can see). Stamping every one of
  // these 182 URLs (11 static + 171 destinations) with the current
  // request/build time on every single deploy — when the overwhelming
  // majority haven't actually changed — is exactly the anti-pattern
  // Google Search Central warns against: it teaches crawlers that this
  // sitemap's lastmod values aren't trustworthy, which can reduce how
  // much weight Google gives them for re-crawl prioritization. Blog posts
  // are the one case with a real, deliberately-maintained date (see
  // BlogPost.updatedAt in src/data/blog-posts.ts) - that's kept, since
  // it's an honest signal, not a generated one. `lastModified` is
  // optional on every MetadataRoute.Sitemap entry, so omitting it here
  // is valid Next.js/sitemap-spec output, not a workaround.
  return [
    ...staticRoutes.map((r) => ({
      url: `${SITE_URL}${r.path}`,
      changeFrequency: r.changeFrequency,
      priority: r.priority,
    })),
    ...destinations.map((d) => ({
      url: `${SITE_URL}${destinationPath(d)}`,
      changeFrequency: "monthly" as const,
      priority: d.featured ? 0.75 : 0.65,
    })),
    ...blogPosts.map((p) => ({
      url: `${SITE_URL}/blog/${p.slug}`,
      lastModified: new Date(p.updatedAt),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
