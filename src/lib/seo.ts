import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/constants";

type PageMetadataInput = {
  /** Page title WITHOUT the brand suffix — the root layout's title template appends " | Business Flights Travel". */
  title: string;
  description: string;
  /** Site-relative path, e.g. "/about" — used for the canonical and og:url (resolved against metadataBase). */
  path: string;
  type?: "website" | "article";
};

/**
 * One place that builds a page's search + sharing metadata, so title,
 * description, canonical, Open Graph and Twitter always agree. Without it each
 * page inherited the root layout's Open Graph block, which meant a shared link
 * to /flights or /about announced the HOMEPAGE title/description and og:url.
 * The share image is the site's branded card, served by the file-based
 * opengraph-image / twitter-image routes at the app root. It has to be named
 * explicitly: once a page sets its own `openGraph`, Next no longer inherits
 * the image from those root files (the page would share with no picture).
 */
const SHARE_IMAGE_ALT = `${SITE_NAME} — Business-class and international flights, arranged personally`;

export function pageMetadata({ title, description, path, type = "website" }: PageMetadataInput): Metadata {
  const fullTitle = `${title} | ${SITE_NAME}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type,
      title: fullTitle,
      description,
      url: path,
      siteName: SITE_NAME,
      images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: SHARE_IMAGE_ALT }],
    },
    twitter: { card: "summary_large_image", title: fullTitle, description, images: [{ url: "/twitter-image", width: 1200, height: 630, alt: SHARE_IMAGE_ALT }] },
  };
}
