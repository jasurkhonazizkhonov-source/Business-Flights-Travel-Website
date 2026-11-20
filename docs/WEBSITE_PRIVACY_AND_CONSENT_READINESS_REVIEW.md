# Website privacy and consent readiness review

Date: 2026-11-15. This is a technical comparison of what the site says with what the code does. It is **not legal advice and not a legal review**. No attorney review is on record (`docs/LEGAL.md`: "no attorney has reviewed them"). Nothing below should be read as a statement that the pages are compliant with any law.

## Result: BLOCKED for legal readiness (technical accuracy: improved in this pass, still limited)

## 1. What the code actually does with visitor information

| Form | Information sent to the CRM | IP / approximate location | Notes |
|---|---|---|---|
| Flight request | name, email, phone (E.164), trip details, optional airline, budget, notes | signed IP and approximate location (city, region, country, time zone) when `LEAD_INGEST_SECRET` is set; Cloudflare coordinates appear only in the internal notification **email** | Also sends an internal notification by Gmail SMTP |
| Contact message | name, email, phone, subject, message, a `submissionId` | **new**: the same signed IP and approximate location (no coordinates) when `LEAD_INGEST_SECRET` is set | CRM staff notification is the CRM's own |
| Newsletter | email address (and the date) | not sent | A filled honeypot is discarded silently |

IP and location are never taken from a form field or a browser header the visitor controls; they come from Cloudflare's headers when `TRUSTED_PROXY=cloudflare`. When unavailable nothing is recorded in their place. The website stores nothing itself (no database).

## 2. Findings on the Privacy Policy (`src/app/privacy-policy/page.tsx`)

| # | Finding | Status |
|---|---|---|
| 1 | The "Information collected automatically" section described IP and approximate-location capture for **flight requests only**. The contact form now collects the same (code change of 2026-11-13). | **Corrected in this pass** with a minimal factual addition: a sentence that the contact form likewise records the IP address and the approximate location (city, region, country, time zone, no coordinates), sends them to the CRM with the message and that authorised staff can see them. No retention period, processor, purpose or consent claim was added. |
| 2 | The same paragraph said the information is "included in the internal notification email", which is true for flight requests only. | Kept as is; the new sentence deliberately does not repeat it for the contact form. |
| 3 | The statement is true only when `LEAD_INGEST_SECRET` is set. If it is not set, nothing is recorded (the policy then over-states). | Open: configuration and policy must be kept in step (documented in the environment audit). |
| 4 | Section 5 says "By submitting a flight request or contact form, you agree that a travel specialist may contact you by phone, email, or text message about your request". | Unchanged. It states a contact policy; **nothing records that the notice was shown or accepted** (the CRM API has no consent field). |
| 5 | The contact page and the contact form show **no privacy link or notice at all** (the newsletter form and the flight form do). | **Open, needs your decision**: adding a notice under the contact button was not done without approval (the instructions allow no new checkbox and no invented wording). |
| 6 | Retention (section 9), international transfers (section 11) and Cloudflare as a provider are described in general terms only. | Open for counsel; no period or processor was invented. |

The Cookie Policy states no non-essential third-party cookies; the code sets none and no analytics tool exists (`docs/ENVIRONMENT.md`). Re-check it whenever one is added.

## 3. The quote-button disclaimer (flight form)

* Present today, **below the button, no checkbox** (`src/components/flight-form/QuoteConsentNotice.tsx`, used in `FlightRequestForm.tsx`), as you prefer. Text now: "By providing your contact details and clicking "Get a Free Flight Quote", you agree to be contacted by Business Flights Travel regarding your request. We respect your privacy." The word "privacy" links to this site's own `/privacy-policy`. The quoted button name comes from `PRIMARY_CTA_LABEL`, so it always names the control that is really pressed.
* **The proposed text was not published.** (It also names a button "Get My Free Quote"; the real button is "Get a Free Flight Quote", so the name would have to change too.) It says "No Spam — only phone-exclusive deals", agrees to be contacted "via phone and text messages and by email" and says consent "is not a condition of purchase". It describes promotional contact by phone and text. The site has no SMS provider, no autodialer, no recorded consent and no consent field in the CRM; `docs/LEGAL.md` item 4 records that this wording was removed on 2026-11-08 pending legal review, with the reason (calls and texts made with automated technology can require prior express **written** consent under the TCPA, some states add rules, and message frequency, rates and STOP instructions would be needed). Publishing it now would claim practices the site does not have.
* **The proposed Privacy Policy link, `[another company's privacy page, named in the proposed text]`, is another company's domain** (the guard test `tests/contact-details-and-consent.spec.ts` rejects "that company" in the site). It must not be linked from this site; the site's own policy is `/privacy-policy`. If a policy hosted elsewhere is really meant, that needs your explicit confirmation.
* What is needed before the proposed text can be used: counsel to approve the exact wording for the actual communication practices; the matching functionality (recorded consent and the opt-out mechanics, if text or automated calls are really used); the correct policy URL. The design (notice under the button, no checkbox) is preserved and can take the approved text as a one-line change.

## 4. Other disclosures reviewed

* Terms of Service: contains the governing-law gap recorded in `docs/LEGAL.md` item 2 (deliberately not invented). Unchanged.
* Newsletter: states the opt-in list and links to the Privacy Policy.
* Cookie banner: present; no analytics or marketing cookies are set.

## 5. Decisions needed from you

1. Attorney review of the Privacy Policy, Cookie Policy and Terms (including the new contact-form sentence), and approval of the exact quote-button text and its policy URL.
2. Whether the contact form gets its own short privacy notice (and its text).
3. Whether `LEAD_INGEST_SECRET` is enabled in production before or after that review (it is what turns on contact-form IP/location capture).

## 6. Does this block technical release? No

The legal blocker does not block the technical improvements or a GitHub **review** branch; it blocks treating the legal pages as final and, in my assessment, blocks enabling contact IP/location capture in production until the wording is reviewed.
