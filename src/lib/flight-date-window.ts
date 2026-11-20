// The range of dates a flight request may name: from today until ELEVEN CALENDAR MONTHS after today. One implementation, used by the browser
// (calendar limits, instant validation) and by the server (the authoritative check in src/lib/validations/flight-request.ts), so the two can
// never disagree about where the window ends.
//
// Everything here works on plain calendar dates (year / month / day numbers), never on milliseconds:
//  - "11 months" is calendar-month arithmetic, not 330 or 335 days. 15 Nov + 11 months = 15 Oct of the next year; a start day that does not
//    exist in the target month is CLAMPED to that month's last day (31 Jan + 11 months = 31 Dec, 31 Mar 2027 + 11 months = 29 Feb 2028),
//    never rolled over into the next month (which is what Date#setMonth does, and what turns "11 months" into "12 months" at month ends).
//  - No time-of-day, no time-zone offsets and no daylight-saving arithmetic are ever applied to a date, so a DST change cannot move a boundary.
//
// What "today" is depends on who asks:
//  - the browser uses the visitor's own local calendar date (what their calendar shows);
//  - the server cannot know the visitor's time zone, and its own date can be one day behind or ahead of a visitor's. It therefore accepts the
//    widest window any time zone on Earth could legitimately produce: the earliest "today" is the date at UTC-12 (the last place to reach a new
//    day) and the latest end is 11 months after the date at UTC+14 (the first). A visitor can never be refused for a date their own calendar
//    offered; the price is that the server may accept a date up to one day beyond the strict limit of the server's own zone. That tolerance is
//    deliberate and covered by tests.

export type CalendarDate = { year: number; month: number; day: number };

/** How far ahead a flight may be requested. */
export const MAX_ADVANCE_MONTHS = 11;

/** UTC offsets (minutes) of the westernmost and easternmost inhabited time zones: the extremes of "today" across the world. */
export const EARLIEST_TODAY_OFFSET_MINUTES = -12 * 60;
export const LATEST_TODAY_OFFSET_MINUTES = 14 * 60;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** "YYYY-MM-DD" -> a calendar date, or null for anything that is not a real date ("2026-02-30", "2026-13-01", "2026-1-5", "tomorrow"). */
export function parseIsoDate(value: string): CalendarDate | null {
  const match = ISO_RE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function formatIsoDate(date: CalendarDate): string {
  return `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

/** `months` calendar months after (or, negative, before) `date`; a day that does not exist in the target month is clamped to its last day. */
export function addCalendarMonths(date: CalendarDate, months: number): CalendarDate {
  const index = date.year * 12 + (date.month - 1) + months;
  const year = Math.floor(index / 12);
  const month = index - year * 12 + 1;
  return { year, month, day: Math.min(date.day, daysInMonth(year, month)) };
}

/** The visitor's own calendar date on this machine. */
export function localToday(now: Date = new Date()): CalendarDate {
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

/** The calendar date it is right now in a zone `offsetMinutes` ahead of UTC (negative = behind). Fixed offsets only, so no DST is involved. */
export function todayAtUtcOffset(now: Date, offsetMinutes: number): CalendarDate {
  const shifted = new Date(now.getTime() + offsetMinutes * 60_000);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

export type DateWindow = { min: string; max: string };

/** The window for a given "today": [today, today + 11 months], both ends inclusive, as ISO dates. */
export function windowFromToday(today: CalendarDate): DateWindow {
  return { min: formatIsoDate(today), max: formatIsoDate(addCalendarMonths(today, MAX_ADVANCE_MONTHS)) };
}

/** The strict window as the visitor's own calendar sees it (browser). */
export function clientDateWindow(now: Date = new Date()): DateWindow {
  return windowFromToday(localToday(now));
}

/** The server's window: the widest one any time zone could produce (see the header comment). */
export function serverDateWindow(now: Date = new Date()): DateWindow {
  return {
    min: formatIsoDate(todayAtUtcOffset(now, EARLIEST_TODAY_OFFSET_MINUTES)),
    max: formatIsoDate(addCalendarMonths(todayAtUtcOffset(now, LATEST_TODAY_OFFSET_MINUTES), MAX_ADVANCE_MONTHS)),
  };
}

export type DateProblem = "invalid" | "past" | "too_far";

/** Why `value` is outside `window`, or null when it is a real date inside it. ISO dates compare correctly as strings. */
export function dateProblem(value: string, window: DateWindow): DateProblem | null {
  if (!parseIsoDate(value)) return "invalid";
  if (value < window.min) return "past";
  if (value > window.max) return "too_far";
  return null;
}

/** A Date at local midnight for a calendar date (what the calendar widget wants). Built from numbers, never parsed from a string. */
export function toLocalDate(date: CalendarDate): Date {
  return new Date(date.year, date.month - 1, date.day);
}

export const TOO_FAR_MESSAGE = "Flights can be requested up to 11 months ahead. Please choose an earlier date.";
export const PAST_MESSAGE = "Departure date cannot be in the past";

/** The latest bookable date as a Date at local midnight, for the calendar widget. */
export function maxSelectableDate(now: Date = new Date()): Date {
  const window = clientDateWindow(now);
  return toLocalDate(parseIsoDate(window.max)!);
}
