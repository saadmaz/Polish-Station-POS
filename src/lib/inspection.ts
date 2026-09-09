// The vehicle inspection record (Firestore `inspections` collection, one per
// intake/re-inspection event). Lives alongside a Job (see job.ts) as a
// top-level collection carrying a `jobId` foreign key — same shape as
// JobEvent/LeadEvent, not a Firestore subcollection, so it follows the one
// pattern this codebase already uses everywhere for "belongs to X" records.
//
// Purpose, stated precisely (do not add fields that serve neither): produce a
// record that survives two arguments — "you damaged my car" and "this isn't
// what I paid for."
//
// The inspection never duplicates Job's customer/vehicle data as *editable*
// fields — vehicleSnapshot/customerSnapshot are a read-only copy taken at
// creation via buildInspectionSnapshots(). If they're wrong, they're fixed on
// the Job, not here.
import type { Job, BodyType } from "./job";

// ── Intake baseline ──────────────────────────────────────────────────────

export type FuelLevel = "E" | "quarter" | "half" | "three_quarter" | "F";

export const FUEL_LEVELS: FuelLevel[] = ["E", "quarter", "half", "three_quarter", "F"];

export type WarningLight =
  "none" | "check_engine" | "abs" | "airbag" | "battery" | "oil" | "tpms" | "brake" | "other";

export const WARNING_LIGHTS: WarningLight[] = [
  "none",
  "check_engine",
  "abs",
  "airbag",
  "battery",
  "oil",
  "tpms",
  "brake",
  "other",
];

// ── Condition ─────────────────────────────────────────────────────────────

// Mirrored onto Job.conditionFlags in the same write batch (see store.tsx
// wiring) so pricing/scheduling can see them without loading the inspection.
export type ConditionFlag =
  | "pet_hair"
  | "smoke_odour"
  | "mould_or_water_damage"
  | "heavy_tar_or_overspray"
  | "active_rust"
  | "kerbed_alloys"
  | "missing_wheel_caps"
  | "glass_chips"
  | "cracked_glass"
  | "tint_damage"
  | "cracked_light_lens"
  | "faded_trim"
  | "biohazard"
  | "aftermarket_bodykit";

export const CONDITION_FLAGS: ConditionFlag[] = [
  "pet_hair",
  "smoke_odour",
  "mould_or_water_damage",
  "heavy_tar_or_overspray",
  "active_rust",
  "kerbed_alloys",
  "missing_wheel_caps",
  "glass_chips",
  "cracked_glass",
  "tint_damage",
  "cracked_light_lens",
  "faded_trim",
  "biohazard",
  "aftermarket_bodykit",
];

export type ExistingCoating = "none" | "wax" | "sealant" | "ceramic" | "graphene" | "unknown";

export const EXISTING_COATINGS: ExistingCoating[] = [
  "none",
  "wax",
  "sealant",
  "ceramic",
  "graphene",
  "unknown",
];

export interface PaintHistory {
  existingCoating: ExistingCoating;
  coatingAgeMonths: number | null;
  priorCorrection: boolean | "unknown";
  resprayedPanels: string[]; // panel keys, matches damage-diagram panel naming
  wrapOrPpf: boolean;
}

export type InteriorMaterial = "fabric" | "leather" | "mixed";

export type InteriorOdour = "smoke" | "pet" | "mildew" | "fuel" | "food" | "none";

export const INTERIOR_ODOURS: InteriorOdour[] = ["smoke", "pet", "mildew", "fuel", "food", "none"];

export interface InteriorCondition {
  material: InteriorMaterial;
  odours: InteriorOdour[];
  stains: boolean;
  tears: boolean;
  burns: boolean;
  trimDamage: boolean;
  headlinerStains: boolean;
}

// Must be *tested*, not eyeballed — "not_tested" is a deliberate, explicit
// choice, never the default a save falls back to.
export type SystemCheckState = "working" | "faulty" | "not_tested";

