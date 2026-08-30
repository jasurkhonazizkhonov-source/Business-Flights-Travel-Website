"use client";

import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { PhoneNumberField } from "@/components/forms/PhoneNumberField";
import { submitContactMessage } from "@/server/actions/submit-contact-message";
import { CONTACT_SUBJECT_OPTIONS, type ContactSubject } from "@/lib/validations/contact";
import { isValidEmail } from "@/lib/validate";
import { isValidPhoneNumber } from "@/lib/phone";
import { cn } from "@/lib/cn";

type FormErrors = Record<string, string>;

function focusFirstError(errors: FormErrors) {
  const firstKey = Object.keys(errors)[0];
  if (!firstKey) return;
  const wrapper = document.getElementById(`field-${firstKey}`);
  wrapper?.scrollIntoView({ behavior: "smooth", block: "center" });
  wrapper?.querySelector<HTMLElement>("input, select, textarea")?.focus();
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
  const [errors, setErrors] = useState<FormErrors>({});
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  function validateClientSide(): FormErrors {
    const e: FormErrors = {};
    if (!firstName.trim()) e.firstName = "First name is required.";
    if (!lastName.trim()) e.lastName = "Last name is required.";
    if (!isValidEmail(email)) e.email = "Please enter a valid email address.";
    if (!phone) {
      e.phone = "Phone number is required.";
    } else if (!isValidPhoneNumber(phone)) {
      e.phone = "Please enter a valid phone number, including the complete number.";
    }
    if (!subject) e.subject = "Please select a subject.";
    if (message.trim().length < 10) e.message = "Please add a few more details (at least 10 characters).";
    return e;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const clientErrors = validateClientSide();
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      focusFirstError(clientErrors);
      return;
    }
    setErrors({});

    startTransition(async () => {
      const res = await submitContactMessage({
        firstName,
        lastName,
        email,
        phone: phone as string,
        subject: subject as ContactSubject,
        message,
        website,
        renderedAt,
      });
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
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-[var(--color-navy-950)]/8 bg-white p-8 text-center"
      >
        <CheckCircle2 className="mx-auto h-12 w-12 text-[var(--color-gold-500)]" />
        <h3 className="mt-4 font-display text-xl font-semibold text-[var(--color-navy-950)]">Message received</h3>
        <p className="mt-2 text-sm text-[var(--color-navy-950)]/65">
          Thank you for reaching out. A member of our team will get back to you shortly.
        </p>
      </motion.div>
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
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            aria-required="true"
            aria-invalid={Boolean(errors.firstName)}
            className={cn(
              "w-full rounded-xl border bg-white px-3.5 py-3 text-sm outline-none focus:border-[var(--color-gold-500)] focus:ring-2 focus:ring-[var(--color-gold-400)]/30",
              errors.firstName ? "border-red-400" : "border-[var(--color-navy-950)]/12",
            )}
          />
          {errors.firstName && <p className="mt-1 text-xs text-red-600">{errors.firstName}</p>}
        </div>
        <div id="field-lastName">
          <label htmlFor="c-lastName" className="mb-1.5 block text-xs font-semibold tracking-wide text-[var(--color-navy-700)]">
            Last Name <span className="text-[var(--color-gold-600)]">*</span>
          </label>
          <input
            id="c-lastName"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            aria-required="true"
            aria-invalid={Boolean(errors.lastName)}
            className={cn(
              "w-full rounded-xl border bg-white px-3.5 py-3 text-sm outline-none focus:border-[var(--color-gold-500)] focus:ring-2 focus:ring-[var(--color-gold-400)]/30",
              errors.lastName ? "border-red-400" : "border-[var(--color-navy-950)]/12",
            )}
          />
          {errors.lastName && <p className="mt-1 text-xs text-red-600">{errors.lastName}</p>}
        </div>
        <div id="field-email">
          <label htmlFor="c-email" className="mb-1.5 block text-xs font-semibold tracking-wide text-[var(--color-navy-700)]">
            Email Address <span className="text-[var(--color-gold-600)]">*</span>
          </label>
          <input
            id="c-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-required="true"
            aria-invalid={Boolean(errors.email)}
            className={cn(
              "w-full rounded-xl border bg-white px-3.5 py-3 text-sm outline-none focus:border-[var(--color-gold-500)] focus:ring-2 focus:ring-[var(--color-gold-400)]/30",
              errors.email ? "border-red-400" : "border-[var(--color-navy-950)]/12",
            )}
          />
          {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
        </div>
        <PhoneNumberField id="c-phone" fieldKey="phone" label="Phone" value={phone} onChange={setPhone} error={errors.phone} />
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
            className={cn(
              "w-full rounded-xl border bg-white px-3.5 py-3 text-sm outline-none focus:border-[var(--color-gold-500)] focus:ring-2 focus:ring-[var(--color-gold-400)]/30",
              errors.subject ? "border-red-400" : "border-[var(--color-navy-950)]/12",
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
          {errors.subject && <p className="mt-1 text-xs text-red-600">{errors.subject}</p>}
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
            className={cn(
              "w-full rounded-xl border bg-white px-3.5 py-3 text-sm outline-none focus:border-[var(--color-gold-500)] focus:ring-2 focus:ring-[var(--color-gold-400)]/30",
              errors.message ? "border-red-400" : "border-[var(--color-navy-950)]/12",
            )}
          />
          {errors.message && <p className="mt-1 text-xs text-red-600">{errors.message}</p>}
        </div>
      </div>

      <div className="hidden" aria-hidden="true">
        <label htmlFor="c-website">Website</label>
        <input id="c-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>

      {status === "error" && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <p>{errorMessage}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[var(--color-navy-950)] px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-gold-600)] disabled:opacity-70 sm:w-auto"
      >
        {pending ? (
          <>
            <Loader2 size={16} className="animate-spin" /> Sending…
          </>
        ) : (
          "Send Message"
        )}
      </button>
    </form>
  );
}
