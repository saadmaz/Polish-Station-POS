// Browser-only: client-side compression + Storage upload for inspection
// photos (see inspection.ts's Photo type and Phase 2 of the inspection
// spec). Kept separate from store.tsx the same way pdf.ts is — Storage-
// touching, non-Firestore work called directly from the component that
// needs it, not proxied through useStore().
import { ref as storageRef, uploadBytes } from "firebase/storage";
import { storage } from "./firebase";
import { enqueuePhoto, flushPhotoQueue } from "./photo-queue";
import type { Photo, PhotoSlotKey } from "./inspection";

export const MAX_LONG_EDGE = 1600;
export const JPEG_QUALITY = 0.8;
const THUMBNAIL_LONG_EDGE = 320;

// The Firebase Storage SDK's own retry/backoff on a genuinely severed
// connection can take a long time to actually reject an upload — measured
// well past what feels responsive when the whole point of this timeout is
// "notice we're offline and queue it quickly." Racing against this instead
// of awaiting uploadBytes() directly is what keeps offline capture feeling
// instant rather than hanging the stepper for tens of seconds first. If the
// real upload eventually resolves after this wins the race, it just wrote
// the same bytes to the same path the queue will also retry — harmless,
// same idempotent-path reasoning as the queue itself.
const UPLOAD_TIMEOUT_MS = 6000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("upload timed out")), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Resizes to a `maxLongEdge` long edge and re-encodes as JPEG via canvas.
 * This is also where EXIF gets dropped: canvas re-encoding carries no EXIF
 * data through at all, and there's no browser API to selectively keep
 * timestamp/orientation. Orientation survives anyway (browsers auto-rotate
 * on canvas draw per the source image's EXIF tag, so the re-encoded pixels
 * are already upright); the capture timestamp is tracked as Photo.capturedAt
 * instead of an EXIF tag, which is exactly what that field is for.
 */
export async function resizeToJpeg(
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
 * Compresses (always works offline — plain canvas, no network) and tries to
 * upload (full + thumbnail) immediately, returning the Photo record ready
 * to merge into Inspection.photos — this does NOT write to Firestore itself,
 * callers persist the merged inspection via useStore()'s updateInspection,
 * same division of labour as pdf.ts's generateJobCardPDF (Storage write) vs.
 * store.tsx's updateJob (Firestore write).
 *
 * Phase 6 — do not defer: if the upload itself fails (offline, or any
 * network error), this no longer throws and blocks capture. It queues both
 * blobs in IndexedDB (see photo-queue.ts) and returns the same Photo shape
 * with `uploadedAt: null` instead — the caller still gets a Photo to add to
 * the inspection right away, working fully offline. A background flush
 * (started once at app load, see use-photo-queue.ts) retries queued
 * uploads and patches `uploadedAt` once one succeeds.
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

  try {
    await withTimeout(
      Promise.all([
        uploadBytes(storageRef(storage, storagePath), full, { contentType: "image/jpeg" }),
        uploadBytes(storageRef(storage, thumbnailStoragePath), thumbnail, {
          contentType: "image/jpeg",
        }),
      ]),
      UPLOAD_TIMEOUT_MS,
    );
    return {
      id: photoId,
      slotKey,
      storagePath,
      thumbnailStoragePath,
      capturedAt,
      uploadedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error("[inspection] upload failed, queueing for retry:", err);
    await enqueuePhoto({
      id: photoId,
      inspectionId,
      storagePath,
      thumbnailStoragePath,
      fullBlob: full,
      thumbBlob: thumbnail,
    });
    void flushPhotoQueue(); // opportunistic immediate retry in case this was a one-off blip, not a real offline stretch
    return {
      id: photoId,
      slotKey,
      storagePath,
      thumbnailStoragePath,
      capturedAt,
      uploadedAt: null,
    };
  }
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
