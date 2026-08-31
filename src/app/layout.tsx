import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { FloatingDealsButton } from "@/components/layout/FloatingDealsButton";
import { MotionProvider } from "@/components/MotionProvider";
import { getNavMenuRegions } from "@/data/destinations";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
  CONTACT_PHONE_E164,
  COMPANY_ADDRESS_PARTS,
  SOCIAL_LINKS,
} from "@/lib/constants";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const playfair = Playfair_Display({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} | Premium Business-Class Flights & Travel Assistance`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "business class flights",
    "business class flight tickets",
    "business class airfare",
    "international business class flights",
    "premium travel agency",
    "corporate travel",
    "first class flights",
  ],
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} | Premium Business-Class Flights & Travel Assistance`,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} | Premium Business-Class Flights & Travel Assistance`,
    description: SITE_DESCRIPTION,
  },
  alternates: {
    canonical: "/",
  },
  // No Google Search Console verification configured — add a `verification:
  // { google: "..." }` field here if/when the domain is verified.
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "TravelAgency",
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  logo: `${SITE_URL}/brand/logo-navy.png`,
  telephone: CONTACT_PHONE_E164,
  address: {
    "@type": "PostalAddress",
    ...COMPANY_ADDRESS_PARTS,
  },
  // Only real, verified Business Flights Travel profiles belong here (see
  // SOCIAL_LINKS in lib/constants.ts) — omitted entirely while that list is
  // empty rather than emitting an empty array.
  ...(SOCIAL_LINKS.length > 0 ? { sameAs: SOCIAL_LINKS.map((s) => s.href) } : {}),
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_URL,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // Computed server-side (this file has no "use client") and passed down as
  // a small, already-derived prop — see the comment on getNavMenuRegions
  // for why Header/DestinationsMegaMenu (both Client Components) must not
  // import the full destinations dataset directly.
  const navMenuRegions = getNavMenuRegions(5);

  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-[var(--color-cream-50)]">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }} />
        <MotionProvider>
          <Header navMenuRegions={navMenuRegions} />
          <main className="flex-1">{children}</main>
          <Footer />
          <FloatingDealsButton />
        </MotionProvider>
      </body>
    </html>
  );
}
