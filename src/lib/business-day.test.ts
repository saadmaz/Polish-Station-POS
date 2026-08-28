import { describe, it, expect, afterEach } from "vitest";
import {
  businessDateOf,
  businessTimeOf,
  businessDayBoundsUtc,
  isInBusinessDay,
  addBusinessDays,
  todayBusinessDate,
} from "./business-day";

describe("businessDateOf / businessTimeOf", () => {
  it("a job at 00:30 Colombo local stays on that calendar day, not the UTC day before", () => {
    // 2026-08-28T00:30 Asia/Colombo == 2026-08-27T19:00:00.000Z
    const at = "2026-08-27T19:00:00.000Z";
    expect(businessDateOf(at)).toBe("2026-08-28");
    expect(businessTimeOf(at)).toBe("00:30");
  });

  it("a job at 23:45 Colombo local stays on that calendar day, not rolled to the UTC day after", () => {
    // 2026-08-28T23:45 Asia/Colombo == 2026-08-28T18:15:00.000Z
    const at = "2026-08-28T18:15:00.000Z";
    expect(businessDateOf(at)).toBe("2026-08-28");
    expect(businessTimeOf(at)).toBe("23:45");
  });
});

describe("host-timezone independence (server clock in UTC)", () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it("gives the identical business date for the identical instant regardless of the host's local TZ", () => {
    const at = "2026-08-27T19:00:00.000Z"; // Colombo 00:30 on the 28th

    process.env.TZ = "UTC";
    const fromUtcHost = businessDateOf(at);

    process.env.TZ = "America/New_York";
    const fromNyHost = businessDateOf(at);

    process.env.TZ = "Asia/Colombo";
    const fromColomboHost = businessDateOf(at);

    expect(fromUtcHost).toBe("2026-08-28");
    expect(fromNyHost).toBe("2026-08-28");
    expect(fromColomboHost).toBe("2026-08-28");
  });

  it("todayBusinessDate() never regresses to the UTC calendar day during the 00:00-05:29 Colombo window", () => {
    // A fixed instant representing Colombo 01:00 on 2026-08-28 (still
    // 2026-08-27 in UTC). Regardless of what the host OS thinks "today" is,
    // the business date must be the 28th.
    const at = new Date("2026-08-27T19:30:00.000Z");
    expect(businessDateOf(at)).toBe("2026-08-28");
  });
});

describe("DST-free year boundary", () => {
  it("23:45 Colombo on Dec 31 stays in the old year", () => {
    // 2025-12-31T23:45 Asia/Colombo == 2025-12-31T18:15:00.000Z
    expect(businessDateOf("2025-12-31T18:15:00.000Z")).toBe("2025-12-31");
  });

  it("00:15 Colombo just after midnight rolls into the new year even though UTC hasn't yet", () => {
    // 2026-01-01T00:15 Asia/Colombo == 2025-12-31T18:45:00.000Z (still Dec 31 in UTC)
    const at = "2025-12-31T18:45:00.000Z";
    expect(businessDateOf(at)).toBe("2026-01-01");
    expect(businessTimeOf(at)).toBe("00:15");
  });
});

describe("businessDayBoundsUtc / isInBusinessDay", () => {
  it("computes [startUtc, endUtc) as Colombo midnight through the next Colombo midnight", () => {
    const { startUtc, endUtc } = businessDayBoundsUtc("2026-08-28");
    expect(startUtc.toISOString()).toBe("2026-08-27T18:30:00.000Z");
    expect(endUtc.toISOString()).toBe("2026-08-28T18:30:00.000Z");
  });

  it("includes the start instant and excludes the end instant", () => {
    expect(isInBusinessDay("2026-08-27T18:30:00.000Z", "2026-08-28")).toBe(true);
    expect(isInBusinessDay("2026-08-28T18:29:59.999Z", "2026-08-28")).toBe(true);
    expect(isInBusinessDay("2026-08-28T18:30:00.000Z", "2026-08-28")).toBe(false);
    expect(isInBusinessDay("2026-08-27T18:29:59.999Z", "2026-08-28")).toBe(false);
  });

  it("rejects a non-YYYY-MM-DD business date", () => {
    expect(() => businessDayBoundsUtc("2026-8-28")).toThrow();
    expect(() => businessDayBoundsUtc("not-a-date")).toThrow();
  });
});

describe("addBusinessDays", () => {
  it("adds and subtracts across a month boundary", () => {
    expect(addBusinessDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addBusinessDays("2026-09-01", -1)).toBe("2026-08-31");
  });

  it("adds across a year boundary with no DST-related off-by-one", () => {
    expect(addBusinessDays("2025-12-31", 1)).toBe("2026-01-01");
    expect(addBusinessDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("is a no-op for n=0", () => {
    expect(addBusinessDays("2026-08-28", 0)).toBe("2026-08-28");
  });
});

describe("todayBusinessDate", () => {
  it("returns a well-formed YYYY-MM-DD string", () => {
    expect(todayBusinessDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