export type SystemCheckKey =
  | "ac_cooling"
  | "heater"
  | "all_power_windows"
  | "power_mirrors"
  | "wipers"
  | "washer_jets"
  | "exterior_lights"
  | "interior_lights"
  | "horn"
  | "audio_head_unit"
  | "speakers"
  | "reverse_camera"
  | "sunroof"
  | "boot_release"
  | "central_locking";

export const SYSTEM_CHECK_KEYS: SystemCheckKey[] = [
  "ac_cooling",
  "heater",
  "all_power_windows",
  "power_mirrors",
  "wipers",
  "washer_jets",
  "exterior_lights",
  "interior_lights",
  "horn",
  "audio_head_unit",
  "speakers",
  "reverse_camera",
  "sunroof",
  "boot_release",
  "central_locking",
];

export interface SystemCheckItem {
  key: SystemCheckKey;
  state: SystemCheckState;
  note: string; // required (non-empty) when state === "faulty", see assertValidSystemCheckItem
}

export type InventoryItemState = "present" | "absent" | "na";

export type InventoryItemKey =
  | "floor_mats_front"
  | "floor_mats_rear"
  | "boot_mat"
  | "spare_wheel"
  | "wheel_jack"
  | "wheel_brace"
  | "tool_kit"
  | "first_aid_kit"
  | "fire_extinguisher"
  | "jumper_cables"
  | "umbrella"
  | "phone_holder"
  | "dash_cam"
  | "charger_cables"
  | "sunshade"
  | "child_seat"
  | "parking_rfid_tag"
  | "sunglasses"
  | "personal_belongings";

export const INVENTORY_ITEM_KEYS: InventoryItemKey[] = [
  "floor_mats_front",
  "floor_mats_rear",
  "boot_mat",
  "spare_wheel",
  "wheel_jack",
  "wheel_brace",
  "tool_kit",
  "first_aid_kit",
  "fire_extinguisher",
  "jumper_cables",
  "umbrella",
  "phone_holder",
  "dash_cam",
  "charger_cables",
  "sunshade",
  "child_seat",
  "parking_rfid_tag",
  "sunglasses",
  "personal_belongings",
];

// Named InspectionInventoryItem, not InventoryItem — db.ts already exports an
// InventoryItem for the stock/equipment module, and store.tsx imports both.
export interface InspectionInventoryItem {
  key: InventoryItemKey;
  state: InventoryItemState;
  note: string; // required (non-empty) when key === "personal_belongings" && state === "present"
}

// ── Photo capture (Phase 2) ──────────────────────────────────────────────

export type PhotoSlotKey =
  | "cluster"
  | "front_left_34"
  | "front_right_34"
  | "rear_left_34"
  | "rear_right_34"
  | "roof"
  | "cabin_front"
  | "cabin_rear"
  | "boot"
  | "wheel_fl"
  | "wheel_fr"
  | "wheel_rl"
  | "wheel_rr"
  | "engine_bay";

// Always required. "engine_bay" is excluded here — it's required only when an
// engine-bay service is on the job, see isPhotoSlotRequired().
export const ALWAYS_REQUIRED_PHOTO_SLOTS: PhotoSlotKey[] = [
  "cluster",
  "front_left_34",
  "front_right_34",
  "rear_left_34",
  "rear_right_34",
  "roof",
  "cabin_front",
  "cabin_rear",
  "boot",
  "wheel_fl",
  "wheel_fr",
  "wheel_rl",
  "wheel_rr",
];

export const ALL_PHOTO_SLOTS: PhotoSlotKey[] = [...ALWAYS_REQUIRED_PHOTO_SLOTS, "engine_bay"];

export function isPhotoSlotRequired(
  slot: PhotoSlotKey,
  engineBayServiceSelected: boolean,
): boolean {
  if (slot === "engine_bay") return engineBayServiceSelected;
  return ALWAYS_REQUIRED_PHOTO_SLOTS.includes(slot);
}

