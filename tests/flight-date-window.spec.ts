import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  MAX_ADVANCE_MONTHS,
  addCalendarMonths,
  clientDateWindow,
  dateProblem,
  daysInMonth,
  formatIsoDate,
  parseIsoDate,
  serverDateWindow,
  todayAtUtcOffset,
  windowFromToday,
} from "../src/lib/flight-date-window";
import { createFlightRequestSchema } from "../src/lib/validations/flight-request";

// The 11-month rule: a flight may be requested from today until ELEVEN CALENDAR MONTHS after today (inclusive). These pin the arithmetic
// (month ends, leap years, year rollover), both edges of the window, the browser/server agreement, and independence from the machine's
// time zone and daylight-saving changes. Nothing here depends on the real date: every case fixes its own "today".

const d = (year: number, month: number, day: number) => ({ year, month, day });
const add = (year: number, month: number, day: number, months = MAX_ADVANCE_MONTHS) => formatIsoDate(addCalendarMonths(d(year, month, day), months));

test.describe("calendar-month arithmetic", () => {
  test("the example from the brief: 15 November + 11 months is 15 October of the next year", () => {
    expect(add(2026, 11, 15)).toBe("2027-10-15");
  });

  test("a day that does not exist in the target month is clamped to its last day, never rolled into the next month", () => {
    expect(add(2026, 1, 31)).toBe("2026-12-31"); // December has 31
    expect(add(2026, 3, 31)).toBe("2027-02-28"); // February 2027 has 28 - not 3 March
    expect(add(2027, 3, 31)).toBe("2028-02-29"); // February 2028 (leap) has 29 - not 2 March
    expect(add(2026, 12, 31)).toBe("2027-11-30"); // November has 30 - not 1 December
    expect(add(2026, 4, 30)).toBe("2027-03-30");
    expect(add(2027, 3, 30)).toBe("2028-02-29");
    expect(add(2027, 1, 30, 1)).toBe("2027-02-28"); // the classic setMonth trap: 30 Jan + 1 month
  });

  test("leap days: 29 February + 11 months, and a window that ends on 29 February", () => {
    expect(add(2028, 2, 29)).toBe("2029-01-29");
    expect(add(2027, 3, 29)).toBe("2028-02-29");
    expect(add(2027, 3, 31)).toBe("2028-02-29");
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2100, 2)).toBe(28); // century year that is not a leap year
    expect(daysInMonth(2000, 2)).toBe(29); // ... and one that is
  });

  test("year rollover, forwards and backwards", () => {
    expect(add(2026, 1, 15)).toBe("2026-12-15");
    expect(add(2026, 2, 1)).toBe("2027-01-01");
    expect(add(2026, 12, 1)).toBe("2027-11-01");
    expect(add(2026, 1, 15, -1)).toBe("2025-12-15");
    expect(add(2026, 1, 15, 12)).toBe("2027-01-15");
    expect(add(2026, 1, 15, 0)).toBe("2026-01-15");
  });

  test("for EVERY day of two years the result is exactly 11 months later (never 10, never 12) and never a different day of the month unless clamped", () => {
    for (const year of [2027, 2028]) {
      for (let month = 1; month <= 12; month++) {
        for (let day = 1; day <= daysInMonth(year, month); day++) {
          const result = addCalendarMonths(d(year, month, day), MAX_ADVANCE_MONTHS);
          expect(result.year * 12 + result.month - (year * 12 + month), `${year}-${month}-${day}`).toBe(11);
          expect(result.day, `${year}-${month}-${day}`).toBe(Math.min(day, daysInMonth(result.year, result.month)));
        }
      }
    }
  });
});

