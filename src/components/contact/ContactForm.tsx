"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { m } from "framer-motion";
import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { PhoneNumberField } from "@/components/forms/PhoneNumberField";
import { FieldError } from "@/components/forms/FieldError";
import { submitContactMessage } from "@/server/actions/submit-contact-message";
import { ACTION_FAILURE_MESSAGES, ACTION_TIMEOUT_MS, callAction, isContactResult } from "@/lib/safe-action";
// Imported from the zod-free options module, not from
// @/lib/validations/contact, so this client component's bundle doesn't
// pull in zod and the full validation schema — see the comment in
// contact-options.ts.
import { CONTACT_SUBJECT_OPTIONS, type ContactSubject } from "@/lib/validations/contact-options";
import { checkEmail, emailProblemMessage } from "@/lib/validate";
import { focusFieldError } from "@/lib/focus-field-error";
import { getPhoneValidatorState, loadPhoneValidator, type PhoneErrorFor } from "@/lib/phone-validator";
import { useVisitorHint } from "@/hooks/useVisitorHint";
import { cn } from "@/lib/cn";

type FormErrors = Record<string, string>;

const CONTACT_EMAIL_BASE = "Please enter a valid email address.";
const CONTACT_PHONE_MESSAGES = { incomplete: "Please enter a valid phone number, including the complete number.", required: "Phone number is required." };

function without(errors: FormErrors, key: string): FormErrors {
  const rest = { ...errors };
  delete rest[key];
  return rest;
}

function focusFirstError(errors: FormErrors) {
  const firstKey = Object.keys(errors)[0];
  if (firstKey) focusFieldError(firstKey);
}

