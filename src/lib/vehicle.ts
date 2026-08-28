// First-class Vehicle entity (Firestore `vehicles` collection) and its
// ownership history (`vehicleOwnerships`).
//
// Supersedes Customer.vehicles[] in db.ts — an embedded, id-less array with
// no ownership history, which is what made "does this app have a first-class
// vehicle entity" a "no" in the audit. That field stays in place for now:
// this file only adds the new model and a migration planner (see
// vehicle-migration.ts). The UI cutover — reading/writing through this
// collection instead of Customer.vehicles[], and removing the old field —
// is a later stage, once the migration below has actually been reviewed and
// run against real data.

export type SizeClass = "hatchback" | "sedan" | "suv" | "van" | "cab" | "motorcycle" | "other";

export const SIZE_CLASSES: SizeClass[] = [
  "hatchback",
  "sedan",
  "suv",
  "van",
  "cab",
  "motorcycle",
  "other",
];

export interface Vehicle {
  id: string; // random — NOT derived from plate; see PlateIndexEntry below for why
  plate: string; // normalized: uppercase, whitespace/punctuation stripped
  plateDisplay: string; // as originally entered, for printing/display
  make: string;
  model: string;
  year: number | null;
  colour: string;
  sizeClass: SizeClass;
  notes: string;
  // True only for rows created by the legacy-data migration: there is no
  // historical signal for size class anywhere in the old data, so migrated
  // rows default to "other" and get flagged here rather than the migration
  // guessing a real class. Never set by the create-vehicle UI, which
  // requires a real answer.
  needsSizeClassReview?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VehicleOwnership {
  id: string;
  vehicleId: string;
  customerId: string;
  startDate: string; // ISO
  endDate: string | null; // null = current owner
  createdAt: string;
}

/**
 * `plates/{normalizedPlate}` -> vehicleId, mirroring the existing
 * `usernames/{username}` -> staffId index pattern in firestore.rules.
 *
 * Vehicle.id is a random doc id, not the plate itself: Firestore doc ids
 * are immutable, and a plate can change (a typo correction, a vehicle
 * re-registered with a new plate) without that ever meaning "this is a
 * different vehicle" — every Job/Booking/StockMovement reference stays
 * valid across a plate change because none of them point at the plate,
 * they point at this id. Only this index entry needs to move.
 */
export interface PlateIndexEntry {
  vehicleId: string;
  createdAt: string;
}

/** Uppercase, strip whitespace and punctuation — the doc id / uniqueness key. */
export function normalizePlate(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export interface ParsedVehicleDescription {
  make: string;
  model: string;
  year: number | null;
}

/**
 * Best-effort split of a free-text "Make Model Year" string (e.g. "Toyota
 * Aqua 2018") into parts: first remaining token -> make, everything else ->
 * model, with a standalone plausible-year token pulled out first regardless
 * of position. `model` (and, for a blank input, `make` too) comes back ""
 * when there's nothing to split — callers should treat an empty make or
 * model as low-confidence and route it to a review queue rather than
 * guessing further.
 */
export function parseVehicleDescription(raw: string): ParsedVehicleDescription {
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { make: "", model: "", year: null };

  const yearRe = /^(19|20)\d{2}$/;
  const maxYear = new Date().getFullYear() + 1;
  let year: number | null = null;
  const rest = tokens.filter((t) => {
    if (year !== null || !yearRe.test(t)) return true;
    const n = Number(t);
    if (n < 1980 || n > maxYear) return true;
    year = n;
    return false;
  });

  const make = rest[0] ?? "";
  const model = rest.slice(1).join(" ");
  return { make, model, year };
}
