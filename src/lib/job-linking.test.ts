import { describe, it, expect } from "vitest";
import { synthesizeWalkInBooking, synthesizeWalkInJob } from "./job-linking";
import { businessDateOf, businessTimeOf } from "./business-day";
import { isLegalTransition } from "./job";
import type { Service } from "./db";

const ACTOR = { id: "staff-1", name: "Imran S." };

const SERVICES: Service[] = [
  { id: "sv1", name: "Express Exterior Wash", category: "Exterior", price: 2500, durationMin: 30 },
  { id: "sv3", name: "Interior Deep Clean", category: "Interior", price: 6500, durationMin: 90 },
];

describe("synthesizeWalkInBooking", () => {
  it("dates and times the booking from the invoice's createdAt via the business-day rule, not wall-clock now", () => {
    // Colombo 00:30 on 2026-08-28 == 2026-08-27T19:00:00.000Z
    const createdAt = "2026-08-27T19:00:00.000Z";
    const b = synthesizeWalkInBooking(
      {
        invoiceId: "INV-1",
        createdAt,
        customerId: null,
        customerName: "Guest",
        plate: "",
        vehicleModel: "",
        lines: [{ name: "Express Exterior Wash", qty: 1, unitPrice: 2500, discount: 0 }],
        total: 2500,
        servicesCatalog: SERVICES,
      },
      "B-999",
    );
    expect(b.date).toBe(businessDateOf(createdAt));
    expect(b.date).toBe("2026-08-28");
    expect(b.time).toBe(businessTimeOf(createdAt));
    expect(b.time).toBe("00:30");
  });

  it("matches a catalog service by line name for category/duration/serviceId", () => {
    const b = synthesizeWalkInBooking(
      {
        invoiceId: "INV-2",
        createdAt: "2026-08-28T10:00:00.000Z",
        customerId: "c1",
        customerName: "Priya",
        plate: "CAR-1145",
        vehicleModel: "Honda Vezel",
        lines: [{ name: "Interior Deep Clean", qty: 1, unitPrice: 6500, discount: 0 }],
        total: 6500,
        servicesCatalog: SERVICES,
      },
      "B-1000",
    );
    expect(b.serviceId).toBe("sv3");
    expect(b.category).toBe("Interior");
    expect(b.durationMin).toBe(90);
    expect(b.serviceName).toBe("Interior Deep Clean");
  });

  it("falls back to a generic category and zero duration for an unmatched custom line", () => {
    const b = synthesizeWalkInBooking(
      {
        invoiceId: "INV-3",
        createdAt: "2026-08-28T10:00:00.000Z",
        customerId: null,
        customerName: "Guest",
        plate: "",
        vehicleModel: "",
        lines: [{ name: "Custom item", qty: 1, unitPrice: 1000, discount: 0 }],
        total: 1000,
        servicesCatalog: SERVICES,
      },
      "B-1001",
    );
    expect(b.serviceId).toBe("");
    expect(b.category).toBe("Exterior");
    expect(b.durationMin).toBe(0);
  });

  it("summarizes multiple lines and sums duration across matched ones", () => {
    const b = synthesizeWalkInBooking(
      {
        invoiceId: "INV-4",
        createdAt: "2026-08-28T10:00:00.000Z",
        customerId: null,
        customerName: "Guest",
        plate: "",
        vehicleModel: "",
        lines: [
          { name: "Express Exterior Wash", qty: 1, unitPrice: 2500, discount: 0 },
          { name: "Interior Deep Clean", qty: 1, unitPrice: 6500, discount: 0 },
        ],
        total: 9000,
        servicesCatalog: SERVICES,
      },
      "B-1002",
    );
    expect(b.serviceName).toBe("Express Exterior Wash +1 more");
    expect(b.durationMin).toBe(120);
    expect(b.price).toBe(9000);
  });

  it("is always created already Completed, and carries the invoice id in notes for traceability", () => {
    const b = synthesizeWalkInBooking(
      {
        invoiceId: "INV-5",
        createdAt: "2026-08-28T10:00:00.000Z",
        customerId: null,
        customerName: "Guest",
        plate: "",
        vehicleModel: "",
        lines: [],
        total: 0,
        servicesCatalog: SERVICES,
      },
      "B-1003",
    );
    expect(b.status).toBe("Completed");
    expect(b.notes).toContain("INV-5");
  });
});

