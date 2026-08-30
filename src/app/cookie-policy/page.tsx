import type { Metadata } from "next";
import { LegalLayout, LegalSection } from "@/components/legal/LegalLayout";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/constants";

// The "what this site actually sets" section below should be re-verified
// against real cookie/storage usage at each future deploy — see docs/LEGAL.md.
// As of this writing the site sets no cookies at all, and there is no
// analytics or cookie-consent infrastructure in the codebase — nothing to
// enable via an environment variable. If analytics is ever added, build the
// consent-gating alongside it and update this policy in the same change.

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: `How ${SITE_NAME} uses cookies and similar technologies on this website, and how to control them.`,
  alternates: { canonical: "/cookie-policy" },
};

const LAST_UPDATED = "August 20, 2026";

export default function CookiePolicyPage() {
  return (
    <LegalLayout
      title="Cookie Policy"
      lastUpdated={LAST_UPDATED}
      currentHref="/cookie-policy"
      intro="This policy explains what cookies and similar technologies are, which ones this website uses, and how you can control them."
    >
      <LegalSection heading="1. What Cookies Are">
        <p>
          A cookie is a small text file that a website stores on your device when you visit it. Cookies let a site remember
          information about your visit — such as your preferences, or that you&apos;ve interacted with a particular part of the
          page — so it can work correctly and, where relevant, provide a more useful experience the next time you visit. &quot;Similar
          technologies&quot; refers to other mechanisms that serve a comparable purpose, such as local storage in your browser.
        </p>
      </LegalSection>

      <LegalSection heading="2. What This Site Currently Uses">
        <p>
          As of the &quot;Last updated&quot; date above, {SITE_NAME} does <strong>not</strong> set any cookies of its own. The
          flight request form, contact form, and newsletter signup all work through standard page requests handled entirely on our
          server — none of them rely on a cookie or browser storage to function, so there is nothing essential to disclose beyond
          what your browser and our hosting provider do automatically to deliver the page to you.
        </p>
        <h3>Analytics cookies (only if and when enabled)</h3>
        <p>
          We may in the future enable a privacy-conscious analytics tool to understand which pages are useful to visitors — in
          aggregate, not to build individual profiles. If we do, a cookie-consent banner will appear on your first visit and no
          analytics cookie will be set until you accept it. Declining does not affect your ability to use the flight request form
          or any other part of the Site.
        </p>
        <h3>Marketing cookies</h3>
        <p>
          We do not use third-party advertising or retargeting cookies on this Site, and have no current plans to. If that ever
          changes, this policy will be updated first, and consent will be requested before any such cookies are set.
        </p>
      </LegalSection>

      <LegalSection heading="3. Third-Party Cookies">
        <p>
          The Site does not currently embed any third-party service that sets its own cookies. If we begin using one — for
          instance, an analytics provider — this policy will be updated to name that service before it goes live, and any cookies
          it sets will be governed by that provider&apos;s own privacy and cookie policies in addition to this one.
        </p>
      </LegalSection>

      <LegalSection heading="4. How to Control Cookies">
        <p>You can control or disable cookies in several ways:</p>
        <ul>
          <li>
            <strong>Browser settings:</strong> Most browsers let you block or delete cookies through their settings menu.
            Instructions vary by browser — check your browser&apos;s help documentation for details.
          </li>
          <li>
            <strong>The consent banner:</strong> If and when we enable analytics, you will be able to decline it from the banner
            itself, without losing access to any part of the Site, including the flight request form.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="5. Changes to This Cookie Policy">
        <p>
          We may update this Cookie Policy as the Site evolves — for example, if we add a new analytics tool or feature that uses
          cookies. When we do, we will revise the &quot;Last updated&quot; date at the top of this page. We encourage you to review
          this page periodically.
        </p>
      </LegalSection>

      <LegalSection heading="6. Contact Us">
        <p>
          If you have questions about this Cookie Policy, contact us at{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. For more on how we handle personal information generally, see our{" "}
          <a href="/privacy-policy">Privacy Policy</a>.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
