import { describe, it, expect } from "vitest";
import { addBusinessDays } from "./business-day";
import {
  isWithinLeadTime,
  isWithinMaxAdvance,
  computeRequiredDeposit,
  isInsideCancelWindow,
  DEFAULT_BOOKING_RULES,
} from "./booking-rules";

describe("isWithinLeadTime", () => {
  const rules = { leadTimeMinutes: 30 };
  // 2026-08-28 09:00 Asia/Colombo == 2026-08-28T03:30:00.000Z
  const date = "2026-08-28";
  const time = "09:00";

  it("is true exactly at the lead-time boundary", () => {
    expect(isWithinLeadTime("2026-08-28T03:00:00.000Z", date, time, rules)).toBe(true);
  });

  it("is false one minute inside the boundary (too soon)", () => {
    expect(isWithinLeadTime("2026-08-28T03:01:00.000Z", date, time, rules)).toBe(false);
  });

  it("is true one minute outside the boundary (safely ahead)", () => {
    expect(isWithinLeadTime("2026-08-28T02:59:00.000Z", date, time, rules)).toBe(true);
  });
});

describe("isWithinMaxAdvance", () => {
  const rules = { maxAdvanceDays: 60 };
  const today = "2026-08-28";
  const nowIso = "2026-08-28T10:00:00.000Z"; // still business date 2026-08-28 in Colombo

  it("is true exactly at the max-advance boundary", () => {
    expect(isWithinMaxAdvance(nowIso, addBusinessDays(today, 60), rules)).toBe(true);
  });

  it("is false one day beyond the boundary", () => {
    expect(isWithinMaxAdvance(nowIso, addBusinessDays(today, 61), rules)).toBe(false);
  });

  it("is true for today itself", () => {
    expect(isWithinMaxAdvance(nowIso, today, rules)).toBe(true);
  });
});

describe("computeRequiredDeposit", () => {
  const rules = { depositThreshold: 25_000, depositPct: 20 };

  it("is 0 just under the threshold", () => {
    expect(computeRequiredDeposit(24_999, rules)).toBe(0);
  });

  it("applies the percentage exactly at the threshold", () => {
    expect(computeRequiredDeposit(25_000, rules)).toBe(5_000);
  });

  it("applies the percentage just over the threshold", () => {
    expect(computeRequiredDeposit(25_001, rules)).toBe(5_000); // 5000.2 rounds to 5000
  });

  it("is 0 at 0% even above threshold", () => {
    expect(computeRequiredDeposit(100_000, { depositThreshold: 25_000, depositPct: 0 })).toBe(0);
  });

  it("equals the full price at 100%", () => {
    expect(computeRequiredDeposit(100_000, { depositThreshold: 25_000, depositPct: 100 })).toBe(
      100_000,
    );
  });
});

describe("isInsideCancelWindow", () => {
  const date = "2026-08-28";
  const time = "09:00"; // slot instant: 2026-08-28T03:30:00.000Z
  const cancelWindowHours = 24;

  it("is false exactly at the window boundary (24h before)", () => {
    expect(
      isInsideCancelWindow("2026-08-27T03:30:00.000Z", date, time, cancelWindowHours),
    ).toBe(false);
  });

  it("is true one minute inside the window", () => {
    expect(
      isInsideCancelWindow("2026-08-27T03:31:00.000Z", date, time, cancelWindowHours),
    ).toBe(true);
  });

  it("is false one minute outside the window", () => {
    expect(
      isInsideCancelWindow("2026-08-27T03:29:00.000Z", date, time, cancelWindowHours),
    ).toBe(false);
  });

  it("is true for a cancellation made after the appointment time (very late)", () => {
    expect(
      isInsideCancelWindow("2026-08-28T05:00:00.000Z", date, time, cancelWindowHours),
    ).toBe(true);
  });
});

describe("DEFAULT_BOOKING_RULES", () => {
  it("has sane, non-negative defaults", () => {
    expect(DEFAULT_BOOKING_RULES.leadTimeMinutes).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_BOOKING_RULES.maxAdvanceDays).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_BOOKING_RULES.depositPct).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_BOOKING_RULES.depositPct).toBeLessThanOrEqual(100);
  });
});
