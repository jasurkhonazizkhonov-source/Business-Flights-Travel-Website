"use client";

import { X } from "lucide-react";
import { AirportAutocomplete } from "./AirportAutocomplete";
import { DateField } from "./DateField";
import type { AirportOption } from "@/lib/validations/flight-request";

export type SegmentState = {
  from: AirportOption | null;
  to: AirportOption | null;
  departureDate: string;
};

export function SegmentRow({
  index,
  segment,
  minDate,
  onChange,
  onRemove,
  errors,
  showRemove,
  returnDate,
  fromExtras,
}: {
  index: number;
  segment: SegmentState;
  minDate: Date;
  onChange: (segment: SegmentState) => void;
  onRemove?: () => void;
  errors?: { from?: string; to?: string; departureDate?: string };
  showRemove?: boolean;
  /** Round trip, first leg only: the chosen return date (ISO), shown as a highlighted range when the departure calendar is opened. */
  returnDate?: string;
  /** First segment only: the "Suggested" tag, its spoken note and the typing signal for the origin field (see FlightRequestForm). */
  fromExtras?: { labelAction: React.ReactNode; describedBy?: string; onEdit?: () => void };
}) {
  return (
    <div className="relative grid grid-cols-1 gap-3 rounded-2xl border border-[var(--color-navy-950)]/8 bg-[var(--color-cream-50)]/60 p-3 sm:grid-cols-[1fr_1fr_1fr] sm:p-3.5">
      {showRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove flight ${index + 1}`}
          className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-navy-950)] text-white shadow hover:bg-red-600"
        >
          <X size={14} />
        </button>
      )}
      {/* The `field-<error key>` wrappers are what the submit handler scrolls to / focuses (focusFieldError) when
          this segment has an error. Only the FIRST segment's origin had one (on the row in FlightRequestForm), so a
          missing destination or date — and any error on a multi-city leg — never scrolled into view. */}
      <div id={`field-segments.${index}.from`}>
        <AirportAutocomplete
          label={`Flight ${index + 1} — From`}
          value={segment.from}
          onChange={(a) => onChange({ ...segment, from: a })}
          icon="from"
          error={errors?.from}
          onClear={() => onChange({ ...segment, from: null })}
          labelAction={fromExtras?.labelAction}
          describedBy={fromExtras?.describedBy}
          onEdit={fromExtras?.onEdit}
        />
      </div>
      <div id={`field-segments.${index}.to`}>
        <AirportAutocomplete
          label="To"
          value={segment.to}
          onChange={(a) => onChange({ ...segment, to: a })}
          icon="to"
          error={errors?.to}
          onClear={() => onChange({ ...segment, to: null })}
        />
      </div>
      <div id={`field-segments.${index}.departureDate`}>
        <DateField
          label="Departure Date"
          value={segment.departureDate}
          onChange={(iso) => onChange({ ...segment, departureDate: iso })}
          minDate={minDate}
          rangeEnd={returnDate || undefined}
          error={errors?.departureDate}
        />
      </div>
    </div>
  );
}
