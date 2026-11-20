import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants";

export default function robots(): MetadataRoute.Robots {
  // Every form submission is a server action, so the only route handler is the
  // liveness probe (/api/health) and the form-suggestion route (/api/visitor-hint)
  // - nothing a crawler needs; both answer with X-Robots-Tag: noindex.
  //
  // /cdn-cgi/ is Cloudflare's own namespace on this host (its email-address
  // obfuscation rewrites mailto links into /cdn-cgi/l/email-protection#..., and
  // Google then crawls the bare /cdn-cgi/l/email-protection, a 404 that Search
  // Console reports). It is not a page of this site and never has content to index.
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/cdn-cgi/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
