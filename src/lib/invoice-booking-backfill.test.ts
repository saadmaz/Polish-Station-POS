import { describe, it, expect } from "vitest";
import {
  buildInvoiceBookingBackfill,
  applyInvoiceBookingBackfill,
} from "./invoice-booking-backfill";
import { computeDashboardMetrics, timelineRevenueTotal } from "./dashboard-metrics";
import { synthesizeWalkInBooking } from "./job-linking";
import type { Invoice, Service } from "./db";

const BUSINESS_DATE = "2026-08-28";
const CREATED_AT = "2026-08-28T04:30:00.000Z"; // Colombo 10:00 on the 28th

const SERVICES: Service[] = [
  { id: "sv1", name: "Express Exterior Wash", category: "Exterior", price: 2500, durationMin: 30 },
];

function legacyInvoice(id: string, total: number): Invoice {
  // Simulates an invoice written before Invoice.bookingId existed: the
  // field is simply absent, not null.
  return {
    id,
    customerId: null,
    customerName: "Guest",
    lines: [{ name: "Express Exterior Wash", qty: 1, unitPrice: total, discount: 0 }],
    subtotal: total,
    tip: 0,
    total,
    method: "Cash",
    status: "Paid",
    sessionId: null,
    createdAt: CREATED_AT,
  };
}

function sequentialIdGenerator(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}${++n}`;
}

describe("buildInvoiceBookingBackfill", () => {
  it("only touches invoices missing a bookingId", () => {
    const linked = { ...legacyInvoice("INV-1", 2500), bookingId: "B-existing" };
    const unlinked = legacyInvoice("INV-2", 4500);

    const { bookings, invoiceBookingIds } = buildInvoiceBookingBackfill(
      [linked, unlinked],
      SERVICES,
      sequentialIdGenerator("B-legacy-"),
    );

    expect(bookings).toHaveLength(1);
    expect(Object.keys(invoiceBookingIds)).toEqual(["INV-2"]);
    expect(invoiceBookingIds["INV-2"]).toBe("B-legacy-1");
  });

  it("synthesizes a booking dated to the invoice's own business day, not the current date", () => {
    const inv = legacyInvoice("INV-3", 2500);
    const { bookings } = buildInvoiceBookingBackfill([inv], SERVICES, sequentialIdGenerator("B-"));
    expect(bookings[0].date).toBe(BUSINESS_DATE);
    expect(bookings[0].status).toBe("Completed");
  });
});

describe("the revenue/timeline invariant holds across pre- and post-migration data", () => {
  it("sum(revenue on timeline items) == Revenue Today, for a mix of already-linked and legacy invoices", () => {
    // Post-migration invoice: already has a bookingId, exactly like every
    // invoice created after the dashboard fix shipped.
    const postBookingId = "B-post-1";
    const postBooking = synthesizeWalkInBooking(
      {
        invoiceId: "INV-post",
        createdAt: CREATED_AT,
        customerId: null,
        customerName: "Guest",
        plate: "",
        vehicleModel: "",
        lines: [{ name: "Express Exterior Wash", qty: 1, unitPrice: 2500, discount: 0 }],
        total: 2500,
        servicesCatalog: SERVICES,
      },
      postBookingId,
    );
    const postInvoice: Invoice = { ...legacyInvoice("INV-post", 2500), bookingId: postBookingId };

    // Pre-migration invoices: no bookingId at all, as if written before the fix.
    const legacyA = legacyInvoice("INV-legacy-a", 4000);
    const legacyB = legacyInvoice("INV-legacy-b", 1500);

    const allInvoicesBeforeBackfill = [postInvoice, legacyA, legacyB];

    // Confirm the invariant is actually BROKEN before the backfill — this
    // is the bug CHANGE 2 exists to fix, not a tautology.
    const beforeMetrics = computeDashboardMetrics(
      allInvoicesBeforeBackfill,
      [postBooking],
      BUSINESS_DATE,
    );
    const beforeTimelineRevenue = timelineRevenueTotal(
      allInvoicesBeforeBackfill,
      [postBooking],
      BUSINESS_DATE,
    );
    expect(beforeMetrics.revenueToday).toBe(8000); // 2500 + 4000 + 1500
    expect(beforeTimelineRevenue).toBe(2500); // only the already-linked invoice
    expect(beforeTimelineRevenue).not.toBe(beforeMetrics.revenueToday);

    // Run the backfill.
    const { bookings: legacyBookings, invoiceBookingIds } = buildInvoiceBookingBackfill(
      allInvoicesBeforeBackfill,
      SERVICES,
      sequentialIdGenerator("B-legacy-"),
    );
    const migratedInvoices = applyInvoiceBookingBackfill(
      allInvoicesBeforeBackfill,
      invoiceBookingIds,
    );
    const allBookings = [postBooking, ...legacyBookings];

    // The invariant now holds across the full mixed set.
    const afterMetrics = computeDashboardMetrics(migratedInvoices, allBookings, BUSINESS_DATE);
    const afterTimelineRevenue = timelineRevenueTotal(migratedInvoices, allBookings, BUSINESS_DATE);

    expect(afterMetrics.revenueToday).toBe(8000);
    expect(afterTimelineRevenue).toBe(afterMetrics.revenueToday);
  });
});
