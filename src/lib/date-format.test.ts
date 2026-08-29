import { describe, it, expect } from "vitest";
import {
  formatShortDate,
  formatDate,
  formatDateWithWeekday,
  formatTime,
  formatDateTime,
  formatWeekRange,
} from "./date-format";

const ISO = "2026-08-27T09:05:00.000Z"; // an ISO instant, not a business date

describe("date-format (CC-date: no shared formatter, 6+ inconsistent shapes across the app)", () => {
  it("formatShortDate: day and month, no year", () => {
    expect(formatShortDate(ISO)).toBe("27 Aug");
  });

  it("formatDate: day, month and year", () => {
    expect(formatDate(ISO)).toBe("27 Aug 2026");
  });

  it("formatDateWithWeekday: weekday, day and month, no year", () => {
    expect(formatDateWithWeekday(ISO)).toBe("Thu 27 Aug");
  });

  it("formatTime: 12-hour clock with an uppercase AM/PM regardless of locale casing", () => {
    expect(formatTime(ISO)).toBe("02:35 PM");
  });

  it("formatDateTime: day, month and time, no year", () => {
    expect(formatDateTime(ISO)).toBe("27 Aug, 02:35 PM");
  });

  it("formatWeekRange: an inclusive range, year only on the end date", () => {
    expect(formatWeekRange("2026-08-24", "2026-08-30")).toBe("24 Aug – 30 Aug 2026");
  });

  it("a bare YYYY-MM-DD business-date string is treated as local midnight, not UTC midnight", () => {
    // If this parsed as UTC, a negative-UTC-offset timezone would render the
    // 23rd instead of the 24th -- the exact bug several call sites already
    // worked around individually with `new Date(d + "T00:00:00")`.
    expect(formatDate("2026-08-24")).toBe("24 Aug 2026");
  });

  it("accepts a Date object directly, not just a string", () => {
    expect(formatDate(new Date("2026-08-27T09:05:00.000Z"))).toBe("27 Aug 2026");
  });
});
