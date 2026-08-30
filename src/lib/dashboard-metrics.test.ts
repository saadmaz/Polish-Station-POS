import { describe, it, expect } from "vitest";
import { computeDashboardMetrics, timelineRevenueTotal } from "./dashboard-metrics";
import { synthesizeWalkInJob } from "./job-linking";
import type { Invoice, Service } from "./db";
import type { Job } from "./job";

const ACTOR = { id: "staff-1", name: "Imran S." };
const BUSINESS_DATE = "2026-08-28";
const CREATED_AT = "2026-08-28T04:30:00.000Z";

const SERVICES: Service[] = [
  { id: "sv1", name: "Express Exterior Wash", category: "Exterior", price: 2500, durationMin: 30 },
];

function walkInInvoice(id: string, total: number, jobId: string): { invoice: Invoice; job: Job } {
  const { job } = synthesizeWalkInJob(
    {
      createdAt: CREATED_AT,
      customerId: null,
      customerName: "Guest",
      plate: "",
      vehicleModel: "",
      lines: [{ name: "Express Exterior Wash", qty: 1, unitPrice: total, discount: 0 }],
      total,
      servicesCatalog: SERVICES,
    },
    jobId,
    ACTOR,
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
    createdAt: CREATED_AT,
    jobId,
  };
  return { invoice, job };
}

describe("Revenue Today and Today's Timeline can never disagree", () => {
  it("for a set of walk-in POS sales (no pre-existing job), timeline revenue == Revenue Today", () => {
    const a = walkInInvoice("INV-1", 2500, "J-1");
    const b = walkInInvoice("INV-2", 4500, "J-2");
    const invoices = [a.invoice, b.invoice];
    const jobs = [a.job, b.job];

    const metrics = computeDashboardMetrics(invoices, jobs, BUSINESS_DATE);
    const timelineRevenue = timelineRevenueTotal(invoices, jobs, BUSINESS_DATE);

    expect(metrics.revenueToday).toBe(7000);
    expect(timelineRevenue).toBe(metrics.revenueToday);
  });

  it("holds when a job exists with no invoice yet (upcoming work contributes 0 revenue)", () => {
    const a = walkInInvoice("INV-1", 2500, "J-1");
    const upcoming: Job = {
      id: "J-2",
      bookingId: "B-2",
      vehicleId: null,
      customerId: null,
      customerName: "Walk-up",
      serviceId: "sv1",
      serviceName: "Express Exterior Wash",
      category: "Exterior",
      durationMin: 30,
      price: 2500,
      date: BUSINESS_DATE,
      time: "14:00",
      tech: "",
      bay: "",
      status: "booked",
      notes: "",
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    };
    const invoices = [a.invoice];
    const jobs = [a.job, upcoming];

    const metrics = computeDashboardMetrics(invoices, jobs, BUSINESS_DATE);
    expect(metrics.timelineJobs).toHaveLength(2);
    expect(metrics.upcomingToday).toBe(1);
    expect(timelineRevenueTotal(invoices, jobs, BUSINESS_DATE)).toBe(metrics.revenueToday);
  });

  it("excludes a Void invoice from both Revenue Today and timeline revenue identically", () => {
    const a = walkInInvoice("INV-1", 2500, "J-1");
    const voided = walkInInvoice("INV-2", 9999, "J-2");
    voided.invoice.status = "Void";

    const invoices = [a.invoice, voided.invoice];
    const jobs = [a.job, voided.job];

    const metrics = computeDashboardMetrics(invoices, jobs, BUSINESS_DATE);
    expect(metrics.revenueToday).toBe(2500);
    expect(timelineRevenueTotal(invoices, jobs, BUSINESS_DATE)).toBe(2500);
  });

  it("excludes an invoice/job pair from a different business day", () => {
    const today = walkInInvoice("INV-1", 2500, "J-1");
    const yesterday = walkInInvoice("INV-2", 4000, "J-2");
    yesterday.job.date = "2026-08-27";
    yesterday.invoice.createdAt = "2026-08-27T04:30:00.000Z";

    const invoices = [today.invoice, yesterday.invoice];
    const jobs = [today.job, yesterday.job];

    const metrics = computeDashboardMetrics(invoices, jobs, BUSINESS_DATE);
    expect(metrics.revenueToday).toBe(2500);
    expect(metrics.timelineJobs).toHaveLength(1);
    expect(timelineRevenueTotal(invoices, jobs, BUSINESS_DATE)).toBe(2500);
  });

  it("still holds for an invoice linked to a pre-existing (non-walk-in) job", () => {
    const prebooked: Job = {
      id: "J-50",
      bookingId: "B-50",
      vehicleId: null,
      customerId: "c1",
      customerName: "Roshan Karu",
      serviceId: "sv1",
      serviceName: "Express Exterior Wash",
      category: "Exterior",
      durationMin: 30,
      price: 2500,
      date: BUSINESS_DATE,
      time: "08:30",
      tech: "Imran S.",
      bay: "Bay 1",
      status: "delivered",
      notes: "",
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
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
      createdAt: CREATED_AT,
      jobId: prebooked.id,
    };

    const metrics = computeDashboardMetrics([invoice], [prebooked], BUSINESS_DATE);
    expect(metrics.revenueToday).toBe(2500);
    expect(timelineRevenueTotal([invoice], [prebooked], BUSINESS_DATE)).toBe(2500);
  });
});
