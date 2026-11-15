# Legal pages — status and required follow-up

The three legal pages (`/privacy-policy`, `/cookie-policy`, `/terms-of-service`)
are drafted content, not finished legal documents. They were written to be
structurally complete and consistent with what the site actually does today
(the flight request form, the CRM integration described in
`docs/CRM_API_INTEGRATION.md`, the cookies the site actually sets), but **no
attorney has reviewed them**, and they must not be published to real
customers until one has.

## Resolved

- Legal entity name and registered address are set (`COMPANY_LEGAL_NAME`,
  `COMPANY_ADDRESS` in `src/lib/constants.ts`) and used throughout all three
  pages — no bracketed placeholders remain in the customer-facing text.
- Data retention, international transfers, and third-party cookies are now
  described in accurate general terms (no specific retention period,
  hosting jurisdiction, or named analytics tool is claimed, because none of
  those are confirmed/in use) rather than left as `[bracketed placeholders]`.

## Still open — before this goes live

1. **Have a qualified attorney (in the jurisdiction the company actually
   operates from) review all three pages.** Travel agency terms in
   particular carry real liability questions (fare disclaimers, airline
   relationship, cancellation handling) that deserve real legal judgment,
   not a template.
2. **Governing law / jurisdiction (Terms of Service, §13, and the
   Limitation of Liability clause in §10).** These were deliberately
   written without naming a specific state/country or court, because this
   project has never been told where the company is incorporated or where
   it wants disputes heard. An invented governing-law clause is worse than
   none — have counsel add the real one.
3. **Re-check the Cookie Policy whenever a new analytics/marketing tool is
   added.** It currently states the Site uses no non-essential third-party
   cookies. If that changes, update the policy in the same change that
   adds the tool — don't let it drift out of sync with reality.
4. **Marketing contact by text message (SMS), promotional offers and offers
   by phone/text — deliberately NOT stated (removed 2026-11-08, pending legal
   review).** The notice under the flight-request button
   (`QuoteConsentNotice.tsx`), Privacy Policy and Terms of Service make no
   claim about text-message marketing, promotional offers, "deals" or
   offers by phone/text, and no claim about consent to marketing messages.
   The site has no such functionality: no SMS provider or autodialer, no
   consent checkbox, and no consent field in the CRM API, so nothing records
   that a notice was shown or accepted. The only contact wording is that a
   travel specialist may contact the visitor about their own request (Privacy
   Policy §5, unchanged from before). Do not add marketing-contact or
   consent wording back until counsel has reviewed it **and** the matching
   functionality exists (recorded consent, message frequency/rates and STOP
   instructions; autodialed or prerecorded calls and texts need prior express
   *written* consent under the TCPA; some states add their own rules;
   do-not-call rules apply to calls).
5. **Company contact details (changed 2026-11-08).** Address 350 Sansome St,
   San Francisco, CA 94104; phone +1 415 570 9267; email
   info@businessflights.travel — all from `src/lib/constants.ts`.
6. **If a dedicated privacy-specific contact address is ever set up**
   (separate from the general `info@businessflights.travel`), add it to
   the Privacy Policy's Contact Us section.

Nothing in these pages should be read as legal advice, and nothing here
should be assumed compliant with GDPR, CCPA, or any other specific regime
without that attorney review — the structure follows common practice for a
consumer-facing travel business, but the accuracy of the specific claims
(rights described, retention practices, etc.) for any given jurisdiction has
not been verified.
