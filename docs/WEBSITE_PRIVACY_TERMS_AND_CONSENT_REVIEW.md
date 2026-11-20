# Privacy, Terms, cookie and consent review

Date: 2026-11-15. A technical comparison of what the website says with what the code and the CRM actually do. **It is not legal advice and not a legal review.** No attorney review is on record (`docs/LEGAL.md`). It extends, and does not replace, `WEBSITE_PRIVACY_AND_CONSENT_READINESS_REVIEW.md` (2026-11-15, earlier) whose findings stand. No legal wording was changed in this pass: nothing found was a confirmed technical inaccuracy that could be corrected without inventing wording.

## 1. The "that company's name" privacy link: the premise does not hold

The request assumed the quote button's privacy link points to `[another company's privacy page, named in the proposed text]`. **It does not, and it never did.**

* No file under `src/`, `public/`, `scripts/` or `deploy/` contains "that company" (searched in the current tree); `git log -S"that companytravel"` over **all** remote branches and their history finds no commit that added or removed it in `src/`; the live site's home page contains no occurrence.
* The domain appears only in two places: the **proposed disclaimer text** supplied in a brief, and a guard test (`tests/contact-details-and-consent.spec.ts`) that fails if it ever appears.
* The quote notice links to this site's own `/privacy-policy` (`QuoteConsentNotice.tsx`, `QUOTE_CONSENT_PRIVACY_HREF`).

**Every privacy link in the site** (searched in `src/`): footer, legal-pages navigation, the quote notice, the flights page sentence, the newsletter form, the cookie policy and the terms all point to `/privacy-policy`. The cookie banner links to `/cookie-policy`, not to the privacy policy (appropriate for its subject). The sitemap lists `/privacy-policy`; the page's canonical and metadata are on the right host (crawled: 218 routes, 0 failures). No link to another company's policy exists. **Gap (decision needed):** the **contact form has no privacy link or notice at all**, although it collects personal data and, when enabled, IP and approximate location. Adding a neutral pointer under the send button ("See our Privacy Policy for how we handle your information", linking to `/privacy-policy`) would not claim consent or invent wording, but its text and placement are your decision, so it was not added.

## 2. Privacy Policy against actual behaviour

| Topic | What the policy says | What the code does | Verdict |
|---|---|---|---|
| Flight request and contact data | name, e-mail, phone, trip details, optional notes, message | the same fields, sent to the CRM | accurate |
| IP and approximate location | flight request: yes, and in the internal e-mail; **contact form: yes (added 2026-11-15)**; stored in the CRM, visible to authorised staff; an estimate, not GPS; can be wrong or missing | IP (IPv4 or IPv6, full) and city, region, country, time zone from Cloudflare; coordinates only in the internal flight e-mail; nothing is stored if not available | accurate **only when `LEAD_INGEST_SECRET` is set on both sides**; if unset, nothing is recorded and the text over-states (see the environment audit) |
| Transfer to the CRM | "sent to and stored in our CRM; this website does not keep a database" | true (no database, no file store) | accurate |
| Newsletter | e-mail address and date, opt-in list | e-mail and source sent to the CRM subscribe route | accurate |
| Cookies | none set; choice stored in browser local storage | **verified**: no cookie is set by the application (no `document.cookie`, no `Set-Cookie`; live responses also set none); one `localStorage` key for the banner choice; no analytics library | accurate |
| Analytics | none | none (no analytics package, CSP forbids third-party scripts) | accurate |
| Cloudflare | network and security provider that processes technical data and derives location | the site is behind Cloudflare; location headers are Cloudflare's | accurate; says "location derived by Cloudflare", not exact |
| Communication | a travel specialist may contact you by phone, e-mail or **text message** about your request | no SMS provider or automation exists (see section 4); staff can open a manual `sms:` link | accurate as a statement of permitted practice; unverifiable as a consent mechanism |
| "We do not permit [providers] to use your information for their own purposes" | a contractual assurance | not verifiable from the repositories (depends on Cloudflare's and Google's terms and any contract) | **flag for counsel**: an assurance the site cannot prove |
| Retention, international transfer, data-subject rights | general terms, no periods | consistent: no period was invented | needs counsel; the CRM's actual retention was not examined for this report |
| Security of IP in logs | not stated | the website logs only that an IP was captured, never the address | n/a |

Nothing in the policy claims exact location, a retention period, a named processor beyond Cloudflare, recorded consent, or automated messaging. Not verified: whether the CRM's own behaviour (retention, who can read) matches section 4 of the policy; that needs the CRM owner.

## 3. Terms of Use against actual behaviour

* Company identity and contact details: from the shared constants; verified on every page and in the structured data by the contact-details tests.
* "Acts as an intermediary that helps you find and book flights operated by third-party airlines" (section 7): consistent with a quote-request site; **no booking or payment function exists on the website** (quotes are requested, specialists respond).
* Governing law and the limitation-of-liability clause were **deliberately left unspecified** (`docs/LEGAL.md` item 2). That remains an open item for counsel; an invented governing law would be worse.
* Price and availability language, liability and disclaimers: not changed; legal interpretation, for counsel.
* The Terms link to the Privacy and Cookie policies by relative links (verified).

## 4. What the business actually does when someone submits a form (read from the CRM and the website, read-only)

| Channel | Reality found | Evidence |
|---|---|---|
| E-mail to the visitor | The website itself sends **no** e-mail to the visitor; it sends an internal notification (to the company's own sender address) for a flight request. The CRM creates an **in-app notification for staff** on a new inquiry. The CRM does have staff-sent quotes, **automated e-mail sequences** to leads (scheduled steps) and **marketing campaigns** to subscribers | website `flight-request-notification.ts`; CRM `admin-notifications.ts`, `due-sequence-steps.ts`, campaign code |
| SMS | **No SMS provider, library or automation** in the CRM or the website (no Twilio or equivalent in dependencies or source). Staff can click an `sms:` link that opens their own device's messaging app | package files; one `sms:` link in the CRM's inquiry panel |
| Automated or prerecorded calls | none found; calls are made by people | no dialer integration found |
| Recorded consent | **none**: the CRM API has no consent field, and nothing stores that a notice was shown or when | CRM route schemas; `QuoteConsentNotice.tsx` comment |
| "Phone-exclusive deals" | no such offer exists in the code or content | search |

## 5. The proposed quote-button disclaimer: assessment

Proposed: "No Spam — only phone-exclusive deals. No purchase necessary. By providing your contact details and clicking on 'Get My Free Quote', you agree to be contacted for travel information via phone and text messages and by email. Your consent to receive such messages is not a condition of purchase. We respect your privacy." with a link to `[another company's privacy page, named in the proposed text]`.

* **Not implemented**, and should not be as written: it promises "phone-exclusive deals" that nothing supports; it asserts consent to **text messages** while no SMS capability or consent record exists; it uses a button name ("Get My Free Quote") that is not the real label ("Get a Free Flight Quote"); and its link goes to **another company's domain**, which cannot present that company's policy as Business Flights Travel's.
* The current text keeps your design (a small notice **under the button, no checkbox**, readable on mobile and desktop, tested for visual weight and accessibility): "By providing your contact details and clicking 'Get a Free Flight Quote', you agree to be contacted by Business Flights Travel regarding your request. We respect your privacy." with an internal link.
* Whether an **implied consent by clicking, without a checkbox**, is legally adequate for the actual practices (phone calls, e-mails, and any texting by staff) is a **legal question**: automated calls or texts and marketing e-mail can have stricter rules (for example, prior express written consent for certain automated or marketing messages in the United States, and state rules). **Marked for qualified attorney review.** If counsel approves wording that includes text messages or "deals", the matching functionality (recorded consent, opt-out instructions) probably also has to exist; the notice is a one-line change when the approved text is available.
* The "Privacy Policy" it should link to is `/privacy-policy`, on this site.

## 6. Cookie and tracking disclosure

Verified true: the banner's choices are stored in `localStorage`; no analytics or marketing code exists, so "Not currently used" in the banner's settings matches reality; nothing nonessential loads before consent because nothing nonessential exists; the CSP (`script-src 'self'`, `connect-src 'self'`, `img-src 'self' data:`) prevents third-party scripts and requests; images from an external photo host are fetched by the server through `/_next/image`, not by the visitor's browser. The footer has a link to a review site (a normal outbound link that sets nothing on click-through). **No technical inaccuracy found; nothing changed.**

## 7. Needed from you
1. Attorney review of Privacy, Cookie and Terms, including the contact-form sentence, the unverifiable assurance in section 6 of the policy, retention, governing law.
2. Approved wording (and correct button name) for the quote notice, and whether text-message or "deals" language is true of your real practice.
3. Whether the contact form gets a privacy pointer, and its text.
4. Whether `LEAD_INGEST_SECRET` is enabled before or after the review (it is what makes the IP and location statements true).
