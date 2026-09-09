// Single source of truth for displaying a date/time. Before this, ~30 call
// sites across the app each called toLocaleDateString/toLocaleString/
// toLocaleTimeString independently -- most passed `[]` for locale (the
// browser's ambient default), so the SAME conceptual "27 Aug 2026" could
// render in a different word order depending on which machine loaded the
// page, not just look inconsistent screen to screen (audit pattern 02).
// Pinned to en-GB throughout: day-before-month is the everyday convention in
// Sri Lanka, and it's what several of the ~15 call sites already
// deliberately chose before this file existed.
//
// The public /book widget (src/routes/book.tsx) is deliberately NOT
// migrated to this file -- its long-form "Thursday, 27 August" style reads
// as a marketing-page choice, not the same bug, and it's a different
// surface than everywhere else here (internal, authenticated screens).

/** Accepts a full ISO timestamp OR a bare "YYYY-MM-DD" business-date
 *  string. A bare date must be parsed as LOCAL midnight, not UTC midnight
 *  (`new Date("2026-08-24")` is UTC midnight, which renders as the 23rd in
 *  any negative-UTC-offset timezone) -- the same pitfall several call sites
 *  already worked around individually with `new Date(d + "T00:00:00")`. */
function toDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
}

function upperMeridiem(s: string): string {
  return s.replace(/\b(am|pm)\b/i, (m) => m.toUpperCase());
}

/** "27 Aug" -- day and month only, no year. */
export function formatShortDate(value: string | Date): string {
  return toDate(value).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** "27 Aug 2026" -- the general-purpose date: invoices, POs, leads, coupon
 *  expiry, anywhere a historical date needs a year to be unambiguous. */
export function formatDate(value: string | Date): string {
  return toDate(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "Thu 27 Aug" -- no year, for a date that's implicitly recent (the top
 *  bar's "today", a calendar's currently-selected day). */
export function formatDateWithWeekday(value: string | Date): string {
  return toDate(value).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** "02:35 PM" */
export function formatTime(value: string | Date): string {
  return upperMeridiem(
    toDate(value).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }),
  );
}

/** "27 Aug, 02:35 PM" -- day, month and time, no year (an invoice/audit-log
 *  row from the recent past, where the year is rarely in question). */
export function formatDateTime(value: string | Date): string {
  return upperMeridiem(
    toDate(value).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }),
  );
}

/** "27 Aug 2026, 02:35 PM" -- explicitly in Asia/Colombo, regardless of the
 *  viewing device's local timezone. Only the inspection report PDF needs
 *  this (its spec explicitly calls out the timezone for that one document);
 *  every other screen here still renders in the browser's local time, which
 *  in this app's real deployment is Colombo anyway. */
export function formatDateTimeInColombo(value: string | Date): string {
  return upperMeridiem(
    toDate(value).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Colombo",
    }),
  );
}

/** "18m" / "2h" / "3d" -- coarse relative age for the Leads worklist's
 *  "Waiting" column. Deliberately coarse (one unit, no "3h 12m") since it's
 *  a queue-triage signal, not a precise duration; `now` is injectable for
 *  tests, defaults to the real current time. */
export function formatRelativeAge(value: string | Date, now: Date = new Date()): string {
  const ms = now.getTime() - toDate(value).getTime();
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

/** "24 Aug – 30 Aug 2026" -- an inclusive week range (a calendar week
 *  header). Audit finding B4: Bookings' Week view kept a single-day
 *  header/subtitle instead of adopting this. */
export function formatWeekRange(startValue: string | Date, endValue: string | Date): string {
  const start = toDate(startValue).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const end = toDate(endValue).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${start} – ${end}`;
}
