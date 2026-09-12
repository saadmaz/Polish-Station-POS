// Hand-rolled IndexedDB queue for inspection-photo uploads (Phase 6 — "do
// not defer"). Firestore's own offline persistence (see firebase.ts) covers
// the Inspection *document* automatically; Storage has no equivalent
// built-in offline queue, so Storage uploads specifically need this.
//
// Design: captureInspectionPhoto() (inspection-photos.ts) tries to upload
// immediately and only falls back to enqueueing here on failure — the
// common (online) case never touches IndexedDB at all. A queued record
// carries everything flushQueue() needs to finish the job later with no
// other context available: which inspection/photo it belongs to, the
// already-compressed blobs, and the storage paths already decided at
// capture time (so re-attempting an upload is idempotent — same path every
// retry, never a new photoId).
import { ref as storageRef, uploadBytes } from "firebase/storage";
import { doc, runTransaction } from "firebase/firestore";
import { storage, db } from "./firebase";
import { computePhotoRequirementsMet, PHOTO_CAPTURE_ENABLED, type Inspection } from "./inspection";

const DB_NAME = "polish-station-photo-queue";
const DB_VERSION = 1;
const STORE = "pending";

// Same reasoning as inspection-photos.ts's own copy of this: a genuinely
// severed connection can leave uploadBytes() pending far longer than is
// useful here, and would otherwise stall this loop's remaining records
// behind one stuck upload, contradicting flushQueue()'s doc comment below.
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

export interface QueuedPhoto {
  id: string; // == the Photo.id it belongs to, so a retry is idempotent
  inspectionId: string;
  storagePath: string;
  thumbnailStoragePath: string;
  fullBlob: Blob;
  thumbBlob: Blob;
  queuedAt: string;
  attempts: number;
  lastError: string | null;
}

function openQueueDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const idb = await openQueueDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = idb.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    idb.close();
  }
}

// A count-changing mutation (enqueue/remove) fires this so use-photo-queue's
// badge updates the moment it happens, not up to 30s later on the next poll
// — a queue that takes half a minute to even show up isn't the "persistent
// indicator" the spec asks for, it just delays being silent by 30 seconds.
export const PHOTO_QUEUE_CHANGED_EVENT = "ps-photo-queue-changed";

function notifyQueueChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PHOTO_QUEUE_CHANGED_EVENT));
}

export async function enqueuePhoto(
  record: Omit<QueuedPhoto, "queuedAt" | "attempts" | "lastError">,
): Promise<void> {
  await withStore("readwrite", (store) =>
    store.put({
      ...record,
      queuedAt: new Date().toISOString(),
      attempts: 0,
      lastError: null,
    } satisfies QueuedPhoto),
  );
  notifyQueueChanged();
}

export async function listQueuedPhotos(): Promise<QueuedPhoto[]> {
  return withStore("readonly", (store) => store.getAll());
}

export async function pendingPhotoCount(): Promise<number> {
  return withStore("readonly", (store) => store.count());
}

async function removeFromQueue(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
  notifyQueueChanged();
}

async function markAttempt(record: QueuedPhoto, error: string): Promise<void> {
  await withStore("readwrite", (store) =>
    store.put({ ...record, attempts: record.attempts + 1, lastError: error } satisfies QueuedPhoto),
  );
}

/** Patches the one photo entry (by id) inside `inspectionId`'s Firestore
 *  doc to uploadedAt = now, recomputing photoRequirementsMet the same way
 *  store.tsx's updateInspection() does — this runs from the queue flush,
 *  independent of whatever component (if any) currently has the inspection
 *  open, so it can't go through that hook and duplicates its small
 *  computation instead of depending on React state existing at all. */
async function markPhotoUploaded(inspectionId: string, photoId: string): Promise<void> {
  const ref = doc(db, "inspections", inspectionId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return; // inspection was deleted/superseded meanwhile — nothing to patch
    const inspection = snap.data() as Inspection;
    if (inspection.status === "signed" || inspection.status === "superseded") return; // immutable — see inspection.ts
    const now = new Date().toISOString();
    const photos = inspection.photos.map((p) =>
      p.id === photoId ? { ...p, uploadedAt: p.uploadedAt ?? now } : p,
    );
    const photoRequirementsMet = computePhotoRequirementsMet(
      photos,
      inspection.damageMarkers,
      false,
    );
    tx.update(ref, { photos, photoRequirementsMet, updatedAt: now });
  });
}

let flushing = false;

/** Retries every queued upload once. Safe to call opportunistically and
 *  often (the online event, a periodic timer, app start) — re-entrancy is
 *  guarded, and each record is independent so one stuck upload can't block
 *  the rest. Failures are expected while still offline and are recorded on
 *  the record rather than logged as alarming.
 *
 *  No-ops entirely while PHOTO_CAPTURE_ENABLED is off: the capture UI can no
 *  longer produce new queue entries, so anything sitting in IndexedDB here
 *  is a leftover from before the flag flipped. Those blobs are inert (never
 *  cleared — they'll flush normally again if the flag comes back), but
 *  actually attempting them is worse than useless: Storage's write rule
 *  permanently forbids writes once an inspection is signed/superseded, so
 *  a leftover for one of those would 403 on literally every retry forever,
 *  on a 30s timer, for as long as the app stays open. */
export async function flushPhotoQueue(): Promise<void> {
  if (!PHOTO_CAPTURE_ENABLED) return;
  if (flushing) return;
  flushing = true;
  try {
    const records = await listQueuedPhotos();
    for (const record of records) {
      try {
        await withTimeout(
          Promise.all([
            uploadBytes(storageRef(storage, record.storagePath), record.fullBlob, {
              contentType: "image/jpeg",
            }),
            uploadBytes(storageRef(storage, record.thumbnailStoragePath), record.thumbBlob, {
              contentType: "image/jpeg",
            }),
          ]),
          UPLOAD_TIMEOUT_MS,
        );
        await markPhotoUploaded(record.inspectionId, record.id);
        await removeFromQueue(record.id);
      } catch (err) {
        await markAttempt(record, err instanceof Error ? err.message : String(err));
      }
    }
  } finally {
    flushing = false;
  }
}
