"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { m, AnimatePresence } from "framer-motion";
import { Plus, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { PhoneNumberField } from "@/components/forms/PhoneNumberField";
import { FieldError } from "@/components/forms/FieldError";
import { SegmentRow, type SegmentState } from "./SegmentRow";
import { DateField } from "./DateField";
import { PassengerCabinField } from "./PassengerCabinField";
import { QuoteConsentNotice } from "./QuoteConsentNotice";
import { submitFlightRequest } from "@/server/actions/submit-flight-request";
import { ACTION_FAILURE_MESSAGES, ACTION_TIMEOUT_MS, callAction, isFlightResult } from "@/lib/safe-action";
import type { AirportOption, FlightRequestInput } from "@/lib/validations/flight-request";
// Imported from the zod-free options module, not from
// @/lib/validations/flight-request, so this client component's bundle
// doesn't pull in zod and the full validation schema — see the comment in
// flight-request-options.ts.
import {
  TRIP_TYPES,
  BUDGET_CURRENCIES,
  DEFAULT_BUDGET_CURRENCY,
  DATE_FLEXIBILITY_DAYS,
  DATE_FLEXIBILITY_LABEL,
  DEFAULT_DATE_FLEXIBILITY_DAYS,
  type BudgetCurrency,
  type DateFlexibilityDays,
} from "@/lib/validations/flight-request-options";
import { cn } from "@/lib/cn";
import { PRIMARY_CTA_LABEL } from "@/lib/constants";
import { checkEmail, emailProblemMessage } from "@/lib/validate";
import { focusFieldError } from "@/lib/focus-field-error";
import { getPhoneValidatorState, loadPhoneValidator, type PhoneErrorFor } from "@/lib/phone-validator";
import { PAST_MESSAGE, TOO_FAR_MESSAGE, clientDateWindow, dateProblem } from "@/lib/flight-date-window";
import { useVisitorHint } from "@/hooks/useVisitorHint";
import { useDeviceAirport } from "@/hooks/useDeviceAirport";

const TRIP_TYPE_LABELS: Record<(typeof TRIP_TYPES)[number], string> = {
  ONE_WAY: "One Way",
  ROUND_TRIP: "Round Trip",
  MULTI_CITY: "Multi-City",
};

const emptySegment: SegmentState = { from: null, to: null, departureDate: "" };

function todayFloor() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

type FormErrors = Record<string, string>;

const FLIGHT_EMAIL_BASE = "Please enter a valid email address so our travel specialist can contact you about your flight request.";
const FLIGHT_PHONE_MESSAGES = {
  incomplete: "Please enter a valid phone number, including the complete number, so our travel specialist can reach you.",
  required: "Phone number is required",
};

/** Where the first flight's origin came from: nothing yet, an automatic suggestion (approximate network location / the device), or the visitor. */
type OriginSource = "none" | "device" | "user";

function without(errors: FormErrors, key: string): FormErrors {
  const rest = { ...errors };
  delete rest[key];
  return rest;
}

export function FlightRequestForm({
  compact = false,
  initialDestination = null,
  locateOn = "interaction",
}: {
  compact?: boolean;
  /** When the browser is asked for the visitor's location, to suggest a departure airport (once per form): "open" = as soon as the form is on screen (the
   * /flights page, whose whole purpose is this form); "interaction" = on the visitor's first use of the form (the home-page form, so that people who only
   * browse the home page are never prompted). */
  locateOn?: "open" | "interaction";
  /** Pre-fills the first segment's "To" field — e.g. arriving from a
   * destination page's "Get a Flight Quote to Paris" link. The customer
   * can still change it; nothing here locks the field. */
  initialDestination?: AirportOption | null;
}) {
  const [tripType, setTripType] = useState<(typeof TRIP_TYPES)[number]>("ROUND_TRIP");
  const [segments, setSegments] = useState<SegmentState[]>([{ ...emptySegment, to: initialDestination }]);
  const [returnDate, setReturnDate] = useState("");
  const [passengers, setPassengers] = useState({ adults: 1, children: 0, infants: 0 });
  const [cabinClass, setCabinClass] = useState<FlightRequestInput["cabinClass"]>("BUSINESS");
  // Kept here, in the form, not in the collapsible section below: closing "Add preferences" unmounts its fields but never loses the choice.
  const [dateFlexibilityDays, setDateFlexibilityDays] = useState<DateFlexibilityDays>(DEFAULT_DATE_FLEXIBILITY_DAYS);
  const [preferredAirline, setPreferredAirline] = useState("");
  const [budget, setBudget] = useState("");
  const [budgetCurrency, setBudgetCurrency] = useState<BudgetCurrency>(DEFAULT_BUDGET_CURRENCY);
  const [notes, setNotes] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState<string | undefined>(undefined);
  const [website, setWebsite] = useState(""); // honeypot
  const [renderedAt] = useState(() => Date.now());
  // One key per mounted form, identical on every attempt of this submission —
  // including the automatic retry Next.js makes of a failed Server Action
  // POST — so the server can recognise a repeat of the same submission and
  // not save it twice: the server action sends it to the CRM as the
  // Idempotency-Key (src/server/actions/submit-flight-request.ts). A reload
  // mounts a new form and therefore a new key: that is a deliberate new
  // request. Absent only where randomUUID is unavailable (insecure context);
  // the server then uses a fresh key per call, which protects only the
  // retries inside that one call.
  const [submissionId] = useState(() => globalThis.crypto?.randomUUID?.());
  const [showMore, setShowMore] = useState(false);
  const [originSource, setOriginSource] = useState<OriginSource>("none");
  // Set (in the event handler, so it is true the moment the visitor acts) as soon as the visitor types in the From field or chooses an airport for it.
  // From then on a location result - however late - is ignored.
  const fromTakenRef = useRef(false);

  const [errors, setErrors] = useState<FormErrors>({});
  const [, startTransition] = useTransition();
  // Our own "a request is in flight" flag. React keeps `useTransition`'s pending flag true until the Server Action itself settles, which after a
  // time-out (callAction) can be much later, so the button must not be driven by it: it is released as soon as the outcome is known.
  const [busy, setBusy] = useState(false);
  const submittingRef = useRef(false);
  // The phone validator is loaded on demand, not with the page (see handleSubmit and src/lib/phone-validator.ts).
  const waitingForPhoneRef = useRef(false);
  const skipPhoneFormatCheckRef = useRef(false);
  const [result, setResult] = useState<
    | { status: "idle" }
    | { status: "success"; summary: NonNullable<Extract<Awaited<ReturnType<typeof submitFlightRequest>>, { ok: true }>["summary"]> }
    | { status: "error"; message: string }
  >({ status: "idle" });

  function changeTripType(next: (typeof TRIP_TYPES)[number]) {
    setTripType(next);
    if (next === "MULTI_CITY" && segments.length < 2) {
      setSegments((s) => [...s, { ...emptySegment }]);
    } else if (next !== "MULTI_CITY" && segments.length > 1) {
      setSegments((s) => [s[0]]);
    }
  }

  function updateSegment(index: number, next: SegmentState) {
    // Any change the visitor makes to the first origin (choosing an airport, or editing the text away from the current one) makes it theirs:
    // automatic suggestions never touch it again.
    if (index === 0 && next.from !== segments[0]?.from) {
      fromTakenRef.current = true;
      setOriginSource("user");
    }
    setSegments((prev) => prev.map((s, i) => (i === index ? next : s)));
    // Round trip: moving the departure past an already chosen return date would leave a return BEFORE the departure
    // (the calendar cannot offer one, and validation would reject it), so the stale return date is cleared and re-asked.
    if (index === 0 && next.departureDate && returnDate && returnDate < next.departureDate) setReturnDate("");
  }

  function addSegment() {
    if (segments.length >= 6) return;
    setSegments((prev) => [...prev, { ...emptySegment }]);
  }

  function removeSegment(index: number) {
    setSegments((prev) => (prev.length > 2 ? prev.filter((_, i) => i !== index) : prev));
  }

  const firstDeparture = segments[0]?.departureDate ? new Date(`${segments[0].departureDate}T00:00:00`) : todayFloor();

  // --- the departure airport from the device's location --------------------------------------------------------------------------------------
  // The browser is asked for the visitor's position ONCE (useDeviceAirport): on /flights when the form opens, on the home page when the visitor first uses
  // the form. If they allow it, the nearest MAJOR airport fills an EMPTY From field and is labelled "Suggested". It never replaces anything: not an airport
  // the visitor chose, not text they have started typing (fromTakenRef), not a destination-equal airport. If they decline, or the position cannot be had, or
  // no major airport is near, nothing is suggested and nothing is said: the From field simply works as it always did.
  function placeDeviceOrigin(airport: AirportOption) {
    if (fromTakenRef.current || segments[0]?.from) return;
    if (segments[0]?.to?.iata === airport.iata) return; // never suggest departing from the place the visitor wants to go to
    setSegments((prev) => prev.map((seg, i) => (i === 0 && !seg.from ? { ...seg, from: airport } : seg)));
    setOriginSource("device");
  }
  const hint = useVisitorHint(); // the country only, for the phone prefix
  const device = useDeviceAirport(placeDeviceOrigin);
  const startDevice = device.start;
  useEffect(() => {
    if (locateOn === "open") startDevice();
  }, [locateOn, startDevice]);
  // The first use of the form (a click, a tap or the keyboard arriving in a field) asks, for the forms that wait for one. start() acts only once.
  const askOnFirstUse = locateOn === "interaction" ? startDevice : undefined;

  // Spoken (not shown) when the airport is filled in, so that assistive technology reports the change; the "Suggested" tag is the visible cue.
  const suggestionNote = originSource === "device" && segments[0]?.from ? `Departure airport set to ${segments[0].from.city} (${segments[0].from.iata}) from your device's location. You can change it.` : "";
  const originExtras = {
    describedBy: suggestionNote ? "origin-suggestion-note" : undefined,
    onEdit: () => {
      fromTakenRef.current = true;
    },
    labelAction: (
      <span className="flex items-center gap-2">
        <span id="origin-suggestion-note" role="status" className="sr-only">
          {suggestionNote}
        </span>
        {originSource === "device" && (
          <span aria-hidden="true" className="inline-flex h-4 items-center rounded-full bg-[var(--color-gold-400)]/25 px-2 text-[11px] font-semibold leading-4 text-[var(--color-navy-800)]">
            Suggested
          </span>
        )}
      </span>
    ),
  };

  const dateWindow = clientDateWindow();

  function validateEmailField(value: string): string | undefined {
    const result = checkEmail(value);
    return result.ok ? undefined : emailProblemMessage(result.problem, FLIGHT_EMAIL_BASE);
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
      const message = errorFor(value, FLIGHT_PHONE_MESSAGES);
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
    segments.forEach((s, i) => {
      if (!s.from) e[`segments.${i}.from`] = "Select an origin";
      if (!s.to) e[`segments.${i}.to`] = "Select a destination";
      if (!s.departureDate) e[`segments.${i}.departureDate`] = "Select a date";
      else {
        // The same window the server enforces (src/lib/flight-date-window.ts): from today to 11 calendar months after today.
        const problem = dateProblem(s.departureDate, dateWindow);
        if (problem === "past") e[`segments.${i}.departureDate`] = PAST_MESSAGE;
        else if (problem === "too_far") e[`segments.${i}.departureDate`] = TOO_FAR_MESSAGE;
        else if (problem === "invalid") e[`segments.${i}.departureDate`] = "Enter a valid date";
      }
      // Mirrors the server's segmentSchema refine (flight-request.ts) so
      // this catches an identical origin/destination instantly instead of
      // only after a round trip to the server — same error message and
      // field so the two paths are indistinguishable to the user.
      if (s.from && s.to && s.from.iata === s.to.iata) {
        e[`segments.${i}.to`] = "Origin and destination must be different";
      }
    });
    if (tripType === "ROUND_TRIP" && !returnDate) e.returnDate = "Select a return date";
    // Mirrors the server's top-level refine comparing returnDate against
    // the first segment's departureDate.
    if (tripType === "ROUND_TRIP" && returnDate && segments[0]?.departureDate && returnDate < segments[0].departureDate) {
      e.returnDate = "Return date must be on or after the departure date";
    } else if (tripType === "ROUND_TRIP" && returnDate && dateProblem(returnDate, dateWindow) === "too_far") {
      e.returnDate = TOO_FAR_MESSAGE;
    }
    if (!firstName.trim()) e.firstName = "First name is required";
    if (!lastName.trim()) e.lastName = "Last name is required";
    const emailMessage = validateEmailField(email);
    if (emailMessage) e.email = emailMessage;
    if (!phone) {
      e.phone = FLIGHT_PHONE_MESSAGES.required;
    } else if (phoneErrorFor) {
      const phoneMessage = phoneErrorFor(phone, FLIGHT_PHONE_MESSAGES);
      if (phoneMessage) e.phone = phoneMessage;
    }
    return e;
  }

  function handleSubmit(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const formEventTarget = formEvent.currentTarget;
    // Next.js queues Server Actions rather than dropping a second one — so
    // a double-click/double-Enter that fires two submit events in a row
    // would run the second action as soon as the first finishes, creating a
    // second Lead (and a second internal notification). The `disabled`
    // button below can't stop that on its own, and a check of the `pending`
    // state would read a value captured by this render's closure. A ref
    // updates synchronously, so the very next submit event already sees it.
    if (submittingRef.current) return;
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
      const firstKey = Object.keys(clientErrors)[0];
      focusFieldError(firstKey);
      return;
    }
    setErrors({});

    const payload: FlightRequestInput = {
      tripType,
      segments: segments.map((s) => ({
        from: s.from!,
        to: s.to!,
        departureDate: s.departureDate,
      })),
      returnDate: tripType === "ROUND_TRIP" ? returnDate : undefined,
      cabinClass,
      adults: passengers.adults,
      children: passengers.children,
      infants: passengers.infants,
      dateFlexibilityDays,
      preferredAirline: preferredAirline || undefined,
      budget: budget ? Number(budget) : undefined,
      budgetCurrency: budget ? budgetCurrency : undefined,
      notes: notes || undefined,
      firstName,
      lastName,
      email,
      phone: phone ?? "",
      website,
      renderedAt,
      submissionId,
    };

    submittingRef.current = true;
    setBusy(true);
    startTransition(async () => {
      // A call that fails as a whole (dropped connection, timeout, thrown action, unexpected reply) becomes an inline message: the form and every
      // field stay as they are and the visitor can try again. Nothing is retried automatically; pressing the button again re-sends the SAME
      // submissionId, which the server turns into one CRM lead (Idempotency-Key), so an attempt whose answer was lost cannot create a second one.
      let outcome: Awaited<ReturnType<typeof callAction<Awaited<ReturnType<typeof submitFlightRequest>>>>>;
      try {
        outcome = await callAction(() => submitFlightRequest(payload), isFlightResult, ACTION_TIMEOUT_MS.flightRequest);
      } finally {
        submittingRef.current = false;
        setBusy(false);
      }
      if (!outcome.ok) {
        setErrors({});
        setResult({ status: "error", message: ACTION_FAILURE_MESSAGES.flightRequest });
        return;
      }
      const res = outcome.value;
      if (res.ok) {
        setResult({ status: "success", summary: res.summary });
      } else {
        setErrors(res.fieldErrors ?? {});
        // The client-validation branch above scrolls to the first errored
        // field; a server-side rejection (e.g. a check this form can't
        // duplicate, like the honeypot or rate limit) needs the same
        // treatment so a field error below the fold isn't silently missed.
        const firstServerKey = Object.keys(res.fieldErrors ?? {})[0];
        if (firstServerKey) {
          focusFieldError(firstServerKey);
        }
        setResult({ status: "error", message: res.error });
      }
    });
  }

  if (result.status === "success") {
    return <SuccessPanel summary={result.summary} />;
  }

  return (
    <form
      onSubmit={handleSubmit}
      onFocusCapture={askOnFirstUse}
      onPointerDownCapture={askOnFirstUse}
      // Without this, the browser's own native constraint validation (e.g.
      // the type="email" field's built-in format check) intercepts the
      // submit event before this handler ever runs — silently blocking
      // submission and showing a native browser tooltip instead of the
      // form's own styled, accessible inline error messages below.
      noValidate
      className={cn(
        "w-full rounded-3xl border border-[var(--color-navy-950)]/8 bg-white/95 shadow-[0_20px_60px_-24px_rgba(10,26,48,0.35)]",
        compact ? "p-4 sm:p-5" : "p-5 sm:p-7",
      )}
    >
      {/* Trip type */}
      <div className="mb-5 flex gap-1 rounded-full bg-[var(--color-cream-100)] p-1 sm:inline-flex">
        {TRIP_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => changeTripType(t)}
            className={cn(
              "min-h-9 flex-1 whitespace-nowrap rounded-full px-2.5 py-2 text-xs font-semibold tracking-wide transition-colors sm:flex-none sm:px-4 sm:text-sm",
              tripType === t ? "bg-[var(--color-navy-950)] text-white shadow" : "text-[var(--color-navy-800)] hover:text-[var(--color-navy-950)]",
            )}
          >
            {TRIP_TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Segments */}
      <div className="space-y-3">
        {segments.map((segment, i) => (
          <div key={i}>
            <SegmentRow
              index={i}
              segment={segment}
              minDate={i === 0 ? todayFloor() : segments[i - 1]?.departureDate ? new Date(`${segments[i - 1].departureDate}T00:00:00`) : todayFloor()}
              onChange={(s) => updateSegment(i, s)}
              onRemove={() => removeSegment(i)}
              showRemove={tripType === "MULTI_CITY" && segments.length > 2}
              returnDate={i === 0 && tripType === "ROUND_TRIP" ? returnDate : undefined}
              fromExtras={i === 0 ? originExtras : undefined}
              errors={{
                from: errors[`segments.${i}.from`],
                to: errors[`segments.${i}.to`],
                departureDate: errors[`segments.${i}.departureDate`],
              }}
            />
          </div>
        ))}

        {tripType === "MULTI_CITY" && segments.length < 6 && (
          <button
            type="button"
            onClick={addSegment}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-dashed border-[var(--color-navy-950)]/25 px-4 py-2 text-xs font-semibold text-[var(--color-navy-800)] hover:border-[var(--color-gold-500)] hover:text-[var(--color-gold-600)]"
          >
            <Plus size={14} /> Add another flight
          </button>
        )}
      </div>

      {/* Return date + travelers/cabin */}
      <div className={cn("mt-3 grid grid-cols-1 gap-3", tripType === "ROUND_TRIP" ? "sm:grid-cols-2" : "sm:grid-cols-1 sm:max-w-xs")}>
        {tripType === "ROUND_TRIP" && (
          <div id="field-returnDate">
            <DateField
              label="Return Date"
              value={returnDate}
              onChange={setReturnDate}
              minDate={firstDeparture}
              rangeStart={segments[0]?.departureDate || undefined}
              error={errors.returnDate}
            />
          </div>
        )}
        <PassengerCabinField
          passengers={passengers}
          onPassengersChange={setPassengers}
          cabinClass={cabinClass}
          onCabinClassChange={setCabinClass}
        />
      </div>
      {errors.infants && <FieldError>{errors.infants}</FieldError>}
      {errors.adults && <FieldError>{errors.adults}</FieldError>}

      {/* More options */}
      <button
        type="button"
        onClick={() => setShowMore((v) => !v)}
        className="mt-2 inline-flex min-h-8 items-center text-xs font-semibold text-[var(--color-navy-700)] underline decoration-dotted underline-offset-4 hover:text-[var(--color-gold-600)]"
      >
        {showMore ? "Hide additional preferences" : "Add preferences (airline, budget, notes)"}
      </button>
      <AnimatePresence>
        {showMore && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {/* One mutually exclusive choice (native radios: arrow keys move and select, Tab leaves the group). The inputs are visually hidden and the
                  labels are the targets; the focus ring and the selected colour are on the label. Default: exact dates. */}
              <fieldset className="rounded-xl border border-[var(--color-navy-950)]/12 bg-white px-3.5 pb-3 pt-2 sm:col-span-3">
                <legend className="px-1 text-xs font-semibold tracking-wide text-[var(--color-navy-700)]">Date flexibility</legend>
                <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {DATE_FLEXIBILITY_DAYS.map((days) => {
                    const selected = dateFlexibilityDays === days;
                    return (
                      <label
                        key={days}
                        className={cn(
                          "flex min-h-11 cursor-pointer items-center justify-center rounded-lg border px-3 py-2 text-center text-sm font-medium transition-colors focus-within:ring-2 focus-within:ring-[var(--color-gold-400)]/55",
                          selected
                            ? "border-[var(--color-navy-900)] bg-[var(--color-navy-900)] text-white"
                            : "border-[var(--color-navy-950)]/12 bg-white text-[var(--color-navy-900)] hover:border-[var(--color-navy-700)]",
                        )}
                      >
                        <input
                          type="radio"
                          name="dateFlexibility"
                          value={days}
                          checked={selected}
                          onChange={() => setDateFlexibilityDays(days)}
                          className="sr-only"
                        />
                        {DATE_FLEXIBILITY_LABEL[days]}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <div>
                <label htmlFor="preferredAirline" className="mb-1.5 block text-xs font-semibold tracking-wide text-[var(--color-navy-700)]">
                  Preferred Airline (optional)
                </label>
                <input
                  id="preferredAirline"
                  value={preferredAirline}
                  onChange={(e) => setPreferredAirline(e.target.value)}
                  placeholder="e.g. Emirates"
                  className="w-full rounded-xl border border-[var(--color-navy-950)]/12 bg-white px-3.5 py-3 text-sm outline-none focus:border-[var(--color-navy-700)] focus:ring-2 focus:ring-[var(--color-gold-400)]/55"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="budget"className="mb-1.5 block text-xs font-semibold tracking-wide text-[var(--color-navy-700)]">
                  Approximate Budget (optional)
                </label>
                <div className="flex gap-2">
                  <select
                    id="budgetCurrency"
                    aria-label="Budget currency"
                    value={budgetCurrency}
                    onChange={(e) => setBudgetCurrency(e.target.value as BudgetCurrency)}
                    className="w-[5.25rem] shrink-0 rounded-xl border border-[var(--color-navy-950)]/12 bg-white px-2.5 py-3 text-sm outline-none focus:border-[var(--color-navy-700)] focus:ring-2 focus:ring-[var(--color-gold-400)]/55"
                  >
                    {BUDGET_CURRENCIES.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                  <input
                    id="budget"
                    type="number"
                    min={0}
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    placeholder="e.g. 4000"
                    className="min-w-0 flex-1 rounded-xl border border-[var(--color-navy-950)]/12 bg-white px-3.5 py-3 text-sm outline-none focus:border-[var(--color-navy-700)] focus:ring-2 focus:ring-[var(--color-gold-400)]/55"
                  />
                </div>
              </div>
              <div className="sm:col-span-3">
                <label htmlFor="notes" className="mb-1.5 block text-xs font-semibold tracking-wide text-[var(--color-navy-700)]">
                  Anything else we should know? (optional)
                </label>
                <textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Seat preferences, connecting travelers, special requests…"
                  className="w-full rounded-xl border border-[var(--color-navy-950)]/12 bg-white px-3.5 py-3 text-sm outline-none focus:border-[var(--color-navy-700)] focus:ring-2 focus:ring-[var(--color-gold-400)]/55"
                />
              </div>
            </div>
          </m.div>
        )}
      </AnimatePresence>

      {/* Contact */}
      <div className="mt-6 border-t border-[var(--color-navy-950)]/8 pt-5">
        {/* Not a heading element — this form embeds on multiple pages with
            different heading structures around it (e.g. straight after the
            page's own <h1>, with no <h2> in between), and a form-section
            label like this shouldn't have to participate in whatever page
            outline it happens to land in to avoid skipping a heading level. */}
        <p className="mb-3 text-sm font-semibold text-[var(--color-navy-900)]">Your Contact Details</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div id="field-firstName">
            <label htmlFor="firstName" className="mb-1.5 block text-xs font-semibold tracking-wide text-[var(--color-navy-700)]">
              First Name
            </label>
            <input
              id="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoComplete="given-name"
              aria-invalid={Boolean(errors.firstName)}
              aria-describedby={errors.firstName ? "firstName-error" : undefined}
              className={cn(
                "w-full rounded-xl border bg-white px-3.5 py-3 text-sm outline-none focus:border-[var(--color-navy-700)] focus:ring-2 focus:ring-[var(--color-gold-400)]/55",
                errors.firstName ? "border-red-500" : "border-[var(--color-navy-950)]/12",
              )}
            />
            {errors.firstName && <FieldError id="firstName-error">{errors.firstName}</FieldError>}
          </div>
          <div id="field-lastName">
            <label htmlFor="lastName" className="mb-1.5 block text-xs font-semibold tracking-wide text-[var(--color-navy-700)]">
              Last Name
            </label>
            <input
              id="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              autoComplete="family-name"
              aria-invalid={Boolean(errors.lastName)}
              aria-describedby={errors.lastName ? "lastName-error" : undefined}
              className={cn(
                "w-full rounded-xl border bg-white px-3.5 py-3 text-sm outline-none focus:border-[var(--color-navy-700)] focus:ring-2 focus:ring-[var(--color-gold-400)]/55",
                errors.lastName ? "border-red-500" : "border-[var(--color-navy-950)]/12",
              )}
            />
            {errors.lastName && <FieldError id="lastName-error">{errors.lastName}</FieldError>}
          </div>
          <div id="field-email">
            <label htmlFor="email" className="mb-1.5 block text-xs font-semibold tracking-wide text-[var(--color-navy-700)]">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                // Once an error is showing, it clears the moment the address becomes valid (no need to leave the field first).
                if (errors.email && checkEmail(e.target.value).ok) setErrors((prev) => without(prev, "email"));
              }}
              onBlur={checkEmailOnBlur}
              autoComplete="email"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "email-error" : undefined}
              className={cn(
                "w-full rounded-xl border bg-white px-3.5 py-3 text-sm outline-none focus:border-[var(--color-navy-700)] focus:ring-2 focus:ring-[var(--color-gold-400)]/55",
                errors.email ? "border-red-500" : "border-[var(--color-navy-950)]/12",
              )}
            />
            {errors.email && <FieldError id="email-error">{errors.email}</FieldError>}
          </div>
          <PhoneNumberField
            id="phone"
            label="Phone Number"
            value={phone}
            onChange={(next) => {
              setPhone(next);
              // As with the email: a showing phone error is cleared as soon as the number is acceptable.
              if (errors.phone) {
                const state = getPhoneValidatorState();
                if (state.state === "ready" && next && !state.errorFor(next, FLIGHT_PHONE_MESSAGES)) setErrors((prev) => without(prev, "phone"));
              }
            }}
            error={errors.phone}
            suggestedCountry={hint?.countryCode}
            onBlurValue={checkPhoneOnBlur}
          />
        </div>

        {/* Honeypot — hidden from real visitors via CSS, left in the tab
            order-free DOM for bots that fill every field programmatically. */}
        <div className="hidden" aria-hidden="true">
          <label htmlFor="website">Website</label>
          <input id="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </div>
      </div>

      {result.status === "error" && (
        <div role="alert" className="mt-5 flex items-start gap-2.5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <p>{result.message}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={busy}
        // Opts this button into FloatingDealsButton's own visibility check —
        // that button is fixed bottom-right and would otherwise sit on top
        // of this full-width CTA (and intercept taps meant for it) while
        // it's mid-scroll into view on narrow screens.
        data-hide-floating-cta
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[var(--color-navy-950)] px-6 py-4 text-base font-semibold text-white shadow-lg transition-colors hover:bg-[var(--color-gold-600)] disabled:opacity-70"
      >
        {busy ? (
          <>
            <Loader2 size={18} className="animate-spin" /> Submitting your request…
          </>
        ) : (
          PRIMARY_CTA_LABEL
        )}
      </button>
      <p className="mt-3 text-center text-xs text-[var(--color-navy-950)]/65">
        No payment required. A travel specialist will contact you with options.
      </p>
      <QuoteConsentNotice />
    </form>
  );
}

function SuccessPanel({
  summary,
}: {
  summary: {
    tripType: string;
    route: string;
    departureDate: string;
    returnDate?: string;
    passengers: number;
    cabinClass: string;
    dateFlexibility?: string;
  };
}) {
  return (
    <m.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="w-full rounded-3xl border border-[var(--color-navy-950)]/8 bg-white p-5 text-center shadow-[0_20px_60px_-24px_rgba(10,26,48,0.35)] sm:p-10"
    >
      <CheckCircle2 className="mx-auto h-14 w-14 text-[var(--color-gold-600)]" aria-hidden="true" />
      <h3 className="mt-4 font-display text-2xl font-semibold text-[var(--color-navy-950)]">Your Flight Request Has Been Received</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-[var(--color-navy-950)]/70">
        Thank you for your request. One of our travel specialists will review your travel details and follow up with suitable flight
        options.
      </p>
      <p className="mx-auto mt-2 max-w-md text-sm text-[var(--color-navy-950)]/70">
        We appreciate the opportunity to assist with your trip and will be in touch using the contact information you provided.
      </p>

      <dl className="mx-auto mt-6 grid max-w-md grid-cols-2 gap-x-6 gap-y-3 rounded-2xl bg-[var(--color-cream-100)] p-5 text-left text-sm">
        <dt className="text-[var(--color-navy-950)]/65">Route</dt>
        <dd className="font-medium text-[var(--color-navy-950)]">{summary.route}</dd>
        <dt className="text-[var(--color-navy-950)]/65">Departure</dt>
        <dd className="font-medium text-[var(--color-navy-950)]">{summary.departureDate}</dd>
        {summary.returnDate && (
          <>
            <dt className="text-[var(--color-navy-950)]/65">Return</dt>
            <dd className="font-medium text-[var(--color-navy-950)]">{summary.returnDate}</dd>
          </>
        )}
        {summary.dateFlexibility && (
          <>
            <dt className="text-[var(--color-navy-950)]/65">Date flexibility</dt>
            <dd className="font-medium text-[var(--color-navy-950)]">{summary.dateFlexibility}</dd>
          </>
        )}
        <dt className="text-[var(--color-navy-950)]/65">Travelers</dt>
        <dd className="font-medium text-[var(--color-navy-950)]">{summary.passengers}</dd>
        <dt className="text-[var(--color-navy-950)]/65">Cabin</dt>
        <dd className="font-medium text-[var(--color-navy-950)]">{summary.cabinClass.replace("_", " ")}</dd>
      </dl>
    </m.div>
  );
}
