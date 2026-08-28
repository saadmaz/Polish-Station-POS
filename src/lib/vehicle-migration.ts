// Plans (but never writes) the Vehicle/VehicleOwnership backfill from the
// legacy data: Customer.vehicles[] (embedded, no id) and Booking.plate/
// vehicleModel (free text, may or may not match anything on the customer).
//
// Pure functions over plain arrays so the plan can be fully unit-tested and
// dry-run without touching Firestore. scripts/migrate-vehicles.ts is the
// thin script that reads real data, calls this, prints the report, and
// (only with --confirm) writes the result.
import {
  normalizePlate,
  parseVehicleDescription,
  type Vehicle,
  type VehicleOwnership,
  type PlateIndexEntry,
} from "./vehicle";
import { deriveSizeClass } from "./vehicle-size-class";
import type { Customer, Booking } from "./db";

export interface VehicleMigrationSource {
  plateRaw: string;
  vehicleDescription: string; // the free-text "model" field
  colour: string;
  customerId: string | null;
  customerName: string;
  origin: "customer" | "booking";
}

export interface VehicleMigrationCollision {
  plate: string;
  sources: VehicleMigrationSource[]; // 2+ distinct customerIds claiming this plate
}

export interface VehicleMigrationReport {
  vehiclesCreated: number;
  ownershipsCreated: number;
  collisions: VehicleMigrationCollision[];
  noUsablePlate: VehicleMigrationSource[];
  lowConfidenceParses: { plate: string; raw: string }[];
}

export interface VehicleMigrationResult {
  vehicles: Vehicle[];
  ownerships: VehicleOwnership[];
  // keyed by normalized plate — the id of the plates/{plate} doc to write
  plateIndex: Record<string, PlateIndexEntry>;
  report: VehicleMigrationReport;
}

function collectSources(customers: Customer[], bookings: Booking[]): VehicleMigrationSource[] {
  const sources: VehicleMigrationSource[] = [];
  for (const c of customers) {
    for (const v of c.vehicles) {
      sources.push({
        plateRaw: v.plate,
        vehicleDescription: v.model,
        colour: v.color,
        customerId: c.id,
        customerName: c.name,
        origin: "customer",
      });
    }
  }
  for (const b of bookings) {
    sources.push({
      plateRaw: b.plate,
      vehicleDescription: b.vehicleModel,
      colour: "",
      customerId: b.customerId,
      customerName: b.customerName,
      origin: "booking",
    });
  }
  return sources;
}

/**
 * Builds the full set of Vehicle/VehicleOwnership rows the migration would
 * create, plus a report of everything that needed a judgment call:
 * - a plate claimed by more than one distinct customerId is a collision:
 *   both ownerships are recorded (nothing dropped) but neither is marked
 *   "current" (endDate stays non-null) — a human resolves which is real.
 * - a blank/unusable plate can't get a Vehicle row at all; the source is
 *   reported so the caller can decide how to handle the booking/customer
 *   record that referenced it (see the review-queue note in the plan).
 * - a vehicleDescription that can't be split into a real make+model is
 *   flagged as low-confidence, not silently guessed.
 */
export function buildVehicleMigration(
  customers: Customer[],
  bookings: Booking[],
  now: string = new Date().toISOString(),
  // Injectable for tests that need to assert on a specific id; defaults to
  // a real random id generator for production/script use.
  generateId: () => string = () => crypto.randomUUID(),
): VehicleMigrationResult {
  const sources = collectSources(customers, bookings);

  const noUsablePlate: VehicleMigrationSource[] = [];
  const byPlate = new Map<string, VehicleMigrationSource[]>();
  for (const s of sources) {
    const plate = normalizePlate(s.plateRaw);
    if (!plate) {
      noUsablePlate.push(s);
      continue;
    }
    const list = byPlate.get(plate) ?? [];
    list.push(s);
    byPlate.set(plate, list);
  }

  const vehicles: Vehicle[] = [];
  const ownerships: VehicleOwnership[] = [];
  const plateIndex: Record<string, PlateIndexEntry> = {};
  const collisions: VehicleMigrationCollision[] = [];
  const lowConfidenceParses: { plate: string; raw: string }[] = [];

  for (const [plate, list] of byPlate) {
    const withDescription = list.find((s) => s.vehicleDescription.trim().length > 0) ?? list[0];
    const { make, model, year } = parseVehicleDescription(withDescription.vehicleDescription);
    if (!make || !model) {
      lowConfidenceParses.push({ plate, raw: withDescription.vehicleDescription });
    }
    const colour = list.find((s) => s.colour.trim().length > 0)?.colour ?? "";
    const derivedSizeClass = deriveSizeClass(make, model);

    const vehicleId = generateId();
    vehicles.push({
      id: vehicleId,
      plate,
      plateDisplay: withDescription.plateRaw.trim(),
      make,
      model,
      year,
      colour,
      sizeClass: derivedSizeClass ?? "other",
      notes: "",
      // Only flagged for review when the lookup table had nothing to offer —
      // a confident match doesn't need a human to re-check it.
      needsSizeClassReview: derivedSizeClass === null,
      createdAt: now,
      updatedAt: now,
    });
    plateIndex[plate] = { vehicleId, createdAt: now };

    const distinctCustomerIds = Array.from(
      new Set(list.map((s) => s.customerId).filter((id): id is string => !!id)),
    );

    if (distinctCustomerIds.length > 1) {
      collisions.push({ plate, sources: list });
      for (const custId of distinctCustomerIds) {
        ownerships.push({
          id: generateId(),
          vehicleId,
          customerId: custId,
          startDate: now,
          endDate: now, // provisionally closed: nobody is "current" until a human resolves the collision
          createdAt: now,
        });
      }
      continue;
    }

    const soleCustomerId = distinctCustomerIds[0];
    if (soleCustomerId) {
      ownerships.push({
        id: generateId(),
        vehicleId,
        customerId: soleCustomerId,
        startDate: now,
        endDate: null,
        createdAt: now,
      });
    }
  }

  return {
    vehicles,
    ownerships,
    plateIndex,
    report: {
      vehiclesCreated: vehicles.length,
      ownershipsCreated: ownerships.length,
      collisions,
      noUsablePlate,
      lowConfidenceParses,
    },
  };
}
