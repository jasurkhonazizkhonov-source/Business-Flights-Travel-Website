import type { Metadata } from "next";
import { LegalLayout, LegalSection } from "@/components/legal/LegalLayout";
import { CONTACT_EMAIL, COMPANY_LEGAL_NAME, COMPANY_ADDRESS, SITE_NAME } from "@/lib/constants";

// The Governing Law and Limitation of Liability sections below are
// deliberately written without naming a specific state/country or court
// jurisdiction — see docs/LEGAL.md for why, and for attorney-review status.

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `The terms that govern your use of the ${SITE_NAME} website and flight request service.`,
  alternates: { canonical: "/terms-of-service" },
};

const LAST_UPDATED = "August 20, 2026";

export default function TermsOfServicePage() {
  return (
    <LegalLayout
      title="Terms of Service"
      lastUpdated={LAST_UPDATED}
      currentHref="/terms-of-service"
      intro={`These terms govern your use of the ${SITE_NAME} website and the flight request service it offers. By using this website, you agree to them.`}
    >
      <LegalSection heading="1. Acceptance of These Terms">
        <p>
          These Terms of Service (&quot;Terms&quot;) are a legal agreement between you and <strong>{COMPANY_LEGAL_NAME}</strong>{" "}
          (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;). By browsing this website or submitting a flight request or contact
          form, you agree to these Terms. If you do not agree, please do not use the Site.
        </p>
      </LegalSection>

      <LegalSection heading="2. What This Website Does">
        <p>
          {SITE_NAME} is a travel agency that helps customers find and book business-class, first-class, and international flights.
          This website lets you submit a flight request describing your desired trip; one of our travel specialists then reviews
          your request, searches for suitable options, and contacts you directly to present fares and assist with booking.
        </p>
        <p>
          Submitting a flight request through this website is <strong>not</strong> a booking, a reservation, or a guarantee of
          fare or availability. It is a request for assistance, which a travel specialist follows up on personally.
        </p>
      </LegalSection>

      <LegalSection heading="3. Flight Requests and Quotes">
        <ul>
          <li>Submitting the flight request form does not obligate you to book, and does not charge any payment method.</li>
          <li>
            Fares, availability, and schedules change frequently and are controlled by airlines, not by us. Any fare or option we
            present is subject to confirmation and may no longer be available by the time you respond.
          </li>
          <li>
            Any pricing shown on this website outside of a specific quote from a travel specialist — including &quot;starting
            from&quot; fares shown on destination pages — is an indicative estimate only, not a guaranteed price. See the disclaimer
            on those pages for details.
          </li>
          <li>
            We will clearly present the fare, fare rules, and relevant conditions before you are asked to commit to a booking or
            provide payment.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="4. Bookings, Payment, and Airline Rules">
        <p>
          Where you choose to proceed with a booking through {SITE_NAME}, the following applies:
        </p>
        <ul>
          <li>
            Bookings are subject to the fare rules, baggage policies, change and cancellation rules, and conditions of carriage set
            by the operating airline(s), which we will make available to you before you book.
          </li>
          <li>
            Airlines — not {SITE_NAME} — are responsible for operating your flight, and for schedule changes, delays,
            cancellations, and the standard of service on board.
          </li>
          <li>
            Payment methods, timing, and any applicable service fees will be clearly communicated by your travel specialist as part
            of the booking process.
          </li>
          <li>
            You are responsible for ensuring passenger names match travel documents exactly, and for holding valid passports, visas,
            and any other documentation required for your itinerary.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="5. Cancellations and Changes">
        <p>
          Cancellation and change policies depend entirely on the fare rules of the ticket you purchase — some business-class fares
          allow changes for a fee, others are non-refundable and non-changeable. Your travel specialist will explain the applicable
          rules for your specific fare before booking. Requests to cancel or change a booking should be directed to your assigned
          travel specialist as soon as possible, since many airline rules become more restrictive closer to departure.
        </p>
      </LegalSection>

      <LegalSection heading="6. Your Responsibilities">
        <p>When using this Site, you agree to:</p>
        <ul>
          <li>Provide accurate, current information in the flight request and contact forms</li>
          <li>Not use the Site to submit fraudulent, abusive, or spam requests</li>
          <li>Not attempt to interfere with the Site&apos;s normal operation, security, or availability</li>
          <li>Not use automated tools to scrape or systematically extract data from the Site</li>
        </ul>
      </LegalSection>

      <LegalSection heading="7. Third-Party Airlines and Providers">
        <p>
          {SITE_NAME} acts as an intermediary that helps you find and book flights operated by third-party airlines, and may work
          with other third-party travel suppliers. We are not the operating carrier for any flight booked through us, and we are
          not responsible for the acts, omissions, or service standards of any airline or third-party supplier, except to the
          extent required by applicable law.
        </p>
      </LegalSection>

      <LegalSection heading="8. Website Content and Intellectual Property">
        <p>
          The text, design, graphics, logos, and other content on this Site are owned by {SITE_NAME} or our licensors and are
          protected by copyright, trademark, and other intellectual property laws. You may view and print pages from the Site for
          your own personal, non-commercial use in connection with a genuine travel inquiry. You may not reproduce, republish,
          distribute, or create derivative works from Site content for any other purpose without our prior written permission.
        </p>
        <p>
          Destination guides, blog articles, and other informational content on this Site are provided for general informational
          purposes. While we aim for accuracy, details such as airport information, travel advice, or seasonal guidance may change
          and should be independently verified before you travel.
        </p>
      </LegalSection>

      <LegalSection heading="9. Disclaimers">
        <p>
          The Site and its content are provided &quot;as is&quot; without warranties of any kind, express or implied, except as
          required by applicable law. We do not warrant that the Site will be uninterrupted, error-free, or completely secure, or
          that any particular fare, route, or flight option will remain available.
        </p>
      </LegalSection>

      <LegalSection heading="10. Limitation of Liability">
        <p>
          To the fullest extent permitted by applicable law, {SITE_NAME} will not be liable for any indirect, incidental, special,
          or consequential damages arising from your use of the Site or our services, including — without limitation — losses
          arising from airline schedule changes, cancellations, denied boarding, lost baggage, or other events outside our direct
          control. Nothing in these Terms is intended to exclude or limit any liability that cannot lawfully be excluded or limited
          under the law that applies to you — where a mandatory consumer protection or other law gives you rights these Terms
          cannot override, this section does not attempt to override them.
        </p>
      </LegalSection>

      <LegalSection heading="11. Relationship to Our Privacy Policy">
        <p>
          Our collection and use of personal information in connection with the Site is described in our{" "}
          <a href="/privacy-policy">Privacy Policy</a> and <a href="/cookie-policy">Cookie Policy</a>, which are incorporated into
          these Terms by reference.
        </p>
      </LegalSection>

      <LegalSection heading="12. Changes to These Terms">
        <p>
          We may update these Terms from time to time to reflect changes to our Site or services, or for legal or regulatory
          reasons. When we do, we will revise the &quot;Last updated&quot; date at the top of this page. Continuing to use the Site
          after changes take effect constitutes acceptance of the updated Terms.
        </p>
      </LegalSection>

      <LegalSection heading="13. Governing Law">
        <p>
          These Terms are intended to be interpreted and enforced consistently with the mandatory laws and consumer protections
          that actually apply to you and to {SITE_NAME}&apos;s operations in the relevant circumstances. Nothing in these Terms is
          intended to displace a law or a court&apos;s jurisdiction that cannot lawfully be displaced by agreement. Where a specific
          governing-law or forum clause is legally required or useful, it will be added here rather than left unstated.
        </p>
      </LegalSection>

      <LegalSection heading="14. Contact Us">
        <p>
          Questions about these Terms can be directed to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> or to{" "}
          {COMPANY_LEGAL_NAME}, {COMPANY_ADDRESS}.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
