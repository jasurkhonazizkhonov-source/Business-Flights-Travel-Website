import type { Metadata } from "next";
import { Instrument_Sans, Playfair_Display } from "next/font/google";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { FloatingDealsButton } from "@/components/layout/FloatingDealsButton";
import { MotionProvider } from "@/components/MotionProvider";
import { Toaster } from "@/components/Toaster";
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

// Instrument Sans, not Inter — Inter is the de facto default of every
// AI-generated and template-built site, and reads as such. Instrument Sans
// has the same clean, highly-legible grotesque bones (safe for dense body
// copy, form labels, and data) but with slightly warmer curves that sit
// better next to Playfair Display's editorial serif than Inter's more
// clinical, UI-chrome character does.
const sans = Instrument_Sans({
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
  // A further, explicit "this site's name is X" signal alongside the
  // title/OG siteName/JSON-LD below — browsers use it for tab groups and
  // "install site" prompts, and it costs nothing to also give it to
  // crawlers. None of these signals can force a specific Google search
  // result presentation on their own, but consistently naming the brand
  // the same way everywhere gives Google the clearest possible signal for
  // what to call this business, versus the bare domain it falls back to
  // when no strong signal is present.
  applicationName: SITE_NAME,
  description: SITE_DESCRIPTION,
  keywords: [
    "business class flights",
    "business class flight tickets",
    "business class airfare",
    "business class flight deals",
    "discounted business class flights",
    "international business class flights",
    "international flights",
    "first class flights",
    "premium cabin flights",
    "long-haul business class",
    "corporate travel",
    "premium travel agency",
    "business class travel agency",
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

// A dedicated, genuinely square brand mark (src/app/brand-mark.png) for
// `logo` — Google's own guidance for how a business's logo can appear in
// the Knowledge Panel and other search surfaces asks for a square (1:1)
// image; the site's real wordmark is a wide ~2.68:1 lockup, which a search
// engine can't use the same way and may simply decline to show at all
// (falling back to a bare, unbranded domain in the result instead). This
// doesn't change the on-page logo anywhere — the header/footer still use
// the full wordmark (public/brand/logo-navy.png, logo-white.png).
const brandMarkUrl = `${SITE_URL}/brand-mark.png`;

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "TravelAgency",
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  logo: brandMarkUrl,
  image: brandMarkUrl,
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
  // Ties the site to the same named Organization above, rather than
  // leaving WebSite and Organization as two unconnected entities — another
  // small, legitimate signal for what "businessflights.travel" actually is.
  publisher: { "@type": "Organization", name: SITE_NAME, logo: brandMarkUrl },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // Computed server-side (this file has no "use client") and passed down as
  // a small, already-derived prop — see the comment on getNavMenuRegions
  // for why Header/DestinationsMegaMenu (both Client Components) must not
  // import the full destinations dataset directly.
  const navMenuRegions = getNavMenuRegions(5);

  return (
    <html lang="en" className={`${sans.variable} ${playfair.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-[var(--color-cream-50)]">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }} />
        <MotionProvider>
          <Header navMenuRegions={navMenuRegions} />
          <main className="flex-1">{children}</main>
          <Footer />
          <FloatingDealsButton />
        </MotionProvider>
        <Toaster />
      </body>
    </html>
  );
}
