import { describe, it, expect } from "vitest";
import { computeDashboardMetrics, timelineRevenueTotal } from "./dashboard-metrics";
import { synthesizeWalkInBooking } from "./job-linking";
import type { Booking, Invoice, Service } from "./db";

const BUSINESS_DATE = "2026-08-28";
// Colombo 10:00 on 2026-08-28
const CREATED_AT = "2026-08-28T04:30:00.000Z";

const SERVICES: Service[] = [
  { id: "sv1", name: "Express Exterior Wash", category: "Exterior", price: 2500, durationMin: 30 },
];

function walkInInvoice(
  id: string,
  total: number,
  bookingId: string,
): { invoice: Invoice; booking: Booking } {
  const booking = synthesizeWalkInBooking(
    {
      invoiceId: id,
      createdAt: CREATED_AT,
      customerId: null,
      customerName: "Guest",
      plate: "",
      vehicleModel: "",
      lines: [{ name: "Express Exterior Wash", qty: 1, unitPrice: total, discount: 0 }],
      total,
      servicesCatalog: SERVICES,
    },
    bookingId,
  );
  const invoice: Invoice = {
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
    bookingId,
  };
  return { invoice, booking };
}

describe("Revenue Today and Today's Timeline can never disagree", () => {
  it("for a set of walk-in POS sales (no pre-existing booking), timeline revenue == Revenue Today", () => {
    const a = walkInInvoice("INV-1", 2500, "B-1");
    const b = walkInInvoice("INV-2", 4500, "B-2");
    const invoices = [a.invoice, b.invoice];
    const bookings = [a.booking, b.booking];

    const metrics = computeDashboardMetrics(invoices, bookings, BUSINESS_DATE);
    const timelineRevenue = timelineRevenueTotal(invoices, bookings, BUSINESS_DATE);

    expect(metrics.revenueToday).toBe(7000);
    expect(timelineRevenue).toBe(metrics.revenueToday);
  });

  it("holds when a booking exists with no invoice yet (upcoming work contributes 0 revenue)", () => {
    const a = walkInInvoice("INV-1", 2500, "B-1");
    const upcoming: Booking = {
      id: "B-2",
      customerId: null,
      customerName: "Walk-up",
      phone: "",
      plate: "",
      vehicleModel: "",
      serviceId: "sv1",
      serviceName: "Express Exterior Wash",
      category: "Exterior",
      durationMin: 30,
      price: 2500,
      date: BUSINESS_DATE,
      time: "14:00",
      tech: "",
      bay: "",
      status: "Confirmed",
      notes: "",
      createdAt: CREATED_AT,
    };
    const invoices = [a.invoice];
    const bookings = [a.booking, upcoming];

    const metrics = computeDashboardMetrics(invoices, bookings, BUSINESS_DATE);
    expect(metrics.timelineBookings).toHaveLength(2);
    expect(metrics.upcomingToday).toBe(1);
    expect(timelineRevenueTotal(invoices, bookings, BUSINESS_DATE)).toBe(metrics.revenueToday);
  });

  it("excludes a Void invoice from both Revenue Today and timeline revenue identically", () => {
    const a = walkInInvoice("INV-1", 2500, "B-1");
    const voided = walkInInvoice("INV-2", 9999, "B-2");
    voided.invoice.status = "Void";

    const invoices = [a.invoice, voided.invoice];
    const bookings = [a.booking, voided.booking];

    const metrics = computeDashboardMetrics(invoices, bookings, BUSINESS_DATE);
    expect(metrics.revenueToday).toBe(2500);
    expect(timelineRevenueTotal(invoices, bookings, BUSINESS_DATE)).toBe(2500);
  });

  it("excludes an invoice/booking pair from a different business day", () => {
    const today = walkInInvoice("INV-1", 2500, "B-1");
    const yesterday = walkInInvoice("INV-2", 4000, "B-2");
    yesterday.booking.date = "2026-08-27";
    yesterday.invoice.createdAt = "2026-08-27T04:30:00.000Z";

    const invoices = [today.invoice, yesterday.invoice];
    const bookings = [today.booking, yesterday.booking];

    const metrics = computeDashboardMetrics(invoices, bookings, BUSINESS_DATE);
    expect(metrics.revenueToday).toBe(2500);
    expect(metrics.timelineBookings).toHaveLength(1);
    expect(timelineRevenueTotal(invoices, bookings, BUSINESS_DATE)).toBe(2500);
  });

  it("still holds for an invoice linked to a pre-existing (non-walk-in) booking", () => {
    const prebooked: Booking = {
      id: "B-50",
      customerId: "c1",
      customerName: "Roshan Karu",
      phone: "",
      plate: "CAR-2210",
      vehicleModel: "Toyota Prius",
      serviceId: "sv1",
      serviceName: "Express Exterior Wash",
      category: "Exterior",
      durationMin: 30,
      price: 2500,
      date: BUSINESS_DATE,
      time: "08:30",
      tech: "Imran S.",
      bay: "Bay 1",
      status: "Completed",
      notes: "",
      createdAt: CREATED_AT,
    };
    const invoice: Invoice = {
      id: "INV-9",
      customerId: "c1",
      customerName: "Roshan Karu",
      lines: [{ name: "Express Exterior Wash", qty: 1, unitPrice: 2500, discount: 0 }],
      subtotal: 2500,
      tip: 0,
      total: 2500,
      method: "Cash",
      status: "Paid",
      sessionId: null,
      createdAt: CREATED_AT,
      bookingId: prebooked.id,
    };

    const metrics = computeDashboardMetrics([invoice], [prebooked], BUSINESS_DATE);
    expect(metrics.revenueToday).toBe(2500);
    expect(timelineRevenueTotal([invoice], [prebooked], BUSINESS_DATE)).toBe(2500);
  });
});