test.describe("ISO date parsing", () => {
  test("real dates parse; impossible or loosely formatted ones do not", () => {
    expect(parseIsoDate("2028-02-29")).toEqual(d(2028, 2, 29));
    for (const bad of ["2027-02-29", "2026-02-30", "2026-04-31", "2026-13-01", "2026-00-10", "2026-01-00", "2026-1-5", "26-01-05", "2026/01/05", "", "tomorrow", " 2026-01-05", "2026-01-05T00:00:00"]) {
      expect(parseIsoDate(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

test.describe("the window and its two edges", () => {
  const today = d(2026, 11, 15);
  const window = windowFromToday(today);

  test("min is today and max is today + 11 months, both inclusive", () => {
    expect(window).toEqual({ min: "2026-11-15", max: "2027-10-15" });
    expect(dateProblem("2026-11-15", window)).toBeNull(); // today
    expect(dateProblem("2027-10-15", window)).toBeNull(); // exactly 11 months
    expect(dateProblem("2027-10-14", window)).toBeNull();
  });

  test("one day before today is in the past; one day after the limit is too far", () => {
    expect(dateProblem("2026-11-14", window)).toBe("past");
    expect(dateProblem("2027-10-16", window)).toBe("too_far");
    expect(dateProblem("2028-01-01", window)).toBe("too_far");
    expect(dateProblem("2020-01-01", window)).toBe("past");
  });

  test("not a date at all", () => {
    expect(dateProblem("2027-02-30", window)).toBe("invalid");
    expect(dateProblem("soon", window)).toBe("invalid");
  });

  test("month-end: from 31 March the limit is the last day of February; the next day is refused", () => {
    const w = windowFromToday(d(2027, 3, 31));
    expect(w.max).toBe("2028-02-29");
    expect(dateProblem("2028-02-29", w)).toBeNull();
    expect(dateProblem("2028-03-01", w)).toBe("too_far");
  });

  test("leap year: from 29 February 2028 the limit is 29 January 2029", () => {
    const w = windowFromToday(d(2028, 2, 29));
    expect(w).toEqual({ min: "2028-02-29", max: "2029-01-29" });
    expect(dateProblem("2029-01-29", w)).toBeNull();
    expect(dateProblem("2029-01-30", w)).toBe("too_far");
  });

  test("year transition: from 31 December the limit is 30 November", () => {
    const w = windowFromToday(d(2026, 12, 31));
    expect(w).toEqual({ min: "2026-12-31", max: "2027-11-30" });
  });
});

test.describe("browser and server windows", () => {
  test("the browser window uses the visitor's own calendar date, not the clock time of day", () => {
    // Local-time constructors: the same calendar date at 00:00:00 and at 23:59:59 give the same window.
    for (const [h, m, s] of [[0, 0, 0], [0, 0, 1], [12, 0, 0], [23, 59, 59]]) {
      expect(clientDateWindow(new Date(2026, 10, 15, h, m, s))).toEqual({ min: "2026-11-15", max: "2027-10-15" });
    }
  });

  test("the server accepts the widest window any time zone could produce: one day earlier at the start, one day later at the end", () => {
    // 2026-11-15 12:00 UTC: UTC-12 is 00:00 on the 15th, UTC+14 is 02:00 on the 16th.
    const now = new Date(Date.UTC(2026, 10, 15, 12, 0, 0));
    expect(todayAtUtcOffset(now, -12 * 60)).toEqual(d(2026, 11, 15));
    expect(todayAtUtcOffset(now, 14 * 60)).toEqual(d(2026, 11, 16));
    expect(serverDateWindow(now)).toEqual({ min: "2026-11-15", max: "2027-10-16" });
    // 2026-11-15 05:00 UTC: UTC-12 is still the 14th (17:00).
    // 2026-11-15 05:00 UTC: UTC-12 is still the 14th (17:00); UTC+14 is 19:00 on the 15th.
    expect(serverDateWindow(new Date(Date.UTC(2026, 10, 15, 5, 0, 0)))).toEqual({ min: "2026-11-14", max: "2027-10-15" });
  });

  test("a visitor in any zone is never refused the dates their own calendar offered", () => {
    // Sweep a whole day of instants: whatever the zone's local "today" is, the server window must contain the visitor's [today, today + 11 months].
    for (let hour = 0; hour < 24; hour++) {
      const now = new Date(Date.UTC(2026, 10, 15, hour, 0, 0));
      const server = serverDateWindow(now);
      for (let offset = -12; offset <= 14; offset++) {
        const visitor = windowFromToday(todayAtUtcOffset(now, offset * 60));
        expect(server.min <= visitor.min, `hour ${hour}, UTC${offset >= 0 ? "+" : ""}${offset}`).toBe(true);
        expect(server.max >= visitor.max, `hour ${hour}, UTC${offset >= 0 ? "+" : ""}${offset}`).toBe(true);
      }
    }
  });
});

// The same arithmetic run inside separate Node processes in several time zones, including ones either side of the date line and two with daylight-saving
// changes on dates this test crosses. If the machine cannot switch zones the child reports the zone it really got and the case is skipped rather than
// passing for the wrong reason.
test.describe("independent of the machine's time zone and daylight saving", () => {
  const moduleUrl = pathToFileURL(path.resolve(__dirname, "../src/lib/flight-date-window.ts")).href;
  const zones = ["America/Los_Angeles", "Europe/Berlin", "Asia/Tashkent", "Pacific/Kiritimati", "Pacific/Pago_Pago", "Australia/Lord_Howe"];
  // Instants around the US spring-forward (2026-03-08 02:00 local) and fall-back (2026-11-01 02:00), the EU ones (2026-03-29, 2026-10-25) and
  // local midnight on a handful of days; plus the exact start of the window's last day.
  const script = `
    const m = await import(${JSON.stringify(moduleUrl)});
    const cases = [
      [2026, 2, 8, 1, 59], [2026, 2, 8, 3, 0], [2026, 10, 1, 0, 30], [2026, 10, 1, 1, 30], [2026, 2, 29, 1, 30], [2026, 9, 25, 2, 30],
      [2026, 10, 15, 0, 0], [2026, 10, 15, 23, 59], [2026, 11, 31, 0, 0], [2027, 1, 28, 12, 0],
    ];
    const out = cases.map(([y, mo, da, h, mi]) => {
      const w = m.clientDateWindow(new Date(y, mo, da, h, mi, 0));
      const t = m.localToday(new Date(y, mo, da, h, mi, 0));
      return [m.formatIsoDate(t), w.min, w.max];
    });
    console.log(JSON.stringify({ zone: Intl.DateTimeFormat().resolvedOptions().timeZone, out }));
  `;
  for (const zone of zones) {
    test(`window arithmetic in ${zone}`, () => {
      const raw = execFileSync(process.execPath, ["--input-type=module", "-e", script], { env: { ...process.env, TZ: zone }, encoding: "utf8" });
      const { zone: got, out } = JSON.parse(raw.trim().split("\n").pop()!) as { zone: string; out: [string, string, string][] };
      test.skip(got !== zone, `this machine did not switch to ${zone} (got ${got})`);
      for (const [today, min, max] of out) {
        // min is always the local calendar day itself and max is exactly 11 calendar months later, whatever the clock did that day.
        expect(min).toBe(today);
        const [y, mo, da] = today.split("-").map(Number);
        expect(max).toBe(formatIsoDate(addCalendarMonths(d(y, mo, da), 11)));
      }
    });
  }
});

test.describe("the server schema applies the same window", () => {
  const NOW = new Date(Date.UTC(2026, 10, 15, 12, 0, 0)); // server window: 2026-11-15 .. 2027-10-16 (see above)
  const schema = createFlightRequestSchema(() => NOW);
  const airport = (iata: string) => ({ iata, city: "City", name: "Airport", country: "Country" });
  const base = {
    tripType: "ONE_WAY" as const,
    segments: [{ from: airport("FRA"), to: airport("JFK"), departureDate: "2026-12-01" }],
    cabinClass: "BUSINESS" as const,
    adults: 1,
    children: 0,
    infants: 0,
    flexibleDates: false,
    firstName: "Test",
    lastName: "Person",
    email: "test.person@example.com",
    phone: "+14155709267",
  };
  const withDeparture = (departureDate: string, extra: Record<string, unknown> = {}) => ({ ...base, ...extra, segments: [{ ...base.segments[0], departureDate }] });
  const firstIssue = (input: unknown) => {
    const r = schema.safeParse(input);
    return r.success ? null : { path: r.error.issues[0].path.join("."), message: r.error.issues[0].message };
  };

  test("today, the exact 11-month date and the server's one-day tolerance pass", () => {
    expect(schema.safeParse(withDeparture("2026-11-15")).success).toBe(true);
    expect(schema.safeParse(withDeparture("2027-10-15")).success).toBe(true);
    expect(schema.safeParse(withDeparture("2027-10-16")).success).toBe(true); // the tolerance for a visitor 14 hours ahead of UTC
  });

  test("a day beyond the tolerance, far dates and past dates are refused with the right field and message", () => {
    expect(firstIssue(withDeparture("2027-10-17"))).toEqual({ path: "segments.0.departureDate", message: "Flights can be requested up to 11 months ahead. Please choose an earlier date." });
    expect(firstIssue(withDeparture("2028-06-01"))?.path).toBe("segments.0.departureDate");
    expect(firstIssue(withDeparture("2026-11-13"))).toEqual({ path: "segments.0.departureDate", message: "Departure date cannot be in the past" });
    expect(firstIssue(withDeparture("2026-02-30"))?.path).toBe("segments.0.departureDate"); // not a real date
  });

  test("the return date obeys the same latest date, and may not precede the departure", () => {
    const round = (departureDate: string, returnDate: string) => ({ ...withDeparture(departureDate), tripType: "ROUND_TRIP" as const, returnDate });
    expect(schema.safeParse(round("2027-09-01", "2027-10-15")).success).toBe(true); // return on the exact limit
    expect(firstIssue(round("2027-09-01", "2027-10-17"))).toEqual({ path: "returnDate", message: "Flights can be requested up to 11 months ahead. Please choose an earlier date." });
    expect(firstIssue(round("2026-12-10", "2026-12-09"))).toEqual({ path: "returnDate", message: "Return date must be on or after the departure date" });
    expect(schema.safeParse(round("2026-12-10", "2026-12-10")).success).toBe(true); // same-day return
  });

  test("one-way, round-trip and multi-city all pass through the same rule; multi-city legs must be in date order", () => {
    expect(schema.safeParse(withDeparture("2027-10-15")).success).toBe(true); // one-way
    const multi = (a: string, b: string) => ({
      ...base,
      tripType: "MULTI_CITY" as const,
      segments: [
        { from: airport("FRA"), to: airport("JFK"), departureDate: a },
        { from: airport("JFK"), to: airport("LAX"), departureDate: b },
      ],
    });
    expect(schema.safeParse(multi("2027-01-10", "2027-10-15")).success).toBe(true);
    expect(firstIssue(multi("2027-01-10", "2027-10-17"))?.path).toBe("segments.1.departureDate");
    expect(firstIssue(multi("2027-02-10", "2027-01-10"))).toEqual({ path: "segments", message: "Each flight must be on or after the previous one" });
  });
});
