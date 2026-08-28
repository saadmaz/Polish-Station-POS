// Backfills Invoice.bookingId for invoices written before that field
// existed. Without this, the revenue/timeline invariant from the dashboard
// fix (sum of revenue on the timeline == "Revenue Today") only holds for
// invoices created after that fix shipped — any earlier invoice is
// permanently invisible to Today's Timeline even though it's still counted
// in Revenue Today, which is exactly the class of bug that fix was for.
//
// Reuses synthesizeWalkInBooking (job-linking.ts) so a backfilled legacy
// invoice gets exactly the same kind of synthetic, already-Completed
// booking a walk-in sale gets today — nothing invents a second code path.
import { synthesizeWalkInBooking } from "./job-linking";
import type { Booking, Invoice, Service } from "./db";

export interface InvoiceBookingBackfillResult {
  bookings: Booking[]; // new synthetic bookings to create
  invoiceBookingIds: Record<string, string>; // invoiceId -> bookingId patch to apply
}

/**
 * Plans (does not write) synthetic bookings for every invoice missing a
 * bookingId. `nextBookingId` is called once per invoice needing one, in
 * order — the real script passes a sequential "B-N" generator (matching
 * every other booking id in the system); tests can pass anything unique.
 */
export function buildInvoiceBookingBackfill(
  invoices: Invoice[],
  services: Service[],
  nextBookingId: () => string,
): InvoiceBookingBackfillResult {
  const bookings: Booking[] = [];
  const invoiceBookingIds: Record<string, string> = {};

  for (const inv of invoices) {
    if (inv.bookingId) continue; // already linked, nothing to backfill

    const bookingId = nextBookingId();
    bookings.push(
      synthesizeWalkInBooking(
        {
          invoiceId: inv.id,
          createdAt: inv.createdAt,
          customerId: inv.customerId,
          customerName: inv.customerName,
          // No vehicle info is recoverable from a legacy invoice alone —
          // the invoice never carried plate/vehicle fields.
          plate: "",
          vehicleModel: "",
          lines: inv.lines,
          total: inv.total,
          servicesCatalog: services,
        },
        bookingId,
      ),
    );
    invoiceBookingIds[inv.id] = bookingId;
  }

  return { bookings, invoiceBookingIds };
}

/** Applies a backfill's invoiceBookingIds patch, for callers (and tests)
 *  that want the resulting invoice set without a second Firestore round trip. */
export function applyInvoiceBookingBackfill(
  invoices: Invoice[],
  invoiceBookingIds: Record<string, string>,
): Invoice[] {
  return invoices.map((inv) =>
    invoiceBookingIds[inv.id] ? { ...inv, bookingId: invoiceBookingIds[inv.id] } : inv,
  );
}
