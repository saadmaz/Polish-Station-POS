// Single source of truth for "business day" boundaries in the shop's
// operating timezone. Every dashboard card, timeline query, and report must
// go through this module instead of ad-hoc `new Date().toISOString()...`
// math, which silently uses UTC and drifts by a day against Asia/Colombo.
//
// Sri Lanka has not observed DST since 1996 and Asia/Colombo is a fixed
// UTC+05:30 offset, so this is implemented as plain offset arithmetic rather
// than through `Intl`/a timezone database. That also makes it deterministic
// regardless of the host's local timezone: a server running in UTC (Admin
// SDK functions) and a browser sitting in Colombo compute the identical
// business date for the identical instant, which is the exact mismatch that
// previously let "Revenue Today" and "Today's Timeline" disagree.
//
// This file must stay free of firebase/react imports: it's used from the
// client store, route components, and server functions alike.

export const BUSINESS_TIMEZONE = "Asia/Colombo";
const BUSINESS_UTC_OFFSET_MINUTES = 5 * 60 + 30; // UTC+05:30, fixed (no DST)

const BUSINESS_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertBusinessDate(s: string): void {
  if (!BUSINESS_DATE_RE.test(s)) {
    throw new Error(`Not a business-day string (expected YYYY-MM-DD): "${s}"`);
  }
}

/** The Asia/Colombo wall-clock instant for a UTC instant, as a Date whose
 *  UTC getters read like Colombo local getters. Internal only — callers
 *  should use `businessDateOf`/`businessTimeOf` instead of poking at this. */
function toBusinessWallClock(at: Date): Date {
  return new Date(at.getTime() + BUSINESS_UTC_OFFSET_MINUTES * 60_000);
}

/** The business-day ("YYYY-MM-DD") that `at` falls in, in Asia/Colombo. */
export function businessDateOf(at: Date | string = new Date()): string {
  const d = typeof at === "string" ? new Date(at) : at;
  return toBusinessWallClock(d).toISOString().slice(0, 10);
}

/** The wall-clock "HH:MM" (Asia/Colombo) that `at` falls in. */
export function businessTimeOf(at: Date | string = new Date()): string {
  const d = typeof at === "string" ? new Date(at) : at;
  const wc = toBusinessWallClock(d);
  const hh = String(wc.getUTCHours()).padStart(2, "0");
  const mm = String(wc.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Today's business date. The one place "today" is allowed to be computed
 *  from the wall clock — every other "today" in the app should call this. */
export function todayBusinessDate(): string {
  return businessDateOf(new Date());
}

/**
 * [startUtc, endUtc) for `businessDate`: the UTC instants of Asia/Colombo
 * 00:00:00.000 on that date through the next day's 00:00:00.000.
 */
export function businessDayBoundsUtc(businessDate: string): { startUtc: Date; endUtc: Date } {
  assertBusinessDate(businessDate);
  // Midnight UTC on `businessDate`, shifted back by the Colombo offset, is
  // the UTC instant of Colombo midnight on `businessDate`.
  const startUtc = new Date(
    Date.parse(`${businessDate}T00:00:00.000Z`) - BUSINESS_UTC_OFFSET_MINUTES * 60_000,
  );
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
  return { startUtc, endUtc };
}

/** Whether ISO timestamp `at` falls within business day `businessDate`. */
export function isInBusinessDay(at: string, businessDate: string): boolean {
  const t = new Date(at).getTime();
  const { startUtc, endUtc } = businessDayBoundsUtc(businessDate);
  return t >= startUtc.getTime() && t < endUtc.getTime();
}

/**
 * Add `n` calendar days to a "YYYY-MM-DD" business-day string. Anchored at
 * UTC noon so the arithmetic can never drift into a neighbouring date
 * regardless of the host's local timezone — this is pure calendar-date
 * math, not a business-boundary lookup, so it doesn't need the Colombo
 * offset at all.
 */
export function addBusinessDays(businessDate: string, n: number): string {
  assertBusinessDate(businessDate);
  const d = new Date(`${businessDate}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
