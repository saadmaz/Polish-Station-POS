import { describe, it, expect } from "vitest";
import { buildVehicleMigration } from "./vehicle-migration";
import type { Customer, Booking } from "./db";

const NOW = "2026-08-28T00:00:00.000Z";

function customer(overrides: Partial<Customer> & { id: string }): Customer {
  return {
    name: "Test Customer",
    phone: "+94 77 000 0000",
    email: "",
    vehicles: [],
    visits: 0,
    spend: 0,
    lastVisit: null,
    tier: "Bronze",
    loyaltyPoints: 0,
    createdAt: NOW,
    ...overrides,
  };
}

function booking(overrides: Partial<Booking> & { id: string }): Booking {
  return {
    customerId: null,
    customerName: "",
    phone: "",
    plate: "",
    vehicleModel: "",
    serviceId: "sv1",
    serviceName: "Express Exterior Wash",
    category: "Exterior",
    durationMin: 30,
    price: 2500,
    date: "2026-08-28",
    time: "09:00",
    tech: "",
    bay: "",
    status: "Pending",
    notes: "",
    createdAt: NOW,
    ...overrides,
  };
}

// Deterministic ids for assertions, rather than the real crypto.randomUUID default.
function fakeIdGenerator(): () => string {
  let n = 0;
  return () => `id-${++n}`;
}

describe("buildVehicleMigration", () => {
  it("creates one vehicle per distinct normalized plate, id is random not plate-derived", () => {
    const customers = [
      customer({
        id: "c1",
        name: "Roshan Karu",
        // "Rover Metro" is deliberately not in the size-class lookup table,
        // so this exercises the no-signal fallback path, not the derivation
        // path (covered separately below).
        vehicles: [{ plate: "CAR-2210", model: "Rover Metro 1995", color: "Silver" }],
      }),
    ];
    const result = buildVehicleMigration(customers, [], NOW, fakeIdGenerator());

    expect(result.vehicles).toHaveLength(1);
    const v = result.vehicles[0];
    expect(v.id).toBe("id-1");
    expect(v.id).not.toBe(v.plate); // doc id must not be derived from the plate
    expect(v.plate).toBe("CAR2210");
    expect(v.plateDisplay).toBe("CAR-2210");
    expect(v.make).toBe("Rover");
    expect(v.model).toBe("Metro");
    expect(v.year).toBe(1995);
    expect(v.colour).toBe("Silver");
    expect(v.sizeClass).toBe("other");
    expect(v.needsSizeClassReview).toBe(true);

    // The plates/{normalizedPlate} index resolves to the vehicle's real id.
    expect(result.plateIndex["CAR2210"]).toMatchObject({ vehicleId: v.id });

    expect(result.ownerships).toHaveLength(1);
    expect(result.ownerships[0]).toMatchObject({
      vehicleId: v.id,
      customerId: "c1",
      endDate: null,
    });
    expect(result.report.vehiclesCreated).toBe(1);
    expect(result.report.collisions).toHaveLength(0);
  });

  it("pre-selects sizeClass from the lookup table when the make+model is recognized, no review flag", () => {
    const customers = [
      customer({
        id: "c1",
        vehicles: [{ plate: "CAR-4521", model: "Toyota Aqua 2018", color: "Pearl White" }],
      }),
    ];
    const result = buildVehicleMigration(customers, [], NOW, fakeIdGenerator());

    expect(result.vehicles[0].sizeClass).toBe("hatchback");
    expect(result.vehicles[0].needsSizeClassReview).toBe(false);
  });

  it("dedupes the same plate seen on both a Customer and a Booking into one vehicle and one index entry", () => {
    const customers = [
      customer({
        id: "c1",
        vehicles: [{ plate: "CAR-2210", model: "Toyota Prius 2016", color: "Silver" }],
      }),
    ];
    const bookings = [
      booking({
        id: "B-1",
        customerId: "c1",
        plate: "car 2210",
        vehicleModel: "Toyota Prius 2016",
      }),
    ];
    const result = buildVehicleMigration(customers, bookings, NOW, fakeIdGenerator());

    expect(result.vehicles).toHaveLength(1);
    expect(result.ownerships).toHaveLength(1); // same customerId on both sources, not double-counted
    expect(Object.keys(result.plateIndex)).toEqual(["CAR2210"]);
  });

  it("flags a plate claimed by two different customers as a collision instead of guessing an owner", () => {
    const customers = [
      customer({
        id: "c1",
        vehicles: [{ plate: "CAR-1234", model: "Honda Fit 2019", color: "White" }],
      }),
      customer({
        id: "c2",
        vehicles: [{ plate: "CAR-1234", model: "Honda Fit 2019", color: "White" }],
      }),
    ];
    const result = buildVehicleMigration(customers, [], NOW, fakeIdGenerator());

    expect(result.vehicles).toHaveLength(1); // still one Vehicle row
    expect(result.report.collisions).toHaveLength(1);
    expect(result.report.collisions[0].plate).toBe("CAR1234");

    // Both claimants get an ownership row, pointing at the same real vehicle id...
    expect(result.ownerships).toHaveLength(2);
    expect(result.ownerships.map((o) => o.customerId).sort()).toEqual(["c1", "c2"]);
    expect(new Set(result.ownerships.map((o) => o.vehicleId)).size).toBe(1);
    // ...but neither is left marked as the current owner.
    expect(result.ownerships.every((o) => o.endDate !== null)).toBe(true);
  });

  it("routes a blank plate into noUsablePlate instead of creating a vehicle", () => {
    const customers = [
      customer({ id: "c1", vehicles: [{ plate: "  ", model: "Unknown", color: "" }] }),
    ];
    const result = buildVehicleMigration(customers, [], NOW, fakeIdGenerator());

    expect(result.vehicles).toHaveLength(0);
    expect(result.report.noUsablePlate).toHaveLength(1);
    expect(result.report.noUsablePlate[0].customerId).toBe("c1");
  });

  it("flags a vehicle description that can't be split into make+model as low-confidence", () => {
    const customers = [
      customer({ id: "c1", vehicles: [{ plate: "CAR-9999", model: "", color: "" }] }),
    ];
    const result = buildVehicleMigration(customers, [], NOW, fakeIdGenerator());

    expect(result.report.lowConfidenceParses).toHaveLength(1);
    expect(result.report.lowConfidenceParses[0].plate).toBe("CAR9999");
  });

  it("creates a vehicle from a booking whose plate isn't on any customer record", () => {
    const bookings = [
      booking({
        id: "B-1",
        customerId: null,
        customerName: "Walk-in",
        plate: "WP CAB-2204",
        vehicleModel: "Nissan X-Trail 2017",
      }),
    ];
    const result = buildVehicleMigration([], bookings, NOW, fakeIdGenerator());

    expect(result.vehicles).toHaveLength(1);
    expect(result.vehicles[0].plate).toBe("WPCAB2204");
    expect(result.plateIndex["WPCAB2204"]).toMatchObject({ vehicleId: result.vehicles[0].id });
    // No customerId on the booking, so no ownership row — but the vehicle
    // itself is still created, not dropped.
    expect(result.ownerships).toHaveLength(0);
  });

  it("defaults to a real random id generator when none is injected", () => {
    const customers = [
      customer({
        id: "c1",
        vehicles: [{ plate: "CAR-5000", model: "Suzuki Alto 2020", color: "" }],
      }),
    ];
    const result = buildVehicleMigration(customers, [], NOW);
    // A real UUID, not the plate and not a fake sequential id.
    expect(result.vehicles[0].id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
