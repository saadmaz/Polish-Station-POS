import { describe, it, expect } from "vitest";
import {
  isLegalInspectionTransition,
  assertLegalInspectionTransition,
  isInspectionEditable,
  assertCanSupersede,
  damageMarkerRequiresPhoto,
  assertValidDamageMarker,
  isPhotoSlotRequired,
  missingRequiredPhotoSlots,
  buildInspectionSnapshots,
  isPendingAcknowledgmentOverdue,
  PENDING_ACKNOWLEDGMENT_THRESHOLD_MS,
  IllegalInspectionTransitionError,
  InspectionNotSignedError,
  DamageMarkerMissingPhotoError,
  ALWAYS_REQUIRED_PHOTO_SLOTS,
  type InspectionStatus,
  type Photo,
} from "./inspection";

describe("the happy-path chains are legal", () => {
  it("draft -> pending_acknowledgment -> signed (Path B)", () => {
    expect(isLegalInspectionTransition("draft", "pending_acknowledgment")).toBe(true);
    expect(isLegalInspectionTransition("pending_acknowledgment", "signed")).toBe(true);
  });

  it("draft -> signed directly (Path A, customer present)", () => {
    expect(isLegalInspectionTransition("draft", "signed")).toBe(true);
  });

  it("signed -> superseded (the one sanctioned move out of an immutable doc)", () => {
    expect(isLegalInspectionTransition("signed", "superseded")).toBe(true);
  });
});

describe("terminal / immutable statuses", () => {
  it("superseded has no legal outbound transitions", () => {
    for (const to of ["draft", "pending_acknowledgment", "signed"] as InspectionStatus[]) {
      expect(isLegalInspectionTransition("superseded", to)).toBe(false);
    }
  });

  it("signed cannot go back to draft or pending_acknowledgment", () => {
    expect(isLegalInspectionTransition("signed", "draft")).toBe(false);
    expect(isLegalInspectionTransition("signed", "pending_acknowledgment")).toBe(false);
  });

  it("isInspectionEditable is false only for signed/superseded", () => {
    expect(isInspectionEditable("draft")).toBe(true);
    expect(isInspectionEditable("pending_acknowledgment")).toBe(true);
    expect(isInspectionEditable("signed")).toBe(false);
    expect(isInspectionEditable("superseded")).toBe(false);
  });
});

describe("illegal transitions are rejected, not silently applied", () => {
  it("assertLegalInspectionTransition throws for pending_acknowledgment -> draft", () => {
    expect(() => assertLegalInspectionTransition("pending_acknowledgment", "draft")).toThrow(
      IllegalInspectionTransitionError,
    );
  });
});

describe("supersession", () => {
  it("assertCanSupersede allows only a signed inspection", () => {
    expect(() => assertCanSupersede("signed")).not.toThrow();
  });

  it("assertCanSupersede rejects draft/pending_acknowledgment/superseded", () => {
    for (const status of ["draft", "pending_acknowledgment", "superseded"] as InspectionStatus[]) {
      expect(() => assertCanSupersede(status)).toThrow(InspectionNotSignedError);
    }
  });
});

describe("damage marker photo requirement", () => {
  it("minor markers never require a photo", () => {
    expect(damageMarkerRequiresPhoto("minor")).toBe(false);
  });

  it("moderate and severe markers require a photo", () => {
    expect(damageMarkerRequiresPhoto("moderate")).toBe(true);
    expect(damageMarkerRequiresPhoto("severe")).toBe(true);
  });

  it("assertValidDamageMarker throws for a severe marker with no linked photo", () => {
    expect(() => assertValidDamageMarker({ seq: 3, severity: "severe", photoIds: [] })).toThrow(
      DamageMarkerMissingPhotoError,
    );
  });

  it("assertValidDamageMarker passes for a minor marker with no photo", () => {
    expect(() =>
      assertValidDamageMarker({ seq: 1, severity: "minor", photoIds: [] }),
    ).not.toThrow();
  });

  it("assertValidDamageMarker passes for a moderate marker with a linked photo", () => {
    expect(() =>
      assertValidDamageMarker({ seq: 2, severity: "moderate", photoIds: ["photo-1"] }),
    ).not.toThrow();
  });
});

