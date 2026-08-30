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
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  title: `${SITE_NAME} | Business-Class Flights & Premium Travel Agency`,
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
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
