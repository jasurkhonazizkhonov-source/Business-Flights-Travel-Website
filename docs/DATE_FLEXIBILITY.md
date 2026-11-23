# Date flexibility: exact dates, or ± 1, 2 or 3 days (2026-11-23)

Local change, **not committed, not deployed**. It spans two projects: this website and the Compass-Tools CRM (additive, see section 5).

## 1. What was asked, and what the history shows

The request was to *restore* four date-flexibility choices inside "Add preferences (airline, budget, notes)": exact dates, ± 1 day, ± 2 days, ± 3 days. **No earlier implementation of those choices exists in this repository.** Searched: every commit of every branch (including the initial commit, the reflog and unreachable objects), the original and the "-updated" workspace, `docs/workspace-archive`, and the CRM's schema, intake code, API document and tests. Every version of the form, from the initial commit to the previous release, has a **single checkbox**, "My dates are flexible (± a few days)", and both projects stored a **Boolean** (`flexibleDates` / `datesFlexible`). The choices were therefore **built as new**, to the described behaviour, and nothing was "restored from" history. If they existed in a version that was never committed anywhere, that version is not available here.

## 2. The form

Inside the existing "Add preferences" section, the checkbox is **replaced** (never duplicated) by one fieldset, "Date flexibility", with four radio choices: **Exact dates** (default), **± 1 day**, **± 2 days**, **± 3 days**.

* Mutually exclusive: native radio inputs, so the arrow keys move and select within the group and Tab leaves it. The inputs are visually hidden; the labels are the touch targets (at least 44 px high) with a visible focus ring and a selected colour.
* The choice lives in the form's own state, not in the collapsible section, so closing and re-opening "Add preferences" never loses it.
* Airline, budget (and currency), notes, passengers, segments and every other field are untouched; the visual style is the form's existing one.
* The confirmation panel shown to the customer after submitting has a "Date flexibility" row with the choice.
* Public copy that named the old checkbox (home FAQ, one article) now describes the real control.

## 3. What travels where

| Place | Representation |
|---|---|
| Browser to server action | `dateFlexibilityDays`: 0, 1, 2 or 3 (any other value, text, a fraction, a negative: refused by the server before anything is sent) |
| Website to CRM request body | `datesFlexible` (Boolean, true for 1-3) **and** `dateFlexibilityDays` (0-3), never only the Boolean |
| CRM lead | `Lead.flexibleDates` (Boolean, unchanged) and new `Lead.dateFlexibilityDays` (NULL = not stated), CHECK constraint 0-3 |
| CRM lead page | the "Flexible dates" switch shows the choice beside it: "Exact dates" / "± 2 days" |
| CRM "new flight request" e-mails | "Date flexibility: ± 2 days" / "Exact dates"; a flexible lead with no number still says only "Flexible" |
| Website internal notification e-mail | "Date Flexibility: ± 2 days around the chosen dates" / "Exact dates (no flexibility)" |

**Older clients.** A form bundle cached in a visitor's tab from before this change can only send the old Boolean. `true` is kept as "flexible, number not stated" (the CRM stores NULL; nothing is invented), `false` as exact dates. The CRM treats a request with only `datesFlexible` exactly as before.

**Staff edits.** Switching "Flexible dates" on the CRM lead page keeps the two consistent: OFF while the customer chose 1-3 days makes it exact dates (0); ON while it was exact dates makes it "flexible, number no longer known" (NULL). Staff cannot set the number directly (it is the customer's choice).

## 4. Tests (all run against production builds; synthetic data only)

Website: `tests/date-flexibility-logic.spec.ts` (pure, run by CI: schema accepts exactly 0-3 and refuses 4, -1, 1.5, "2", null, true, 10, NaN; the resolver; the CRM body for each choice and for legacy requests; the e-mail for each choice), `tests/date-flexibility.spec.ts` (the form: hidden until opened, four choices, default, mutual exclusion, survives collapse and re-open, arrow-key use, focus ring, touch targets, no horizontal overflow, axe WCAG 2.2 A/AA), `tests/date-flexibility-e2e.spec.ts` (a real browser on a real production server fills the whole form with airline, budget and notes, picks each choice, submits, and a stand-in CRM that refuses unknown fields must receive that choice; the confirmation shows it), and added cases in `tests/crm-api-actions-e2e.spec.ts` and `tests/crm-api-client.spec.ts`.
CRM: `src/lib/__tests__/date-flexibility.test.ts`, `lead-date-flexibility-migration.test.ts`, route cases in `flight-inquiries/__tests__/route.test.ts` (accepted 0-3; refused 4, -1, 1.5, "2"; contradictions refused; the fingerprint differs when only the choice differs), `new-flight-request-email.test.ts`, `lead-date-flexibility-toggle.test.ts`. Results: see `FINAL_IMPROVEMENTS_AND_SECURITY_REVIEW_2026-11-23.md`.

## 5. Deployment notes (for a later, separately approved deployment)

1. **Order: CRM first, then the website.** The CRM endpoint is strict: an unknown field is a `400`. A website that sends `dateFlexibilityDays` to a CRM that does not know it would have **every flight request refused** (visitors see the generic error). Deploy the CRM image and its migration first, and only then the website.
2. The CRM migration `20261123000100_lead_date_flexibility_days` is additive: one nullable column with no default (no row is rewritten) and a CHECK (NULL or 0-3). Apply it before the new CRM image serves traffic (`deploy.sh --migrate`). Rollback: leave the column; an older CRM image never reads it. It was **not applied anywhere** and could not be exercised against PostgreSQL here (no database); its text was reviewed by a source-level test, and the CRM's CI database job is what applies it on a throw-away server.
3. Existing leads keep `NULL`; nothing is back-filled.
