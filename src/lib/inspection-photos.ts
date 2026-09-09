// Browser-only: client-side compression + Storage upload for inspection
// photos (see inspection.ts's Photo type and Phase 2 of the inspection
// spec). Kept separate from store.tsx the same way pdf.ts is — Storage-
// touching, non-Firestore work called directly from the component that
// needs it, not proxied through useStore().
import { ref as storageRef, uploadBytes } from "firebase/storage";
import { storage } from "./firebase";
import type { Photo, PhotoSlotKey } from "./inspection";

const MAX_LONG_EDGE = 1600;
const JPEG_QUALITY = 0.8;
const THUMBNAIL_LONG_EDGE = 320;

/**
 * Resizes to a `maxLongEdge` long edge and re-encodes as JPEG via canvas.
 * This is also where EXIF gets dropped: canvas re-encoding carries no EXIF
 * data through at all, and there's no browser API to selectively keep
 * timestamp/orientation. Orientation survives anyway (browsers auto-rotate
 * on canvas draw per the source image's EXIF tag, so the re-encoded pixels
 * are already upright); the capture timestamp is tracked as Photo.capturedAt
 * instead of an EXIF tag, which is exactly what that field is for.
 */
async function resizeToJpeg(
  file: File | Blob,
  maxLongEdge: number,
  quality: number,
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxLongEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob) throw new Error("Canvas failed to encode JPEG");
    return blob;
  } finally {
    bitmap.close();
  }
}

/**
 * Compresses, uploads (full + thumbnail) and returns the Photo record ready
 * to merge into Inspection.photos — this does NOT write to Firestore itself,
 * callers persist the merged inspection via useStore()'s updateInspection,
 * same division of labour as pdf.ts's generateJobCardPDF (Storage write) vs.
 * store.tsx's updateJob (Firestore write).
 */
export async function captureInspectionPhoto(
  jobId: string,
  inspectionId: string,
  slotKey: PhotoSlotKey | null,
  file: File,
): Promise<Photo> {
  const capturedAt = new Date().toISOString();
  const photoId = crypto.randomUUID();
  const [full, thumbnail] = await Promise.all([
    resizeToJpeg(file, MAX_LONG_EDGE, JPEG_QUALITY),
    resizeToJpeg(file, THUMBNAIL_LONG_EDGE, JPEG_QUALITY),
  ]);

  const basePath = `jobs/${jobId}/inspections/${inspectionId}/photos/${photoId}`;
  const storagePath = `${basePath}.jpg`;
  const thumbnailStoragePath = `${basePath}-thumb.jpg`;

  await uploadBytes(storageRef(storage, storagePath), full, { contentType: "image/jpeg" });
  await uploadBytes(storageRef(storage, thumbnailStoragePath), thumbnail, {
    contentType: "image/jpeg",
  });

  return {
    id: photoId,
    slotKey,
    storagePath,
    thumbnailStoragePath,
    capturedAt,
    uploadedAt: new Date().toISOString(),
  };
}

/** Uploads a signature PNG (customer or inspector) — Phase 4 sign-off.
 *  Returns the storage path to record on CustomerSignature/
 *  InspectorSignature; not versioned like photos since a signature is
 *  captured once per inspection and the document becomes immutable right
 *  after (a correction supersedes the whole inspection, not just the
 *  signature). */
export async function uploadSignaturePng(
  jobId: string,
  inspectionId: string,
  kind: "customer" | "inspector",
  blob: Blob,
): Promise<string> {
  const storagePath = `jobs/${jobId}/inspections/${inspectionId}/${kind}-signature.png`;
  await uploadBytes(storageRef(storage, storagePath), blob, { contentType: "image/png" });
  return storagePath;
}

/** Uploads a screenshot backing a Path B remote acknowledgment (see
 *  RemoteAck.screenshotPath). Compressed the same way capture photos are —
 *  it's evidence, same as any other inspection photo, just not one of the
 *  guided slots. */
export async function uploadRemoteAckScreenshot(
  jobId: string,
  inspectionId: string,
  file: File,
): Promise<string> {
  const blob = await resizeToJpeg(file, MAX_LONG_EDGE, JPEG_QUALITY);
  const storagePath = `jobs/${jobId}/inspections/${inspectionId}/remote-ack-screenshot.jpg`;
  await uploadBytes(storageRef(storage, storagePath), blob, { contentType: "image/jpeg" });
  return storagePath;
}
