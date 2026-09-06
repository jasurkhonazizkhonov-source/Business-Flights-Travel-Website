"use client";

import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";

// Split out of DateField.tsx and loaded via next/dynamic so react-day-picker
// and its CSS ship as a separate, non-blocking chunk instead of adding to
// every page's critical initial bundle for a calendar that isn't visible
// until a user actually opens it.
export function DayPickerCalendar(props: React.ComponentProps<typeof DayPicker>) {
  return <DayPicker {...props} />;
}
