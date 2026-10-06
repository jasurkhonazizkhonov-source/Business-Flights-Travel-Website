import type { Metadata } from "next";
import { Hero } from "@/components/home/Hero";
import { TrustSection } from "@/components/sections/TrustSection";
import { BusinessClassHighlights } from "@/components/sections/BusinessClassHighlights";
import { DestinationsPreview } from "@/components/sections/DestinationsPreview";
import { PopularRegions } from "@/components/sections/PopularRegions";
import { HomeSeoSection } from "@/components/sections/HomeSeoSection";
import { Testimonials } from "@/components/sections/Testimonials";
import { BlogPreview } from "@/components/sections/BlogPreview";
import { HomeFAQ } from "@/components/sections/HomeFAQ";
import { NewsletterSection } from "@/components/sections/NewsletterSection";
import { CTASection } from "@/components/sections/CTASection";
import { SITE_NAME } from "@/lib/constants";

// The hero's flight request form posts its Server Action to this page; see
// the same setting (and why) in src/app/flights/page.tsx.
export const maxDuration = 30;

// Under ~65 characters (longer titles are cut off in search results) and
// ~155 characters of description; SITE_DESCRIPTION, which the structured data
// and footer use, is longer than a snippet shows.
const HOME_TITLE = `Business-Class & International Flights | ${SITE_NAME}`;
const HOME_DESCRIPTION =
  "Premium business-class and international flights, arranged personally by a dedicated travel specialist. Request a round-trip, one-way, or multi-city quote.";

export const metadata: Metadata = {
  title: { absolute: HOME_TITLE },
  description: HOME_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    url: "/",
    siteName: SITE_NAME,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: `${SITE_NAME} — Business-class and international flights, arranged personally` }],
  },
  twitter: {
    card: "summary_large_image",
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    images: [{ url: "/twitter-image", width: 1200, height: 630, alt: `${SITE_NAME} — Business-class and international flights, arranged personally` }],
  },
};

// Homepage sections are each unique to this page — the deeper explanations
// (how a request actually becomes a quote, full cabin-by-cabin detail, the
// complete destination catalog) live on /how-it-works, /business-class, and
// /destinations respectively, and aren't repeated here.
export default function HomePage() {
  return (
    <>
      <Hero />
      <TrustSection />
      <DestinationsPreview />
      <BusinessClassHighlights />
      <PopularRegions />
      <HomeSeoSection />
      <Testimonials />
      <BlogPreview />
      <HomeFAQ />
      <NewsletterSection />
      <CTASection />
    </>
  );
}
