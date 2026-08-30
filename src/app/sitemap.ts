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
  const now = new Date();

  return [
    ...staticRoutes.map((r) => ({
      url: `${SITE_URL}${r.path}`,
      lastModified: now,
      changeFrequency: r.changeFrequency,
      priority: r.priority,
    })),
    ...destinations.map((d) => ({
      url: `${SITE_URL}${destinationPath(d)}`,
      lastModified: now,
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
