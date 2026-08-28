import { describe, it, expect } from "vitest";
import { buildBookingJobMigration } from "./booking-job-migration";
import { synthesizeWalkInBooking } from "./job-linking";
import { isLegalTransition } from "./job";
import type { Booking, BookingStatus, Service } from "./db";

const ACTOR = { id: "migration-script", name: "Migration" };
const NOW = "2026-08-28T04:30:00.000Z";

function booking(status: BookingStatus, overrides: Partial<Booking> = {}): Booking {
  return {
    id: "B-1",
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
    date: "2026-08-28",
    time: "09:00",
    tech: "Imran S.",
    bay: "Bay 1",
    status,
    notes: "",
    createdAt: NOW,
    ...overrides,
  };
}

function sequentialIdGenerator(): () => string {
  let n = 0;
  return () => `id-${++n}`;
}

describe("status mapping", () => {
  const cases: [BookingStatus, string][] = [
    ["Pending", "booked"],
    ["Confirmed", "booked"],
    ["Checked-In", "arrived"],
    ["Completed", "delivered"],
    ["No-Show", "no_show"],
    ["Cancelled", "cancelled"],
  ];

  it.each(cases)("%s maps to %s", (status, expected) => {
    const { jobs } = buildBookingJobMigration([booking(status)], ACTOR, sequentialIdGenerator());
    expect(jobs[0].status).toBe(expected);
  });
});

describe("synthesized event chains", () => {
  it("a booked job gets a single creation event", () => {
    const { jobEvents } = buildBookingJobMigration(
      [booking("Pending")],
      ACTOR,
      sequentialIdGenerator(),
    );
    expect(jobEvents).toHaveLength(1);
    expect(jobEvents[0]).toMatchObject({ fromStatus: null, toStatus: "booked" });
  });

  it("an arrived job's chain passes through booked first", () => {
    const { jobEvents } = buildBookingJobMigration(
      [booking("Checked-In")],
      ACTOR,
      sequentialIdGenerator(),
    );
    expect(jobEvents.map((e) => e.toStatus)).toEqual(["booked", "arrived"]);
    expect(jobEvents.map((e) => e.fromStatus)).toEqual([null, "booked"]);
  });

  it("a delivered job's chain walks every legal intermediate step, each one actually legal", () => {
    const { jobEvents } = buildBookingJobMigration(
      [booking("Completed")],
      ACTOR,
      sequentialIdGenerator(),
    );
    expect(jobEvents.map((e) => e.toStatus)).toEqual([
      "booked",
      "arrived",
      "checked_in",
      "in_progress",
      "qc",
      "ready",
      "delivered",
    ]);
    for (let i = 1; i < jobEvents.length; i++) {
      expect(isLegalTransition(jobEvents[i - 1].toStatus, jobEvents[i].toStatus)).toBe(true);
    }
  });

  it("every event in a synthesized (multi-step) chain is timestamped at the booking's own createdAt and notes that it's synthesized", () => {
    const createdAt = "2025-01-01T00:00:00.000Z";
    const { jobEvents } = buildBookingJobMigration(
      [booking("Completed", { createdAt })],
      ACTOR,
      sequentialIdGenerator(),
    );
    for (const e of jobEvents) {
      expect(e.at).toBe(createdAt);
      expect(e.note).toContain("Synthesized");
    }
  });

  it("a cancelled job's chain passes through booked first, not straight to cancelled", () => {
    const { jobEvents } = buildBookingJobMigration(
      [booking("Cancelled")],
      ACTOR,
      sequentialIdGenerator(),
    );
    expect(jobEvents.map((e) => e.toStatus)).toEqual(["booked", "cancelled"]);
  });
});

describe("job fields carried over from the booking", () => {
  it("preserves customer, service, schedule, and assignment fields", () => {
    const { jobs } = buildBookingJobMigration(
      [booking("Pending", { id: "B-42" })],
      ACTOR,
      sequentialIdGenerator(),
    );
    const job = jobs[0];
    expect(job.bookingId).toBe("B-42");
    expect(job.customerId).toBe("c1");
    expect(job.customerName).toBe("Roshan Karu");
    expect(job.serviceId).toBe("sv1");
    expect(job.date).toBe("2026-08-28");
    expect(job.time).toBe("09:00");
    expect(job.tech).toBe("Imran S.");
    expect(job.bay).toBe("Bay 1");
    expect(job.price).toBe(2500);
    expect(job.vehicleId).toBeNull(); // Vehicle cutover is a later stage
  });
});

describe("report", () => {
  it("counts jobs by their mapped status", () => {
    const { report } = buildBookingJobMigration(
      [booking("Pending"), booking("Confirmed"), booking("Cancelled")],
      ACTOR,
      sequentialIdGenerator(),
    );
    expect(report.totalBookings).toBe(3);
    expect(report.byMappedStatus.booked).toBe(2);
    expect(report.byMappedStatus.cancelled).toBe(1);
  });
});

describe("coverage of invoice-backfill's synthesized bookings", () => {
  it("a booking synthesized by synthesizeWalkInBooking (invoice-booking-backfill.ts) migrates cleanly to a delivered Job", () => {
    const SERVICES: Service[] = [
      {
        id: "sv1",
        name: "Express Exterior Wash",
        category: "Exterior",
        price: 2500,
        durationMin: 30,
      },
    ];
    const walkInBooking = synthesizeWalkInBooking(
      {
        invoiceId: "INV-legacy-1",
        createdAt: NOW,
        customerId: null,
        customerName: "Guest",
        plate: "",
        vehicleModel: "",
        lines: [{ name: "Express Exterior Wash", qty: 1, unitPrice: 2500, discount: 0 }],
        total: 2500,
        servicesCatalog: SERVICES,
      },
      "B-legacy-1",
    );

    // Sanity: this is exactly what the backfill script produces — status
    // "Completed", nothing special-cased for the split migration to key off.
    expect(walkInBooking.status).toBe("Completed");

    const { jobs, jobEvents } = buildBookingJobMigration(
      [walkInBooking],
      ACTOR,
      sequentialIdGenerator(),
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe("delivered");
    expect(jobs[0].bookingId).toBe("B-legacy-1");
    expect(jobEvents.at(-1)).toMatchObject({ toStatus: "delivered" });
  });
});