export function ContactForm() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState<string | undefined>(undefined);
  // Deliberately not pre-selected — an unselected "Select a subject"
  // placeholder must not count as a valid choice, so the real state starts
  // empty rather than defaulting to one of the real options.
  const [subject, setSubject] = useState<ContactSubject | "">("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [renderedAt] = useState(() => Date.now());
  // Identifies this form instance, so pressing Send again after a timeout or a lost answer is recognised by the CRM as the SAME submission and
  // stored once. Absent only where randomUUID is unavailable (insecure context); the server then sends no key.
  const [submissionId] = useState(() => globalThis.crypto?.randomUUID?.());
  const [errors, setErrors] = useState<FormErrors>({});
  const [, startTransition] = useTransition();
  // Our own "a request is in flight" flag. React keeps `useTransition`'s pending flag true until the Server Action itself settles, which after a
  // time-out (callAction) can be much later, so the button must not be driven by it: it is released as soon as the outcome is known.
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  // Approximate, server-derived country (see src/lib/visitor-hint.ts): only pre-selects the phone country code, while the field is untouched.
  const hint = useVisitorHint();

  // See handleSubmit: the phone validator is loaded on demand, not with the page.
  const waitingForPhoneRef = useRef(false);
  const skipPhoneFormatCheckRef = useRef(false);

  function validateEmailField(value: string): string | undefined {
    const result = checkEmail(value);
    return result.ok ? undefined : emailProblemMessage(result.problem, CONTACT_EMAIL_BASE);
  }

  /** Validate-on-blur: only for something the visitor has actually typed - an empty field is not complained about until they submit. */
  function checkEmailOnBlur() {
    if (!email.trim()) return;
    const message = validateEmailField(email);
    setErrors((prev) => (message ? { ...prev, email: message } : prev.email ? without(prev, "email") : prev));
  }

  function checkPhoneOnBlur(value: string | undefined) {
    if (!value) return;
    const run = (errorFor: PhoneErrorFor) => {
      const message = errorFor(value, CONTACT_PHONE_MESSAGES);
      setErrors((prev) => (message ? { ...prev, phone: message } : prev.phone ? without(prev, "phone") : prev));
    };
    const state = getPhoneValidatorState();
    if (state.state === "ready") run(state.errorFor);
    else
      void loadPhoneValidator().then(() => {
        const loaded = getPhoneValidatorState();
        if (loaded.state === "ready") run(loaded.errorFor);
      });
  }

  function validateClientSide(phoneErrorFor: PhoneErrorFor | null): FormErrors {
    const e: FormErrors = {};
    if (!firstName.trim()) e.firstName = "First name is required.";
    if (!lastName.trim()) e.lastName = "Last name is required.";
    const emailMessage = validateEmailField(email);
    if (emailMessage) e.email = emailMessage;
    if (!phone) {
      e.phone = CONTACT_PHONE_MESSAGES.required;
    } else if (phoneErrorFor) {
      const phoneMessage = phoneErrorFor(phone, CONTACT_PHONE_MESSAGES);
      if (phoneMessage) e.phone = phoneMessage;
    }
    if (!subject) e.subject = "Please select a subject.";
    if (message.trim().length < 10) e.message = "Please add a few more details (at least 10 characters).";
    return e;
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEventTarget = e.currentTarget;
    // The phone validator (libphonenumber) is loaded on demand - see src/lib/phone-validator.ts. Normally it is ready long before a submit
    // (the phone field loads it on first touch). If it is not (autofill, a very fast submit) wait for it, then submit again so the very same
    // checks run against the latest field values. If it cannot be loaded the client-side format check is skipped and the server decides.
    const phoneState = getPhoneValidatorState();
    let phoneErrorFor: PhoneErrorFor | null;
    if (phoneState.state === "ready") {
      phoneErrorFor = phoneState.errorFor;
    } else if (skipPhoneFormatCheckRef.current) {
      skipPhoneFormatCheckRef.current = false;
      phoneErrorFor = null;
    } else {
      if (waitingForPhoneRef.current) return;
      waitingForPhoneRef.current = true;
      const form = formEventTarget;
      void loadPhoneValidator().then((loaded) => {
        waitingForPhoneRef.current = false;
        if (!loaded) skipPhoneFormatCheckRef.current = true;
        if (typeof form.requestSubmit === "function") form.requestSubmit();
        else form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      return;
    }
    const clientErrors = validateClientSide(phoneErrorFor);
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      focusFirstError(clientErrors);
      return;
    }
    setErrors({});

    setBusy(true);
    startTransition(async () => {
      // A call that fails as a whole (dropped connection, timeout, thrown action, unexpected reply) is an inline message here, never the route
      // error page: the form and everything typed stay as they are, and the visitor can try again. Nothing is retried automatically.
      const outcome = await callAction(
        () =>
          submitContactMessage({
            firstName,
            lastName,
            email,
            phone: phone as string,
            subject: subject as ContactSubject,
            message,
            website,
            renderedAt,
            submissionId,
          }),
        isContactResult,
        ACTION_TIMEOUT_MS.contactMessage,
      );
      setBusy(false);
      if (!outcome.ok) {
        setStatus("error");
        setErrorMessage(ACTION_FAILURE_MESSAGES.contactMessage);
        setErrors({});
        return;
      }
      const res = outcome.value;
      if (res.ok) {
        setStatus("success");
      } else {
        setStatus("error");
        setErrorMessage(res.error);
        setErrors(res.fieldErrors ?? {});
        if (res.fieldErrors) focusFirstError(res.fieldErrors);
      }
    });
  }

  if (status === "success") {
    return (
      <m.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-[var(--color-navy-950)]/8 bg-white p-8 text-center"
      >
        <CheckCircle2 className="mx-auto h-12 w-12 text-[var(--color-gold-600)]" aria-hidden="true" />
        <h3 className="mt-4 font-display text-xl font-semibold text-[var(--color-navy-950)]">Message received</h3>
        <p className="mt-2 text-sm text-[var(--color-navy-950)]/65">
          Thank you for reaching out. A member of our team will get back to you shortly.
        </p>
      </m.div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="rounded-2xl border border-[var(--color-navy-950)]/8 bg-white p-6 sm:p-7">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div id="field-firstName">
          <label htmlFor="c-firstName" className="mb-1.5 block text-xs font-semibold tracking-wide text-[var(--color-navy-700)]">
            First Name <span className="text-[var(--color-gold-600)]">*</span>
          </label>
          <input
            id="c-firstName"
            autoComplete="given-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            aria-required="true"
            aria-invalid={Boolean(errors.firstName)}
            aria-describedby={errors.firstName ? "c-firstName-error" : undefined}
            className={cn(
              "w-full rounded-xl border bg-white px-3.5 py-3 text-sm outline-none focus:border-[var(--color-navy-700)] focus:ring-2 focus:ring-[var(--color-gold-400)]/55",
              errors.firstName ? "border-red-500" : "border-[var(--color-navy-950)]/12",
            )}
          />
          {errors.firstName && <FieldError id="c-firstName-error">{errors.firstName}</FieldError>}
        </div>
        <div id="field-lastName">
          <label htmlFor="c-lastName" className="mb-1.5 block text-xs font-semibold tracking-wide text-[var(--color-navy-700)]">
            Last Name <span className="text-[var(--color-gold-600)]">*</span>
          </label>
          <input
            id="c-lastName"
            autoComplete="family-name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            aria-required="true"
            aria-invalid={Boolean(errors.lastName)}
            aria-describedby={errors.lastName ? "c-lastName-error" : undefined}
            className={cn(
              "w-full rounded-xl border bg-white px-3.5 py-3 text-sm outline-none focus:border-[var(--color-navy-700)] focus:ring-2 focus:ring-[var(--color-gold-400)]/55",
              errors.lastName ? "border-red-500" : "border-[var(--color-navy-950)]/12",
            )}
          />
          {errors.lastName && <FieldError id="c-lastName-error">{errors.lastName}</FieldError>}
        </div>
        <div id="field-email">
          <label htmlFor="c-email" className="mb-1.5 block text-xs font-semibold tracking-wide text-[var(--color-navy-700)]">
            Email Address <span className="text-[var(--color-gold-600)]">*</span>
          </label>
          <input
            id="c-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              // Once an error is showing, it clears the moment the address becomes valid (no need to leave the field first).
              if (errors.email && checkEmail(e.target.value).ok) setErrors((prev) => without(prev, "email"));
            }}
            onBlur={checkEmailOnBlur}
            aria-required="true"
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "c-email-error" : undefined}
            className={cn(
              "w-full rounded-xl border bg-white px-3.5 py-3 text-sm outline-none focus:border-[var(--color-navy-700)] focus:ring-2 focus:ring-[var(--color-gold-400)]/55",
              errors.email ? "border-red-500" : "border-[var(--color-navy-950)]/12",
            )}
          />
          {errors.email && <FieldError id="c-email-error">{errors.email}</FieldError>}
        </div>
        <PhoneNumberField
          id="c-phone"
          fieldKey="phone"
          label="Phone"
          value={phone}
          onChange={(next) => {
            setPhone(next);
            // As with the email: a showing phone error is cleared as soon as the number is acceptable.
            if (errors.phone) {
              const state = getPhoneValidatorState();
              if (state.state === "ready" && next && !state.errorFor(next, CONTACT_PHONE_MESSAGES)) setErrors((prev) => without(prev, "phone"));
            }
          }}
          error={errors.phone}
          suggestedCountry={hint?.countryCode}
          onBlurValue={checkPhoneOnBlur}
        />
        <div id="field-subject" className="sm:col-span-2">
          <label htmlFor="c-subject" className="mb-1.5 block text-xs font-semibold tracking-wide text-[var(--color-navy-700)]">
            Subject <span className="text-[var(--color-gold-600)]">*</span>
          </label>
          <select
            id="c-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value as ContactSubject)}
            aria-required="true"
            aria-invalid={Boolean(errors.subject)}
            aria-describedby={errors.subject ? "c-subject-error" : undefined}
            className={cn(
              "w-full rounded-xl border bg-white px-3.5 py-3 text-sm outline-none focus:border-[var(--color-navy-700)] focus:ring-2 focus:ring-[var(--color-gold-400)]/55",
              errors.subject ? "border-red-500" : "border-[var(--color-navy-950)]/12",
              subject === "" && "text-[var(--color-navy-950)]/65",
            )}
          >
            <option value="" disabled>
              Select a subject
            </option>
            {CONTACT_SUBJECT_OPTIONS.map((s) => (
              <option key={s.value} value={s.value} className="text-[var(--color-navy-950)]">
                {s.label}
              </option>
            ))}
          </select>
          {errors.subject && <FieldError id="c-subject-error">{errors.subject}</FieldError>}
        </div>
        <div id="field-message" className="sm:col-span-2">
          <label htmlFor="c-message" className="mb-1.5 block text-xs font-semibold tracking-wide text-[var(--color-navy-700)]">
            Message <span className="text-[var(--color-gold-600)]">*</span>
          </label>
          <textarea
            id="c-message"
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="How can we help?"
            aria-required="true"
            aria-invalid={Boolean(errors.message)}
            aria-describedby={errors.message ? "c-message-error" : undefined}
            className={cn(
              "w-full rounded-xl border bg-white px-3.5 py-3 text-sm outline-none focus:border-[var(--color-navy-700)] focus:ring-2 focus:ring-[var(--color-gold-400)]/55",
              errors.message ? "border-red-500" : "border-[var(--color-navy-950)]/12",
            )}
          />
          {errors.message && <FieldError id="c-message-error">{errors.message}</FieldError>}
        </div>
      </div>

      <div className="hidden" aria-hidden="true">
        <label htmlFor="c-website">Website</label>
        <input id="c-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>

      {status === "error" && (
        <div role="alert" className="mt-4 flex items-start gap-2.5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <p>{errorMessage}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={busy}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[var(--color-navy-950)] px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-gold-600)] disabled:opacity-70 sm:w-auto"
      >
        {busy ? (
          <>
            <Loader2 size={16} className="animate-spin" /> Sending…
          </>
        ) : (
          "Send Message"
        )}
      </button>
      {/* A pointer to this site's own Privacy Policy, not a consent claim: nothing here says the visitor agrees to anything, and there is no checkbox. */}
      <p data-testid="contact-privacy-pointer" className="mt-3 text-xs leading-relaxed text-[var(--color-navy-950)]/70">
        See our{" "}
        <Link
          href="/privacy-policy"
          className="font-medium text-[var(--color-navy-800)] underline decoration-[var(--color-navy-950)]/30 underline-offset-2 hover:text-[var(--color-gold-600)]"
        >
          Privacy Policy
        </Link>{" "}
        for how we handle your information.
      </p>
    </form>
  );
}
