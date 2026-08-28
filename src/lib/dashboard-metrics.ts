// Single computation for every Operations Dashboard card. Before this, each
// card (Revenue Today / Today's Timeline / Upcoming (Today) / Outstanding)
// independently recomputed "today" and independently decided which
// statuses counted, which is how they drifted out of sync. Every card must
// now read a field off the object this module returns rather than filtering
// `invoices`/`bookings` itself.
import { isInBusinessDay, todayBusinessDate } from "./business-day";
import type { Booking, Invoice } from "./db";

export interface DashboardMetrics {
  businessDate: string;
  /** Bookings whose `date` is `businessDate`, all statuses — completed and
   *  in-progress work included, not just future-scheduled items. */
  timelineBookings: Booking[];
  /** Sum of non-void, non-draft invoice totals created within `businessDate`. */
  revenueToday: number;
  /** Count of today's bookings still ahead (Confirmed/Pending). */
  upcomingToday: number;
  /** All-time balance still owed across every non-void invoice. */
  outstanding: number;
}

const REVENUE_EXCLUDED_STATUSES: ReadonlySet<Invoice["status"]> = new Set(["Void", "Draft"]);

export function computeDashboardMetrics(
  invoices: Invoice[],
  bookings: Booking[],
  businessDate: string = todayBusinessDate(),
): DashboardMetrics {
  const timelineBookings = bookings.filter((b) => b.date === businessDate);

  const revenueToday = invoices
    .filter(
      (i) => !REVENUE_EXCLUDED_STATUSES.has(i.status) && isInBusinessDay(i.createdAt, businessDate),
    )
    .reduce((sum, i) => sum + i.total, 0);

  const upcomingToday = timelineBookings.filter(
    (b) => b.status === "Confirmed" || b.status === "Pending",
  ).length;

  const outstanding = invoices
    .filter((i) => i.status === "Issued" || i.status === "Partially Paid")
    .reduce((sum, i) => sum + i.total, 0);

  return { businessDate, timelineBookings, revenueToday, upcomingToday, outstanding };
}

/**
 * Sum of revenue attributed to each timeline item for `businessDate`, by
 * following `Invoice.bookingId`. This is the audit function: it must equal
 * `computeDashboardMetrics(...).revenueToday` for any invoice/booking set
 * where every invoice has a bookingId pointing at a same-day booking — which
 * addInvoice() now guarantees (see job-linking.ts). If they ever diverge,
 * either an invoice was created without a bookingId, or the linked
 * booking's `date` doesn't match the invoice's own business day.
 */
export function timelineRevenueTotal(
  invoices: Invoice[],
  bookings: Booking[],
  businessDate: string = todayBusinessDate(),
): number {
  const revenueByBookingId = new Map<string, number>();
  for (const inv of invoices) {
    if (REVENUE_EXCLUDED_STATUSES.has(inv.status) || !inv.bookingId) continue;
    revenueByBookingId.set(inv.bookingId, (revenueByBookingId.get(inv.bookingId) ?? 0) + inv.total);
  }

  return bookings
    .filter((b) => b.date === businessDate)
    .reduce((sum, b) => sum + (revenueByBookingId.get(b.id) ?? 0), 0);
}
