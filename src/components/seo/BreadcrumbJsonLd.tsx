import { SITE_URL } from "@/lib/constants";
import { jsonLd } from "@/lib/json-ld";

// BreadcrumbList structured data for a top-level page (Home > page). The visible page content is unchanged; this only describes where the page sits, using the
// same shape the About page, the destination pages and the articles already use. `path` is the page's own canonical path.
export function BreadcrumbJsonLd({ name, path }: { name: string; path: string }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name, item: `${SITE_URL}${path}` },
    ],
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(data) }} />;
}