/** Required slots with no uploaded photo yet — drives the stepper's forward-navigation block. */
export function missingRequiredPhotoSlots(
  photos: readonly Pick<Photo, "slotKey" | "uploadedAt">[],
  engineBayServiceSelected: boolean,
): PhotoSlotKey[] {
  const uploadedSlots = new Set(
    photos.filter((p) => p.uploadedAt != null && p.slotKey).map((p) => p.slotKey),
  );
  const required = engineBayServiceSelected ? ALL_PHOTO_SLOTS : ALWAYS_REQUIRED_PHOTO_SLOTS;
  return required.filter((slot) => !uploadedSlots.has(slot));
}

export interface Photo {
  id: string;
  slotKey: PhotoSlotKey | null; // null = free-form additional photo, not tied to a required slot
  storagePath: string; // jobs/{jobId}/inspections/{inspectionId}/photos/{photoId}.jpg
  thumbnailStoragePath: string;
  // Deliberately separate — they differ whenever the offline queue drains,
  // and conflating them is the first thing challenged in a dispute.
  capturedAt: string; // device clock, set the moment the photo is taken
  uploadedAt: string | null; // server clock, set once the upload completes; null while queued offline
}

// ── Damage diagram (Phase 3) ─────────────────────────────────────────────

export type DamageMarkerView = "front" | "rear" | "left" | "right" | "top";

export type DamageMarkerType =
  | "scratch"
  | "dent"
  | "chip"
  | "crack"
  | "rust"
  | "swirl"
  | "paint_defect"
  | "scuff"
  | "missing_part"
  | "other";

export const DAMAGE_MARKER_TYPES: DamageMarkerType[] = [
  "scratch",
  "dent",
  "chip",
  "crack",
  "rust",
  "swirl",
  "paint_defect",
  "scuff",
  "missing_part",
  "other",
];

export type DamageMarkerSeverity = "minor" | "moderate" | "severe";

export const DAMAGE_MARKER_SEVERITIES: DamageMarkerSeverity[] = ["minor", "moderate", "severe"];

export interface DamageMarker {
  seq: number;
  view: DamageMarkerView;
  x: number; // normalized 0-1 against that view's viewBox
  y: number;
  type: DamageMarkerType;
  severity: DamageMarkerSeverity;
  note: string;
  photoIds: string[]; // ids into Inspection.photos
}

/** moderate/severe cannot be saved without a linked photo — the deliberate
 *  concession is `minor`, to keep capture speed on heavily swirled paint. */
export function damageMarkerRequiresPhoto(severity: DamageMarkerSeverity): boolean {
  return severity !== "minor";
}

export class DamageMarkerMissingPhotoError extends Error {
  constructor(public readonly seq: number) {
    super(`Damage marker #${seq} is moderate/severe and needs at least one linked photo`);
    this.name = "DamageMarkerMissingPhotoError";
  }
}

export function assertValidDamageMarker(
  marker: Pick<DamageMarker, "seq" | "severity" | "photoIds">,
): void {
  if (damageMarkerRequiresPhoto(marker.severity) && marker.photoIds.length === 0) {
    throw new DamageMarkerMissingPhotoError(marker.seq);
  }
}

// ── Scope & sign-off ──────────────────────────────────────────────────────

export interface AddOnDiscussed {
  serviceId: string;
  estimatedAmount: number;
  accepted: boolean;
}

export interface CustomerSignature {
  storagePath: string; // PNG, jobs/{jobId}/inspections/{inspectionId}/customer-signature.png
  signerName: string;
  signedAt: string;
}

export interface RemoteAck {
  sentAt: string;
  channel: string; // e.g. "whatsapp"
  replyText: string | null;
  replyReceivedAt: string | null;
  screenshotPath: string | null;
}

export interface InspectorSignature {
  storagePath: string;
  staffId: string;
  staffName: string;
  signedAt: string;
}

export interface DeviceInfo {
  userAgent: string;
  screenSize: string;
  appVersion: string;
}

export interface Geo {
  lat: number;
  lng: number;
  accuracy: number;
}

// ── Identification snapshots ─────────────────────────────────────────────
// Read-only copies taken from Job at creation time — never edited on the
// inspection itself. Deliberately a narrower shape than Job.vehicle /
// Job.customerSnapshot: only what the report/diagram need, see
// buildInspectionSnapshots() below for the exact copy.

