"use client";

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { PhoneNumberField } from "@/components/forms/PhoneNumberField";
import { SegmentRow, type SegmentState } from "./SegmentRow";
import { DateField } from "./DateField";
import { PassengerCabinField } from "./PassengerCabinField";
import { submitFlightRequest } from "@/server/actions/submit-flight-request";
import {
  TRIP_TYPES,
  type AirportOption,
  type FlightRequestInput,
} from "@/lib/validations/flight-request";
import { cn } from "@/lib/cn";
import { PRIMARY_CTA_LABEL } from "@/lib/constants";
import { isValidEmail } from "@/lib/validate";
import { isValidPhoneNumber } from "@/lib/phone";

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

export function FlightRequestForm({
  compact = false,
  initialDestination = null,
}: {
  compact?: boolean;
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
  const [flexibleDates, setFlexibleDates] = useState(false);
  const [preferredAirline, setPreferredAirline] = useState("");
  const [budget, setBudget] = useState("");
  const [notes, setNotes] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState<string | undefined>(undefined);
  const [website, setWebsite] = useState(""); // honeypot
  const [renderedAt] = useState(() => Date.now());
  const [showMore, setShowMore] = useState(false);

  const [errors, setErrors] = useState<FormErrors>({});
  const [pending, startTransition] = useTransition();
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
    setSegments((prev) => prev.map((s, i) => (i === index ? next : s)));
  }

  function addSegment() {
    if (segments.length >= 6) return;
    setSegments((prev) => [...prev, { ...emptySegment }]);
  }

  function removeSegment(index: number) {
    setSegments((prev) => (prev.length > 2 ? prev.filter((_, i) => i !== index) : prev));
  }

  const firstDeparture = segments[0]?.departureDate ? new Date(`${segments[0].departureDate}T00:00:00`) : todayFloor();

  function validateClientSide(): FormErrors {
    const e: FormErrors = {};
    segments.forEach((s, i) => {
      if (!s.from) e[`segments.${i}.from`] = "Select an origin";
      if (!s.to) e[`segments.${i}.to`] = "Select a destination";
      if (!s.departureDate) e[`segments.${i}.departureDate`] = "Select a date";
    });
    if (tripType === "ROUND_TRIP" && !returnDate) e.returnDate = "Select a return date";
    if (!firstName.trim()) e.firstName = "First name is required";
    if (!lastName.trim()) e.lastName = "Last name is required";
    if (!isValidEmail(email)) {
      e.email = "Please enter a valid email address so our travel specialist can contact you about your flight request.";
    }
    if (!phone) {
      e.phone = "Phone number is required";
    } else if (!isValidPhoneNumber(phone)) {
      e.phone = "Please enter a valid phone number, including the complete number, so our travel specialist can reach you.";
    }
    return e;
  }

  function handleSubmit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    const clientErrors = validateClientSide();
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      const firstKey = Object.keys(clientErrors)[0];
      document.getElementById(`field-${firstKey}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
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
      flexibleDates,
      preferredAirline: preferredAirline || undefined,
      budget: budget ? Number(budget) : undefined,
      notes: notes || undefined,
      firstName,
      lastName,
      email,
      phone: phone ?? "",
      website,
      renderedAt,
    };

    startTransition(async () => {
      const res = await submitFlightRequest(payload);
      if (res.ok) {
        setResult({ status: "success", summary: res.summary });
      } else {
        setErrors(res.fieldErrors ?? {});
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
      className={cn(
        "w-full rounded-3xl border border-[var(--color-navy-950)]/8 bg-white/95 shadow-[0_20px_60px_-24px_rgba(10,26,48,0.35)]",
        compact ? "p-4 sm:p-5" : "p-5 sm:p-7",
      )}
    >
      {/* Trip type */}
      <div className="mb-5 flex flex-wrap gap-1 rounded-full bg-[var(--color-cream-100)] p-1 sm:inline-flex sm:flex-nowrap">
        {TRIP_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => changeTripType(t)}
            className={cn(
              "min-h-9 flex-1 whitespace-nowrap rounded-full px-3 py-2 text-xs font-semibold tracking-wide transition-colors sm:flex-none sm:px-4 sm:text-sm",
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
          <div id={i === 0 ? "field-segments.0.from" : undefined} key={i}>
            <SegmentRow
              index={i}
              segment={segment}
              minDate={i === 0 ? todayFloor() : segments[i - 1]?.departureDate ? new Date(`${segments[i - 1].departureDate}T00:00:00`) : todayFloor()}
              onChange={(s) => updateSegment(i, s)}
              onRemove={() => removeSegment(i)}
              showRemove={tripType === "MULTI_CITY" && segments.length > 2}
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
            <DateField label="Return Date" value={returnDate} onChange={setReturnDate} minDate={firstDeparture} error={errors.returnDate} />
          </div>
        )}
        <PassengerCabinField
          passengers={passengers}
          onPassengersChange={setPassengers}
          cabinClass={cabinClass}
          onCabinClassChange={setCabinClass}
        />
      </div>
      {errors.infants && <p className="mt-1 text-xs text-red-600">{errors.infants}</p>}
      {errors.adults && <p className="mt-1 text-xs text-red-600">{errors.adults}</p>}

      {/* More options */}
      <button
        type="button"
        onClick={() => setShowMore((v) => !v)}
        className="mt-4 text-xs font-semibold text-[var(--color-navy-700)] underline decoration-dotted underline-offset-4 hover:text-[var(--color-gold-600)]"
      >
        {showMore ? "Hide additional preferences" : "Add preferences (airline, budget, notes)"}
      </button>
      <AnimatePresence>
        {showMore && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="flex items-center gap-2 rounded-xl border border-[var(--color-navy-950)]/12 bg-white px-3.5 py-3 text-sm sm:col-span-3">
                <input
                  type="checkbox"
                  checked={flexibleDates}
                  onChange={(e) => setFlexibleDates(e.target.checked)}
                  className="h-4 w-4 rounded border-[var(--color-navy-950)]/30 accent-[var(--color-navy-900)]"
                />
                My dates are flexible (± a few days)
              </label>
              <div>
                <label htmlFor="preferredAirline" className="mb-1.5 block text-xs font-semibold tracking-wide text-[var(--color-navy-700)]">
                  Preferred Airline (optional)
                </label>
                <input
                  id="preferredAirline"
                  value={preferredAirline}
                  onChange={(e) => setPreferredAirline(e.target.value)}
                  placeholder="e.g. Emirates"
                  className="w-full rounded-xl border border-[var(--color-navy-950)]/12 bg-white px-3.5 py-3 text-sm outline-none focus:border-[var(--color-gold-500)] focus:ring-2 focus:ring-[var(--color-gold-400)]/30"
                />
              </div>
              <div>
                <label htmlFor="budget" className="mb-1.5 block text-xs font-semibold tracking-wide text-[var(--color-navy-700)]">
                  Approximate Budget (USD, optional)
                </label>
                <input
                  id="budget"
                  type="number"
                  min={0}
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder="e.g. 4000"
                  className="w-full rounded-xl border border-[var(--color-navy-950)]/12 bg-white px-3.5 py-3 text-sm outline-none focus:border-[var(--color-gold-500)] focus:ring-2 focus:ring-[var(--color-gold-400)]/30"
                />
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
                  className="w-full rounded-xl border border-[var(--color-navy-950)]/12 bg-white px-3.5 py-3 text-sm outline-none focus:border-[var(--color-gold-500)] focus:ring-2 focus:ring-[var(--color-gold-400)]/30"
                />
              </div>
            </div>
          </motion.div>
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
              className={cn(
                "w-full rounded-xl border bg-white px-3.5 py-3 text-sm outline-none focus:border-[var(--color-gold-500)] focus:ring-2 focus:ring-[var(--color-gold-400)]/30",
                errors.firstName ? "border-red-400" : "border-[var(--color-navy-950)]/12",
              )}
            />
            {errors.firstName && <p className="mt-1 text-xs text-red-600">{errors.firstName}</p>}
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
              className={cn(
                "w-full rounded-xl border bg-white px-3.5 py-3 text-sm outline-none focus:border-[var(--color-gold-500)] focus:ring-2 focus:ring-[var(--color-gold-400)]/30",
                errors.lastName ? "border-red-400" : "border-[var(--color-navy-950)]/12",
              )}
            />
            {errors.lastName && <p className="mt-1 text-xs text-red-600">{errors.lastName}</p>}
          </div>
          <div id="field-email">
            <label htmlFor="email" className="mb-1.5 block text-xs font-semibold tracking-wide text-[var(--color-navy-700)]">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className={cn(
                "w-full rounded-xl border bg-white px-3.5 py-3 text-sm outline-none focus:border-[var(--color-gold-500)] focus:ring-2 focus:ring-[var(--color-gold-400)]/30",
                errors.email ? "border-red-400" : "border-[var(--color-navy-950)]/12",
              )}
            />
            {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
          </div>
          <PhoneNumberField id="phone" label="Phone Number" value={phone} onChange={setPhone} error={errors.phone} />
        </div>

        {/* Honeypot — hidden from real visitors via CSS, left in the tab
            order-free DOM for bots that fill every field programmatically. */}
        <div className="hidden" aria-hidden="true">
          <label htmlFor="website">Website</label>
          <input id="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </div>
      </div>

      {result.status === "error" && (
        <div className="mt-5 flex items-start gap-2.5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <p>{result.message}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        // Opts this button into FloatingDealsButton's own visibility check —
        // that button is fixed bottom-right and would otherwise sit on top
        // of this full-width CTA (and intercept taps meant for it) while
        // it's mid-scroll into view on narrow screens.
        data-hide-floating-cta
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[var(--color-navy-950)] px-6 py-4 text-base font-semibold text-white shadow-lg transition-colors hover:bg-[var(--color-gold-600)] disabled:opacity-70"
      >
        {pending ? (
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
  };
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="w-full rounded-3xl border border-[var(--color-navy-950)]/8 bg-white p-5 text-center shadow-[0_20px_60px_-24px_rgba(10,26,48,0.35)] sm:p-10"
    >
      <CheckCircle2 className="mx-auto h-14 w-14 text-[var(--color-gold-500)]" />
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
        <dt className="text-[var(--color-navy-950)]/65">Travelers</dt>
        <dd className="font-medium text-[var(--color-navy-950)]">{summary.passengers}</dd>
        <dt className="text-[var(--color-navy-950)]/65">Cabin</dt>
        <dd className="font-medium text-[var(--color-navy-950)]">{summary.cabinClass.replace("_", " ")}</dd>
      </dl>
    </motion.div>
  );
}