describe("required photo slots", () => {
  it("engine_bay is required only when an engine-bay service is selected", () => {
    expect(isPhotoSlotRequired("engine_bay", false)).toBe(false);
    expect(isPhotoSlotRequired("engine_bay", true)).toBe(true);
  });

  it("every always-required slot is required regardless of engine-bay service", () => {
    for (const slot of ALWAYS_REQUIRED_PHOTO_SLOTS) {
      expect(isPhotoSlotRequired(slot, false)).toBe(true);
      expect(isPhotoSlotRequired(slot, true)).toBe(true);
    }
  });

  it("missingRequiredPhotoSlots reports only slots with no uploaded photo", () => {
    const photos: Pick<Photo, "slotKey" | "uploadedAt">[] = [
      { slotKey: "cluster", uploadedAt: "2026-09-09T10:00:00Z" },
      { slotKey: "roof", uploadedAt: null }, // captured but not yet uploaded — still missing
    ];
    const missing = missingRequiredPhotoSlots(photos, false);
    expect(missing).toContain("roof");
    expect(missing).toContain("front_left_34");
    expect(missing).not.toContain("cluster");
    expect(missing).not.toContain("engine_bay");
  });

  it("missingRequiredPhotoSlots includes engine_bay when that service is selected", () => {
    expect(missingRequiredPhotoSlots([], true)).toContain("engine_bay");
  });
});

describe("buildInspectionSnapshots", () => {
  it("copies only the fields the inspection needs, from Job.vehicle/customerSnapshot", () => {
    const job = {
      vehicle: {
        plate: "CAB-1234",
        make: "Toyota",
        model: "Aqua",
        year: 2018,
        colour: "White",
        bodyType: "hatchback" as const,
        mileage: 42000,
        vin: "JT123",
      },
      customerSnapshot: {
        name: "Nimal Perera",
        phone: "0771234567",
        email: "n@example.com",
        address: "Colombo",
      },
    };
    const { vehicleSnapshot, customerSnapshot } = buildInspectionSnapshots(job);
    expect(vehicleSnapshot).toEqual({
      plate: "CAB-1234",
      make: "Toyota",
      model: "Aqua",
      year: 2018,
      colour: "White",
      bodyType: "hatchback",
    });
    expect(customerSnapshot).toEqual({ name: "Nimal Perera", phone: "0771234567" });
  });

  it("throws when the job has no vehicle intake data yet", () => {
    expect(() =>
      buildInspectionSnapshots({ vehicle: undefined, customerSnapshot: undefined }),
    ).toThrow();
  });
});

describe("isPendingAcknowledgmentOverdue", () => {
  const NOW = new Date("2026-09-09T12:00:00Z").getTime();

  it("is false for any status other than pending_acknowledgment", () => {
    for (const status of ["draft", "signed", "superseded"] as InspectionStatus[]) {
      expect(
        isPendingAcknowledgmentOverdue(
          { status, remoteAck: { sentAt: new Date(NOW - 100 * 3600000).toISOString() } as never },
          NOW,
        ),
      ).toBe(false);
    }
  });

  it("is false when pending_acknowledgment but remoteAck was never recorded", () => {
    expect(
      isPendingAcknowledgmentOverdue({ status: "pending_acknowledgment", remoteAck: null }, NOW),
    ).toBe(false);
  });

  it("is false just under the threshold, true just over it", () => {
    const justUnder = NOW - (PENDING_ACKNOWLEDGMENT_THRESHOLD_MS - 60000);
    const justOver = NOW - (PENDING_ACKNOWLEDGMENT_THRESHOLD_MS + 60000);
    expect(
      isPendingAcknowledgmentOverdue(
        {
          status: "pending_acknowledgment",
          remoteAck: { sentAt: new Date(justUnder).toISOString() } as never,
        },
        NOW,
      ),
    ).toBe(false);
    expect(
      isPendingAcknowledgmentOverdue(
        {
          status: "pending_acknowledgment",
          remoteAck: { sentAt: new Date(justOver).toISOString() } as never,
        },
        NOW,
      ),
    ).toBe(true);
  });
});