export interface InspectionVehicleSnapshot {
  plate: string;
  make: string;
  model: string;
  year: number | null;
  colour: string;
  bodyType: BodyType;
}

export interface InspectionCustomerSnapshot {
  name: string;
  phone: string;
}

// ── State ─────────────────────────────────────────────────────────────────

export type InspectionStatus = "draft" | "pending_acknowledgment" | "signed" | "superseded";

export const LEGAL_INSPECTION_TRANSITIONS: Record<InspectionStatus, readonly InspectionStatus[]> = {
  draft: ["pending_acknowledgment", "signed"], // pending_acknowledgment = Path B, signed = Path A (customer present)
  pending_acknowledgment: ["signed"], // only after remoteAck is recorded
  // The only way out of "signed" — never a generic edit, only ever performed
  // by createSupersedingInspection()'s write, alongside creating the new doc
  // that supersedes this one. See assertCanSupersede().
  signed: ["superseded"],
  superseded: [],
};

// Once signed (or superseded), the document is immutable — corrections
// create a new inspection with `supersedes` set; enforce this in
// firestore.rules too, not only here.
export const IMMUTABLE_INSPECTION_STATUSES: readonly InspectionStatus[] = ["signed", "superseded"];

export function isInspectionEditable(status: InspectionStatus): boolean {
  return !IMMUTABLE_INSPECTION_STATUSES.includes(status);
}

export function isLegalInspectionTransition(from: InspectionStatus, to: InspectionStatus): boolean {
  return LEGAL_INSPECTION_TRANSITIONS[from].includes(to);
}

export class IllegalInspectionTransitionError extends Error {
  constructor(
    public readonly from: InspectionStatus,
    public readonly to: InspectionStatus,
  ) {
    super(`Illegal inspection transition: "${from}" -> "${to}"`);
    this.name = "IllegalInspectionTransitionError";
  }
}

export function assertLegalInspectionTransition(
  from: InspectionStatus,
  to: InspectionStatus,
): void {
  if (!isLegalInspectionTransition(from, to)) {
    throw new IllegalInspectionTransitionError(from, to);
  }
}

export class InspectionNotSignedError extends Error {
  constructor(public readonly status: InspectionStatus) {
    super(`Only a signed inspection can be superseded (got "${status}")`);
    this.name = "InspectionNotSignedError";
  }
}

/** Guards createSupersedingInspection()'s write — only a signed inspection
 *  can be corrected this way; draft/pending_acknowledgment are still plain
 *  editable documents and don't need a supersession chain. */
export function assertCanSupersede(status: InspectionStatus): void {
  if (status !== "signed") {
    throw new InspectionNotSignedError(status);
  }
}

// Default threshold from the spec's Phase 4: work must not start on the
// parent job while its inspection sits in "pending_acknowledgment" beyond
// this long. Not currently user-configurable — a constant here, same as
// every other business rule in this file, until there's an actual settings
// UI need for it.
export const PENDING_ACKNOWLEDGMENT_THRESHOLD_MS = 4 * 60 * 60 * 1000;

/** True once a "pending_acknowledgment" inspection has sat unconfirmed
 *  longer than the threshold — the signal that blocks the parent job from
 *  moving to "in_progress" (see _app.jobs.tsx). Keyed off `remoteAck.sentAt`
 *  (when the WhatsApp ack request went out), not `updatedAt`, since staff
 *  editing an unrelated field must not reset this clock. */
export function isPendingAcknowledgmentOverdue(
  inspection: Pick<Inspection, "status" | "remoteAck">,
  now: number = Date.now(),
  thresholdMs: number = PENDING_ACKNOWLEDGMENT_THRESHOLD_MS,
): boolean {
  if (inspection.status !== "pending_acknowledgment") return false;
  if (!inspection.remoteAck) return false;
  return now - new Date(inspection.remoteAck.sentAt).getTime() > thresholdMs;
}

// ── The document ─────────────────────────────────────────────────────────

export interface Inspection {
  id: string;
  jobId: string;
  jobRef: string; // denormalized "PS-0501" for display without a join back to Job

