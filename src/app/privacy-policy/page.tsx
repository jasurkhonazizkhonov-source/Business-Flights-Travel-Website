import type { Metadata } from "next";
import { LegalLayout, LegalSection } from "@/components/legal/LegalLayout";
import { CONTACT_EMAIL, CONTACT_PHONE_DISPLAY, COMPANY_LEGAL_NAME, COMPANY_ADDRESS, SITE_NAME } from "@/lib/constants";

// Drafted to match what the site actually does (flight request form,
// contact form, newsletter signup, CRM integration) — see docs/LEGAL.md
// for attorney-review status and what's intentionally written in general
// terms rather than left unstated.

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${SITE_NAME} collects, uses, and protects information submitted through our website and flight request forms.`,
  alternates: { canonical: "/privacy-policy" },
};

const LAST_UPDATED = "August 20, 2026";

export default function PrivacyPolicyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      lastUpdated={LAST_UPDATED}
      currentHref="/privacy-policy"
      intro={`This policy explains what information ${SITE_NAME} collects when you use this website — including when you submit a flight request or contact form — and how that information is used, stored, and protected.`}
    >
      <LegalSection heading="1. Who This Policy Covers">
        <p>
          This Privacy Policy applies to <strong>{SITE_NAME}</strong> (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) and to
          this website. It describes our practices for the personal information we collect through businessflights.travel (the
          &quot;Site&quot;), including our flight request form, contact form, and general browsing activity.
        </p>
        <p>
          {COMPANY_LEGAL_NAME} is headquartered at {COMPANY_ADDRESS}. If you have questions about this policy or how your
          information is handled, see the <strong>Contact Us</strong> section below.
        </p>
      </LegalSection>

      <LegalSection heading="2. Information We Collect">
        <h3>Information you provide directly</h3>
        <p>When you submit a flight request or contact form, we collect the information you enter, which may include:</p>
        <ul>
          <li>Your first and last name</li>
          <li>Email address and phone number (including the country associated with your phone number)</li>
          <li>Trip details — origin and destination, travel dates, trip type, cabin class, and number of travelers</li>
          <li>Optional details you choose to share, such as a preferred airline, an approximate budget, or notes about your request</li>
          <li>Any message you send us through the contact form</li>
        </ul>
        <p>
          If you subscribe to our newsletter, we collect only the email address you provide, along with the date you subscribed.
        </p>
        <h3>Information collected automatically</h3>
        <p>
          Like most websites, we automatically collect some technical information when you visit — for example, your IP address,
          browser and device type, general location inferred from your IP address, the pages you view, and how you arrived at the
          Site. See our <a href="/cookie-policy">Cookie Policy</a> for details on how this is collected and how you can control it.
        </p>
      </LegalSection>

      <LegalSection heading="3. How We Use Your Information">
        <p>We use the information described above to:</p>
        <ul>
          <li>Respond to your flight request and search for suitable business-class, first-class, or international fare options</li>
          <li>Contact you by phone, email, or the details you provided, to discuss your trip and present options</li>
          <li>Create and maintain a record of your request so a travel specialist can follow up and assist you through booking</li>
          <li>Send periodic fare deals, destination guides, and travel updates to the email address you provide if you subscribe to our newsletter</li>
          <li>Improve the Site, our forms, and the overall experience of requesting a quote</li>
          <li>Detect and prevent spam, abuse, or fraudulent submissions</li>
          <li>Meet legal, accounting, or regulatory obligations where applicable</li>
        </ul>
        <p>We do not sell your personal information, and we do not use your flight request details for unrelated marketing by third parties.</p>
      </LegalSection>

      <LegalSection heading="4. How Your Information Is Stored and Processed (Our CRM)">
        <p>
          When you submit the flight request or contact form, your details are stored in our internal customer relationship
          management (CRM) system. This is the same system our travel specialists use to track every customer request from initial
          submission through to booking, so that:
        </p>
        <ul>
          <li>Your request is visible to an available travel specialist promptly after you submit it</li>
          <li>Your specialist has the context of your trip and prior contact history if you reach out again</li>
          <li>We can maintain an accurate record of quotes, communications, and (where applicable) bookings associated with your request</li>
        </ul>
        <p>
          Access to the CRM is limited to {SITE_NAME} personnel who need it to do their jobs — travel specialists, ticketing staff,
          and management. We do not use your CRM record for purposes unrelated to servicing your travel request without a separate,
          clearly stated basis for doing so.
        </p>
      </LegalSection>

      <LegalSection heading="5. Communicating With You">
        <p>
          By submitting a flight request or contact form, you agree that a travel specialist may contact you by phone, email, or
          text message about your request, using the contact details you provided. This is how we deliver flight options and
          coordinate booking — it is a core part of the service, not a marketing opt-in.
        </p>
        <p>
          If you subscribe to our newsletter, that is a separate, opt-in mailing list for fare deals and travel updates — every
          email includes an unsubscribe link, and unsubscribing only affects the newsletter, not communications about an active
          flight request or booking.
        </p>
      </LegalSection>

      <LegalSection heading="6. Service Providers and Third Parties">
        <p>We work with a limited number of service providers to operate the Site and deliver our service, which may include:</p>
        <ul>
          <li>Hosting and infrastructure providers that run the Site and our database</li>
          <li>Communication tools we use to call, email, or message you about your request</li>
          <li>Analytics providers that help us understand how the Site is used (see our <a href="/cookie-policy">Cookie Policy</a>)</li>
        </ul>
        <p>
          These providers only receive the information necessary to perform their function for us, and are expected to protect it
          accordingly. We do not permit them to use your information for their own independent purposes.
        </p>
        <p>
          Separately, if you proceed with booking a flight, airlines and other travel suppliers will necessarily receive the
          passenger and payment information required to issue and honor your ticket. Their own privacy practices apply to
          information they hold directly — please review the relevant airline&apos;s privacy policy for details.
        </p>
      </LegalSection>

      <LegalSection heading="7. Data Security">
        <p>
          We use reasonable administrative, technical, and organizational safeguards designed to protect the information you
          provide — including restricting database access to authorized personnel and transmitting data over encrypted
          connections. No method of transmission or storage is completely secure, however, and we cannot guarantee absolute
          security.
        </p>
      </LegalSection>

      <LegalSection heading="8. Cookies and Similar Technologies">
        <p>
          We use cookies and similar technologies for essential site functionality and, where enabled, for analytics. Full details
          — including the specific categories of cookies we use and how to control them — are in our{" "}
          <a href="/cookie-policy">Cookie Policy</a>.
        </p>
      </LegalSection>

      <LegalSection heading="9. Data Retention">
        <p>
          We keep flight request and contact information only for as long as reasonably necessary to respond to your request,
          provide ongoing service if you book with us, maintain appropriate business records, meet legal or accounting obligations,
          and resolve or defend against any disputes. How long that takes varies by the type of record — an active request
          naturally stays on file longer than one that never proceeded, and records tied to a completed booking are generally kept
          longer to support post-trip service and our accounting obligations. Once information is no longer needed for these
          purposes, we delete it or anonymize it, subject to any legitimate legal or business reason to keep it longer. Newsletter
          subscriber email addresses are kept for as long as you remain subscribed, and removed after you unsubscribe.
        </p>
      </LegalSection>

      <LegalSection heading="10. Your Rights">
        <p>
          Depending on where you live, you may have rights regarding your personal information, which can include the right to
          request access to, correction of, or deletion of the information we hold about you, to object to or restrict certain
          processing, and to request a copy of your information in a portable format. To exercise any of these rights, contact us
          using the details below — we will respond within a reasonable time and in accordance with applicable law.
        </p>
      </LegalSection>

      <LegalSection heading="11. International Data Transfers">
        <p>
          {SITE_NAME} serves customers internationally, and the service providers described in{" "}
          <strong>Service Providers and Third Parties</strong> above may process information in a country other than the one you
          are traveling from or accessing the Site in. Where information is transferred across borders in this way, we take steps
          intended to ensure it continues to receive an appropriate level of protection, consistent with applicable data protection
          law, regardless of where it is processed.
        </p>
      </LegalSection>

      <LegalSection heading="12. Children's Privacy">
        <p>
          This Site is intended for adults arranging travel and is not directed to children. We do not knowingly collect personal
          information directly from children under 16. Passenger information for a minor traveling as part of a booking is provided
          to us by the adult making the booking, not by the child, and is used solely for the purpose of arranging that travel.
        </p>
      </LegalSection>

      <LegalSection heading="13. Changes to This Policy">
        <p>
          We may update this Privacy Policy from time to time to reflect changes in our practices, our Site, or applicable law.
          When we do, we will revise the &quot;Last updated&quot; date at the top of this page. If changes are significant, we may
          provide additional notice. We encourage you to review this page periodically.
        </p>
      </LegalSection>

      <LegalSection heading="14. Contact Us">
        <p>If you have questions about this Privacy Policy or how your information is handled, contact us:</p>
        <ul>
          <li>
            Email: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </li>
          <li>Phone: {CONTACT_PHONE_DISPLAY}</li>
          <li>Mail: {COMPANY_LEGAL_NAME}, {COMPANY_ADDRESS}</li>
        </ul>
      </LegalSection>
    </LegalLayout>
  );
}
