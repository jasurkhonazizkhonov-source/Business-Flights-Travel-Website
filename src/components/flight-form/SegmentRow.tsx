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
}: {
  index: number;
  segment: SegmentState;
  minDate: Date;
  onChange: (segment: SegmentState) => void;
  onRemove?: () => void;
  errors?: { from?: string; to?: string; departureDate?: string };
  showRemove?: boolean;
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
      <AirportAutocomplete
        label={`Flight ${index + 1} — From`}
        value={segment.from}
        onChange={(a) => onChange({ ...segment, from: a })}
        icon="from"
        error={errors?.from}
      />
      <AirportAutocomplete
        label="To"
        value={segment.to}
        onChange={(a) => onChange({ ...segment, to: a })}
        icon="to"
        error={errors?.to}
      />
      <DateField
        label="Departure Date"
        value={segment.departureDate}
        onChange={(iso) => onChange({ ...segment, departureDate: iso })}
        minDate={minDate}
        error={errors?.departureDate}
      />
    </div>
  );
}
