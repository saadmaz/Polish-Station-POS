import { describe, it, expect } from "vitest";
import {
  buildInvoiceBookingBackfill,
  applyInvoiceBookingBackfill,
} from "./invoice-booking-backfill";
import { buildBookingJobMigration } from "./booking-job-migration";
import { computeDashboardMetrics, timelineRevenueTotal } from "./dashboard-metrics";
import { synthesizeWalkInJob } from "./job-linking";
import type { Invoice, Service } from "./db";

const ACTOR = { id: "migration-script", name: "Migration" };

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

describe("the revenue/timeline invariant holds end-to-end: legacy invoice -> bookingId backfill -> Booking/Job split -> Job-based dashboard", () => {
  it("sum(revenue on timeline items) == Revenue Today, for a mix of already-linked and legacy invoices", () => {
    // Post-migration invoice: already has a jobId, exactly like every
    // invoice created after the Booking/Job split shipped.
    const postJobId = "J-post-1";
    const { job: postJob } = synthesizeWalkInJob(
      {
        createdAt: CREATED_AT,
        customerId: null,
        customerName: "Guest",
        plate: "",
        vehicleModel: "",
        lines: [{ name: "Express Exterior Wash", qty: 1, unitPrice: 2500, discount: 0 }],
        total: 2500,
        servicesCatalog: SERVICES,
      },
      postJobId,
      ACTOR,
    );
    const postInvoice: Invoice = { ...legacyInvoice("INV-post", 2500), jobId: postJobId };

    // Pre-migration invoices: neither bookingId nor jobId at all, as if
    // written before either field existed.
    const legacyA = legacyInvoice("INV-legacy-a", 4000);
    const legacyB = legacyInvoice("INV-legacy-b", 1500);

    const allInvoicesBeforeMigration = [postInvoice, legacyA, legacyB];

    // Confirm the invariant is actually BROKEN before any migration runs —
    // this is the bug CHANGE 2 exists to fix, not a tautology.
    const beforeMetrics = computeDashboardMetrics(
      allInvoicesBeforeMigration,
      [postJob],
      BUSINESS_DATE,
    );
    const beforeTimelineRevenue = timelineRevenueTotal(
      allInvoicesBeforeMigration,
      [postJob],
      BUSINESS_DATE,
    );
    expect(beforeMetrics.revenueToday).toBe(8000); // 2500 + 4000 + 1500
    expect(beforeTimelineRevenue).toBe(2500); // only the already-linked invoice
    expect(beforeTimelineRevenue).not.toBe(beforeMetrics.revenueToday);

    // Stage 1: bookingId backfill (invoice-booking-backfill.ts / this module).
    const { bookings: legacyBookings, invoiceBookingIds } = buildInvoiceBookingBackfill(
      allInvoicesBeforeMigration,
      SERVICES,
      sequentialIdGenerator("B-legacy-"),
    );
    const invoicesWithBookingId = applyInvoiceBookingBackfill(
      allInvoicesBeforeMigration,
      invoiceBookingIds,
    );

    // Stage 2: Booking/Job split (booking-job-migration.ts), run over the
    // bookings stage 1 just created.
    const { jobs: legacyJobs } = buildBookingJobMigration(
      legacyBookings,
      ACTOR,
      sequentialIdGenerator("J-legacy-"),
    );
    const bookingIdToJobId = new Map(legacyJobs.map((j) => [j.bookingId, j.id]));
    const fullyMigratedInvoices = invoicesWithBookingId.map((inv) =>
      inv.bookingId && bookingIdToJobId.has(inv.bookingId)
        ? { ...inv, jobId: bookingIdToJobId.get(inv.bookingId) }
        : inv,
    );
    const allJobs = [postJob, ...legacyJobs];

    // The invariant now holds across the full mixed set, on the live
    // (Job-based) dashboard computation.
    const afterMetrics = computeDashboardMetrics(fullyMigratedInvoices, allJobs, BUSINESS_DATE);
    const afterTimelineRevenue = timelineRevenueTotal(
      fullyMigratedInvoices,
      allJobs,
      BUSINESS_DATE,
    );

    expect(afterMetrics.revenueToday).toBe(8000);
    expect(afterTimelineRevenue).toBe(afterMetrics.revenueToday);
  });
});
