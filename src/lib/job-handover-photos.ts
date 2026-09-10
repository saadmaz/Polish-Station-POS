// Browser-only: client-side compression + Storage upload for the delivery
// handover's 4 "after" photos and the customer acceptance signature (Phase
// 7). Job-scoped, not inspection-scoped — the inspection is already signed
// and immutable by delivery time — so this doesn't live in
// inspection-photos.ts, but reuses its compression helper rather than
// duplicating the canvas resize logic.
import { ref as storageRef, uploadBytes } from "firebase/storage";
import { storage } from "./firebase";
import { resizeToJpeg, MAX_LONG_EDGE, JPEG_QUALITY } from "./inspection-photos";

export type HandoverPhotoSlot =
  "front_left_34" | "front_right_34" | "rear_left_34" | "rear_right_34";

/**
 * Compresses and uploads one "after" photo. Not versioned and not queued
 * offline (see the Phase 7 plan's scope note) — a retake before "Confirm
 * Delivery" simply overwrites the same slot's path, same as an intake photo
 * before its inspection is signed.
 */
export async function captureHandoverPhoto(
  jobId: string,
  slotKey: HandoverPhotoSlot,
  file: File,
): Promise<{ slotKey: HandoverPhotoSlot; storagePath: string; capturedAt: string }> {
  const capturedAt = new Date().toISOString();
  const blob = await resizeToJpeg(file, MAX_LONG_EDGE, JPEG_QUALITY);
  const storagePath = `jobs/${jobId}/handover/${slotKey}.jpg`;
  await uploadBytes(storageRef(storage, storagePath), blob, { contentType: "image/jpeg" });
  return { slotKey, storagePath, capturedAt };
}

/** Uploads the customer's acceptance signature PNG. */
export async function uploadHandoverAcceptancePng(jobId: string, blob: Blob): Promise<string> {
  const storagePath = `jobs/${jobId}/handover/customer-acceptance.png`;
  await uploadBytes(storageRef(storage, storagePath), blob, { contentType: "image/png" });
  return storagePath;
}
