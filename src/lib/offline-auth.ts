// Offline PIN login -- client-only (localStorage + browser crypto.subtle).
// Lets a specific *enrolled* till authenticate a staff member with no
// network at all, once they've logged in online on this exact till at least
// once since their PIN was last set (see the "Offline PIN Login" plan for
// why that "at least once" caveat is unavoidable: the server only ever sees
// a raw PIN transiently, never at rest).
//
// Two independent secrets gate the cached material:
//   1. this device's own local secret, generated here at enrollment and
//      never transmitted anywhere -- so a leaked/exported Firestore read of
//      staff/{uid}'s offline-* fields is useless without it, and
//   2. the 4-digit PIN itself, checked via AES-GCM's auth tag against the
//      inner blob the server produced (see src/server/staff-admin.ts
//      offlineBlobFields).
// Losing both (a stolen, unlocked till that's also already synced this
// person's credential) is the one case neither this nor the original
// reference design can fully protect against -- a 4-digit PIN is only
// 10,000 values, and no purely-PIN-gated scheme changes that.
import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";
import { encryptOfflinePayload, decryptOfflinePayload, type OfflineBlob } from "./offline-crypto";
import type { StaffRole, ModuleKey } from "./permissions";

export interface OfflineClaims {
  staffId: string;
  role: StaffRole;
  perms: ModuleKey[];
  name: string;
  mustChangePin: boolean;
}

const DEVICE_ID_KEY = "ps_device_id";
const DEVICE_SECRET_KEY = "ps_device_secret";
const CRED_PREFIX = "ps_offline_cred_"; // + staffId
const ATTEMPTS_PREFIX = "ps_offline_attempts_"; // + staffId

/** Past this age, a cached credential is refused rather than trusted -- bounds
 *  how long a role change, deactivation, or device revocation can lag behind
 *  reality on a till that's been offline the whole time. */
const MAX_CACHE_AGE_MS = 72 * 60 * 60 * 1000;

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_BASE_MS = 30_000; // doubles per additional failure past the threshold

interface WrappedCredential {
  issuedAt: number;
  wrap: OfflineBlob; // encrypted with this device's local secret
}

interface AttemptState {
  count: number;
  lockedUntil: number;
}

export function getDeviceId(): string | null {
  return localStorage.getItem(DEVICE_ID_KEY);
}

function getDeviceSecret(): string | null {
  return localStorage.getItem(DEVICE_SECRET_KEY);
}

export function isDeviceEnrolled(): boolean {
  return !!getDeviceId() && !!getDeviceSecret();
}

/** Call once, right after `enrollDeviceFn` returns a fresh deviceId. The
 *  secret is generated here, not by the server -- the server never learns it. */
export function completeDeviceEnrollment(deviceId: string) {
  const secret = crypto.getRandomValues(new Uint8Array(32));
  let bin = "";
  for (const b of secret) bin += String.fromCharCode(b);
  localStorage.setItem(DEVICE_ID_KEY, deviceId);
  localStorage.setItem(DEVICE_SECRET_KEY, btoa(bin));
}

/** Wipes every offline artifact this till holds -- used when this device is
 *  revoked, or an admin explicitly un-enrolls it. */
export function forgetDevice() {
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (
      k &&
      (k === DEVICE_ID_KEY ||
        k === DEVICE_SECRET_KEY ||
        k.startsWith(CRED_PREFIX) ||
        k.startsWith(ATTEMPTS_PREFIX))
    ) {
      toRemove.push(k);
    }
  }
  toRemove.forEach((k) => localStorage.removeItem(k));
}

/** Reads `devices/{thisDeviceId}.revoked` while online and wipes this till's
 *  cache if it's true. Never wipes on a failed/offline read -- a revoked
 *  device should lose offline access the next time it *can* check, not stay
 *  permanently unusable because of a transient network blip. */
export async function checkDeviceRevocation(): Promise<boolean> {
  const deviceId = getDeviceId();
  if (!deviceId) return false;
  try {
    const snap = await getDoc(doc(db, "devices", deviceId));
    const revoked = snap.exists() && snap.data().revoked === true;
    if (revoked) forgetDevice();
    return revoked;
  } catch {
    return false;
  }
}

