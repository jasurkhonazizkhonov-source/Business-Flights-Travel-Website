import Link from "next/link";
import { PRIMARY_CTA_LABEL, SITE_NAME } from "@/lib/constants";

// The short notice under the flight-request button. It is deliberately NOT a checkbox: the visitor agrees by pressing the button,
// which is why the button's own label is quoted from PRIMARY_CTA_LABEL (the text must name the control that is actually pressed).
//
// Two facts that matter to anyone changing this text:
//  - It states a policy of contact, it does not record one. Nothing on this site stores that the notice was shown or when
//    (the CRM API has no consent field), so the Privacy Policy section "Communicating With You" (src/app/privacy-policy/page.tsx)
//    and this text must be kept in step by hand, and the wording needs review by a qualified attorney (docs/LEGAL.md).
//  - The notice deliberately says nothing about text-message (SMS) marketing, promotional offers, "deals" or offers by phone/text, and
//    makes no statement about consent to marketing messages: the site has no such functionality and records no such consent. Do not
//    add that wording back without a legal review and the matching functionality (docs/LEGAL.md, item 4).
//
// The link goes to this website's own Privacy Policy page (route /privacy-policy), never to another company's.
export const QUOTE_CONSENT_PRIVACY_HREF = "/privacy-policy";

export function QuoteConsentNotice() {
  return (
    <p data-testid="quote-consent-notice" className="mt-2 text-center text-xs leading-relaxed text-[var(--color-navy-950)]/70">
      By providing your contact details and clicking &ldquo;{PRIMARY_CTA_LABEL}&rdquo;, you agree to be contacted by {SITE_NAME}{" "}
      regarding your request. We respect your{" "}
      <Link
        href={QUOTE_CONSENT_PRIVACY_HREF}
        className="font-medium text-[var(--color-navy-800)] underline decoration-[var(--color-navy-950)]/30 underline-offset-2 hover:text-[var(--color-gold-600)]"
      >
        privacy
      </Link>
      .
    </p>
  );
}
