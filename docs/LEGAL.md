# Legal pages — status and required follow-up

The three legal pages (`/privacy-policy`, `/cookie-policy`, `/terms-of-service`)
are drafted content, not finished legal documents. They were written to be
structurally complete and consistent with what the site actually does today
(the flight request form, the CRM integration described in
`prisma/schema.prisma`, the cookies the site actually sets), but **no
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
4. **If a dedicated privacy-specific contact address is ever set up**
   (separate from the general `requests@businessflights.travel`), add it to
   the Privacy Policy's Contact Us section.

Nothing in these pages should be read as legal advice, and nothing here
should be assumed compliant with GDPR, CCPA, or any other specific regime
without that attorney review — the structure follows common practice for a
consumer-facing travel business, but the accuracy of the specific claims
(rights described, retention practices, etc.) for any given jurisdiction has
not been verified.