/** Called right after a real, successful ONLINE login: fetches this
 *  account's server-produced offline blob (already PIN-encrypted -- see
 *  offlineBlobFields) and re-wraps it with this device's own secret for
 *  later use with no network. No-ops if this till was never enrolled, or if
 *  this account's PIN has never been set/changed since offline blobs shipped. */
export async function fetchAndCacheOfflineCredential(staffId: string): Promise<void> {
  if (!isDeviceEnrolled()) return;
  const secret = getDeviceSecret()!;

  const snap = await getDoc(doc(db, "staff", staffId));
  if (!snap.exists()) return;
  const v = snap.data();
  if (!v.offlineSalt || !v.offlineCiphertext || !v.offlineIv) return;

  const blob: OfflineBlob = {
    salt: v.offlineSalt,
    iterations: v.offlineIterations,
    iv: v.offlineIv,
    ciphertext: v.offlineCiphertext,
  };
  const wrap = await encryptOfflinePayload(crypto, secret, blob);
  const entry: WrappedCredential = { issuedAt: Date.now(), wrap };
  localStorage.setItem(CRED_PREFIX + staffId, JSON.stringify(entry));
}

function attemptsKey(staffId: string) {
  return ATTEMPTS_PREFIX + staffId;
}

function readAttempts(staffId: string): AttemptState {
  try {
    return JSON.parse(localStorage.getItem(attemptsKey(staffId)) ?? "") as AttemptState;
  } catch {
    return { count: 0, lockedUntil: 0 };
  }
}

function writeAttempts(staffId: string, state: AttemptState) {
  localStorage.setItem(attemptsKey(staffId), JSON.stringify(state));
}

export type OfflineUnlockResult =
  | { ok: true; claims: OfflineClaims }
  | {
      ok: false;
      reason: "no_cached_credential" | "stale" | "wrong_pin" | "locked";
      remainingSec?: number;
    };

/** The offline fallback for `login()` in src/lib/auth.tsx -- only ever called
 *  after the online retry budget is exhausted for a genuine network reason,
 *  never on a definitive rejection (wrong PIN, deactivated, etc. are already
 *  answered by Firebase itself before this is reached). Local lockout here
 *  mirrors the existing online lockout UX but is a deterrent, not a security
 *  boundary: it can't stop an attacker who extracts this device's storage and
 *  brute-forces the blob directly with their own script, outside the browser. */
export async function attemptOfflineUnlock(
  staffId: string,
  pin: string,
): Promise<OfflineUnlockResult> {
  const attempts = readAttempts(staffId);
  const now = Date.now();
  if (attempts.lockedUntil > now) {
    return {
      ok: false,
      reason: "locked",
      remainingSec: Math.ceil((attempts.lockedUntil - now) / 1000),
    };
  }

  const secret = getDeviceSecret();
  const raw = secret ? localStorage.getItem(CRED_PREFIX + staffId) : null;
  if (!secret || !raw) return { ok: false, reason: "no_cached_credential" };

  let entry: WrappedCredential;
  try {
    entry = JSON.parse(raw) as WrappedCredential;
  } catch {
    return { ok: false, reason: "no_cached_credential" };
  }

  if (now - entry.issuedAt > MAX_CACHE_AGE_MS) {
    return { ok: false, reason: "stale" };
  }

  const inner = await decryptOfflinePayload<OfflineBlob>(crypto, secret, entry.wrap);
  if (!inner) return { ok: false, reason: "no_cached_credential" };

  const claims = await decryptOfflinePayload<OfflineClaims>(crypto, pin, inner);
  if (!claims) {
    const count = attempts.count + 1;
    // The attempt that *crosses* the threshold reports the lockout
    // immediately, rather than waiting for a next attempt the lockout would
    // then reject before even trying the PIN -- otherwise the person who
    // just got locked out sees one more "wrong PIN" instead of the reason.
    if (count >= LOCKOUT_THRESHOLD) {
      const lockedUntil = now + LOCKOUT_BASE_MS * 2 ** (count - LOCKOUT_THRESHOLD);
      writeAttempts(staffId, { count, lockedUntil });
      return { ok: false, reason: "locked", remainingSec: Math.ceil((lockedUntil - now) / 1000) };
    }
    writeAttempts(staffId, { count, lockedUntil: 0 });
    return { ok: false, reason: "wrong_pin" };
  }

  writeAttempts(staffId, { count: 0, lockedUntil: 0 });
  return { ok: true, claims };
}