  vehicleSnapshot: InspectionVehicleSnapshot;
  customerSnapshot: InspectionCustomerSnapshot;
  vin: string | null; // optional; filled in here when Job.vehicle.vin was blank, never required

  // Intake baseline
  odometer: number;
  odometerPhotoId: string; // points into photos[]
  fuelLevel: FuelLevel;
  warningLights: WarningLight[]; // "none" must be an explicit selection
  startsNormally: boolean;
  knownIssues: string;
  keysHandedOver: number;

  // Condition
  damageMarkers: DamageMarker[];
  conditionFlags: ConditionFlag[]; // mirrored onto Job.conditionFlags in the same batch
  paintHistory: PaintHistory;
  interiorCondition: InteriorCondition;
  systemsCheck: SystemCheckItem[];
  inventoryItems: InspectionInventoryItem[];

  // Scope & expectations
  customerPriority: string; // required, min 10 chars — surfaced verbatim on delivery handover
  addOnsDiscussed: AddOnDiscussed[];
  scopeExclusions: string;
  expectationNotes: string;

  // Evidence & attribution
  photos: Photo[];
  inspectedWithCustomer: boolean; // drives the Path A / Path B sign-off split
  customerSignature: CustomerSignature | null;
  remoteAck: RemoteAck | null;
  // Null until the inspector actually signs at Phase 4 sign-off — the draft
  // itself must be creatable well before that (Phase 6 offline creation), so
  // unlike inspectedById/inspectedByName below (set the moment the draft is
  // opened) this can't be required at create time.
  inspectorSignature: InspectorSignature | null;
  inspectedById: string;
  inspectedByName: string;
  inspectedAt: string;
  deviceInfo: DeviceInfo;
  geo: Geo | null;

  // Firestore rules can't iterate arrays to check "every moderate/severe
  // marker has a photo" or "every required slot was uploaded" per-element —
  // there's no forEach/filter over list data in the rules language. This
  // flag is computed client-side by the same code that already renders the
  // stepper's blocking state (missingRequiredPhotoSlots() /
  // assertValidDamageMarker() above) and is the one thing firestore.rules
  // checks before allowing status to move to "pending_acknowledgment" or
  // "signed". Same class of tradeoff this codebase already accepts
  // elsewhere (e.g. invoices' rules trust store.tsx's computed total rather
  // than re-summing lines in rules).
  photoRequirementsMet: boolean;

  status: InspectionStatus;
  supersedes: string | null;
  supersededBy: string | null;
  createdAt: string;
  updatedAt: string;
  updatedById: string;
  updatedByName: string;
}

/** The one inspection that represents a job's current state — every count,
 *  metric, and status check excludes "superseded" per the acceptance
 *  criteria, and among what's left the most recently created one wins.
 *  Shared by the inspection worklist and the Jobs page's own status-
 *  transition guard (see isPendingAcknowledgmentOverdue above). */
export function latestNonSupersededInspection(
  inspections: readonly Inspection[],
  jobId: string,
): Inspection | null {
  const candidates = inspections
    .filter((i) => i.jobId === jobId && i.status !== "superseded")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return candidates[0] ?? null;
}

/**
 * Builds (does not write) the read-only vehicle/customer snapshot an
 * inspection is created with, copied from the Job at that instant. Throws if
 * the job has no vehicle intake data yet — an inspection cannot start before
 * that exists.
 */
export function buildInspectionSnapshots(job: Pick<Job, "vehicle" | "customerSnapshot">): {
  vehicleSnapshot: InspectionVehicleSnapshot;
  customerSnapshot: InspectionCustomerSnapshot;
} {
  if (!job.vehicle) {
    throw new Error("Cannot start an inspection for a job with no vehicle intake data");
  }
  const { plate, make, model, year, colour, bodyType } = job.vehicle;
  const customerSnapshot = {
    name: job.customerSnapshot?.name ?? "",
    phone: job.customerSnapshot?.phone ?? "",
  };
  return { vehicleSnapshot: { plate, make, model, year, colour, bodyType }, customerSnapshot };
}