describe("synthesizeWalkInJob", () => {
  it("dates and times the job from the invoice's createdAt via the business-day rule, not wall-clock now", () => {
    // Colombo 00:30 on 2026-08-28 == 2026-08-27T19:00:00.000Z
    const createdAt = "2026-08-27T19:00:00.000Z";
    const { job } = synthesizeWalkInJob(
      {
        createdAt,
        customerId: null,
        customerName: "Guest",
        plate: "",
        vehicleModel: "",
        lines: [{ name: "Express Exterior Wash", qty: 1, unitPrice: 2500, discount: 0 }],
        total: 2500,
        servicesCatalog: SERVICES,
      },
      "J-999",
      ACTOR,
    );
    expect(job.date).toBe(businessDateOf(createdAt));
    expect(job.time).toBe(businessTimeOf(createdAt));
  });

  it("has bookingId: null — a walk-in has no promise behind it", () => {
    const { job } = synthesizeWalkInJob(
      {
        createdAt: "2026-08-28T10:00:00.000Z",
        customerId: null,
        customerName: "Guest",
        plate: "",
        vehicleModel: "",
        lines: [],
        total: 0,
        servicesCatalog: SERVICES,
      },
      "J-1",
      ACTOR,
    );
    expect(job.bookingId).toBeNull();
  });

  it("is created already delivered, with a full legal event chain leading there", () => {
    const { job, events } = synthesizeWalkInJob(
      {
        createdAt: "2026-08-28T10:00:00.000Z",
        customerId: null,
        customerName: "Guest",
        plate: "",
        vehicleModel: "",
        lines: [{ name: "Express Exterior Wash", qty: 1, unitPrice: 2500, discount: 0 }],
        total: 2500,
        servicesCatalog: SERVICES,
      },
      "J-2",
      ACTOR,
    );
    expect(job.status).toBe("delivered");
    expect(events.map((e) => e.toStatus)).toEqual([
      "booked",
      "arrived",
      "checked_in",
      "in_progress",
      "qc",
      "ready",
      "delivered",
    ]);
    for (let i = 1; i < events.length; i++) {
      expect(isLegalTransition(events[i - 1].toStatus, events[i].toStatus)).toBe(true);
    }
  });

  it("every event carries the given actor and is stamped at the invoice's createdAt", () => {
    const createdAt = "2026-08-28T10:00:00.000Z";
    const { events } = synthesizeWalkInJob(
      {
        createdAt,
        customerId: null,
        customerName: "Guest",
        plate: "",
        vehicleModel: "",
        lines: [],
        total: 0,
        servicesCatalog: SERVICES,
      },
      "J-3",
      ACTOR,
    );
    for (const e of events) {
      expect(e.actorId).toBe(ACTOR.id);
      expect(e.actorName).toBe(ACTOR.name);
      expect(e.at).toBe(createdAt);
      expect(e.jobId).toBe("J-3");
    }
  });

  it("matches a catalog service the same way synthesizeWalkInBooking does", () => {
    const { job } = synthesizeWalkInJob(
      {
        createdAt: "2026-08-28T10:00:00.000Z",
        customerId: "c1",
        customerName: "Priya",
        plate: "CAR-1145",
        vehicleModel: "Honda Vezel",
        lines: [{ name: "Interior Deep Clean", qty: 1, unitPrice: 6500, discount: 0 }],
        total: 6500,
        servicesCatalog: SERVICES,
      },
      "J-4",
      ACTOR,
    );
    expect(job.serviceId).toBe("sv3");
    expect(job.category).toBe("Interior");
    expect(job.durationMin).toBe(90);
  });
});
