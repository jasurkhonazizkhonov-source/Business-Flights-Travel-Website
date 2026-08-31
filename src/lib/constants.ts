// Central brand + site constants. Keep this the single source of truth so
// copy and config don't drift between the nav, footer, and metadata.

export const SITE_NAME = "Business Flights Travel";
export const SITE_TAGLINE = "Premium Business-Class Flights & Personalized Travel Assistance";
// Static — not read from an environment variable. Canonical URLs, the
// sitemap, Open Graph tags, and structured data all derive from this, so
// keep it as the one place that changes if the production domain ever does.
export const SITE_URL = "https://www.businessflights.travel";
export const SITE_DESCRIPTION =
  "Business Flights Travel is a premium travel agency specializing in business-class, first-class, and international flights, with dedicated travel specialists handling every request personally.";

// The CRM's Company row this website's leads/inquiries/subscribers are
// written against is resolved dynamically at runtime, NOT hard-coded here —
// see src/server/crm-company.ts for why (the CRM auto-generates a random
// cuid per database, so any literal id here would only work against one
// specific database and break database portability).

export const CONTACT_PHONE_DISPLAY = "+1 415 777 7788";
export const CONTACT_PHONE_E164 = "+14157777788";
export const CONTACT_EMAIL = "requests@businessflights.travel";

// Official Business Flights Travel Trustpilot review page. Do not fabricate
// a rating or review count anywhere on the site — this is a link only.
export const TRUSTPILOT_URL = "https://www.trustpilot.com/review/businessflights.travel";

// Legal identity used on the Privacy Policy / Terms of Service / Cookie
// Policy pages (see docs/LEGAL.md for what's still pending attorney review).
export const COMPANY_LEGAL_NAME = "Business Flights Travel";
export const COMPANY_ADDRESS = "580 California Street, San Francisco, CA 94104";

// Structured form of COMPANY_ADDRESS for schema.org PostalAddress markup
// (see the Organization JSON-LD in src/app/layout.tsx) — kept alongside the
// display string above so the two can never drift out of sync.
export const COMPANY_ADDRESS_PARTS = {
  streetAddress: "580 California Street",
  addressLocality: "San Francisco",
  addressRegion: "CA",
  postalCode: "94104",
  addressCountry: "US",
} as const;

export const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "Flights", href: "/flights" },
  { label: "Business Class", href: "/business-class" },
  { label: "Destinations", href: "/destinations" },
  { label: "How It Works", href: "/how-it-works" },
  { label: "About Us", href: "/about" },
  { label: "Blog", href: "/blog" },
  { label: "Contact", href: "/contact" },
] as const;

export const PRIMARY_CTA_LABEL = "Get a Free Flight Quote";

/**
 * Official Business Flights Travel social accounts, for the footer.
 * Intentionally empty — this project has not been given real account URLs,
 * and footer icons must never point to a competitor's or anyone else's
 * social profiles. Add entries here (each `{ label, href, Icon }`) once
 * real accounts exist; the footer already renders whatever is in this
 * array and simply shows nothing while it's empty.
 */
export const SOCIAL_LINKS: { label: string; href: string }[] = [];

/**
 * Industry accreditation/membership badges (IATA, ARC, BBB, etc.) for the
 * footer trust section. Intentionally empty — none of these have been
 * confirmed as real, current accreditations for Business Flights Travel,
 * and displaying them without one would misrepresent the company. Add an
 * entry here (`{ label, description }`, plus wire in the real badge
 * artwork in TrustBadges.tsx) only once a specific accreditation is
 * actually confirmed; the footer renders nothing while this stays empty,
 * the same pattern SOCIAL_LINKS above uses.
 */
export const TRUST_BADGES: { label: string; description: string }[] = [];
