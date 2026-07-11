"use server";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { adminAuth, adminDb } from "./firebase-admin";
import { sanitizePermissions, type ModuleKey, type StaffRole } from "@/lib/permissions";

// ── Shared vocabulary ─────────────────────────────────────────────────────────

export const USERNAME_RE = /^[A-Za-z0-9_.-]{3,20}$/;
export const PIN_RE = /^\d{4}$/;

/** Trivially guessable PINs, rejected when a user *chooses* their own PIN.
 *  Not applied to admin-issued resets, which are one-time and force a change. */
const WEAK_PINS = new Set([
  "0000",
  "1111",
  "2222",
  "3333",
  "4444",
  "5555",
  "6666",
  "7777",
  "8888",
  "9999",
  "1234",
  "2345",
  "3456",
  "4567",
  "5678",
  "6789",
  "0123",
  "4321",
  "9876",
  "1212",
]);

/** Usernames are matched case-insensitively; the index doc is keyed by the
 *  lowercased form while the staff doc keeps the display casing. */
export const usernameKey = (u: string) => u.trim().toLowerCase();

const UsernameSchema = z.string().trim().regex(USERNAME_RE);
const PinSchema = z.string().regex(PIN_RE);

const LoginSchema = z.object({
  username: UsernameSchema,
  pin: PinSchema,
});

export type LoginResult =
  | { success: true; customToken: string; mustChangePin: boolean }
  | { success: false; error: "invalid_credentials" }
  | { success: false; error: "locked"; remainingSec: number }
  | { success: false; error: "inactive" };

// Fail fast instead of letting a stalled Firestore connection hold the login
// request until the web server's own timeout (LiteSpeed 408s at ~60s+, and
// the user just sees a frozen PIN pad the whole time).
export function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

// In-process cache for the username → staffId index. Each Firestore REST call
// from the shared host costs ~300-600ms, and this mapping almost never changes
// (only on a rename, done through updateStaffFn). A short TTL bounds staleness
// across Passenger workers, and everything security-relevant (pinHash, active,
// lockout) is still read fresh from the staff doc on every login.
const USERNAME_TTL_MS = 5 * 60 * 1000;
const usernameCache = new Map<string, { staffId: string; at: number }>();

/** Resolve a username to its staffId via the `usernames` index collection.
 *  Doc-ID uniqueness is what guarantees two people cannot claim one name. */
export async function resolveUsername(username: string): Promise<string | null> {
  const key = usernameKey(username);

  const hit = usernameCache.get(key);
  if (hit && Date.now() - hit.at < USERNAME_TTL_MS) return hit.staffId;

  const snap = await withTimeout(
    adminDb.collection("usernames").doc(key).get(),
    10_000,
    "username lookup",
  );
  if (!snap.exists) return null;
  const staffId = snap.data()?.staffId;
  if (typeof staffId !== "string") return null;

  usernameCache.set(key, { staffId, at: Date.now() });
  return staffId;
}

/** Claims baked into the custom token and read by firestore.rules. */
function claimsFor(staff: Record<string, unknown>) {
  return {
    role: staff.role as StaffRole,
    name: staff.name as string,
    perms: sanitizePermissions(staff.permissions) as ModuleKey[],
  };
}

export const loginFn = createServerFn({ method: "POST" })
  .validator((raw: unknown) => LoginSchema.parse(raw))
  .handler(async ({ data }): Promise<LoginResult> => {
    const { username, pin } = data;

    const staffId = await resolveUsername(username);

    // An unknown username must be indistinguishable from a wrong PIN, both in
    // the response body and in how long it takes to produce it.
    if (!staffId) {
      await new Promise((r) => setTimeout(r, 200));
      return { success: false, error: "invalid_credentials" };
    }

    const staffRef = adminDb.collection("staff").doc(staffId);
    const snap = await withTimeout(staffRef.get(), 10_000, "staff lookup");

    if (!snap.exists) {
      await new Promise((r) => setTimeout(r, 200));
      return { success: false, error: "invalid_credentials" };
    }

    const staff = snap.data()!;

    if (staff.active === false) {
      return { success: false, error: "inactive" };
    }

    // Server-side lockout — persisted in Firestore, survives page refresh
    if (staff.lockedUntil) {
      const lockedMs: number =
        typeof staff.lockedUntil.toMillis === "function"
          ? staff.lockedUntil.toMillis()
          : Number(staff.lockedUntil);
      if (lockedMs > Date.now()) {
        const remainingSec = Math.ceil((lockedMs - Date.now()) / 1000);
        return { success: false, error: "locked", remainingSec };
      }
    }

    const valid = await bcrypt.compare(pin, staff.pinHash as string);

    if (!valid) {
      const newFails = ((staff.failCount as number) ?? 0) + 1;
      const update: Record<string, unknown> = { failCount: newFails };
      if (newFails >= 5) {
        // Lock for 5 minutes, reset counter
        update.lockedUntil = new Date(Date.now() + 5 * 60 * 1000);
        update.failCount = 0;
      }
      await withTimeout(staffRef.update(update), 10_000, "fail-count write");
      return { success: false, error: "invalid_credentials" };
    }

    // Successful login — reset the fail counter, but only when it's actually
    // dirty, and never make the user wait on it: the write is best-effort
    // bookkeeping (~300-600ms per Firestore round trip from this host), while
    // the response only needs the token. Token minting is local RSA signing.
    if ((staff.failCount as number) > 0 || staff.lockedUntil != null) {
      void staffRef
        .update({ failCount: 0, lockedUntil: null })
        .catch((err) => console.error("[loginFn] failCount reset failed:", err));
    }

    const customToken = await adminAuth.createCustomToken(staffId, claimsFor(staff));

    return {
      success: true,
      customToken,
      mustChangePin: staff.mustChangePin === true,
    };
  });

// ── Change own PIN ────────────────────────────────────────────────────────────

const ChangeOwnPinSchema = z.object({
  idToken: z.string().min(1),
  currentPin: PinSchema,
  newPin: PinSchema,
});

export type ChangeOwnPinResult =
  | { success: true }
  | { success: false; error: "unauthorized" }
  | { success: false; error: "wrong_pin" }
  | { success: false; error: "weak_pin" }
  | { success: false; error: "same_pin" };

export const changeOwnPinFn = createServerFn({ method: "POST" })
  .validator((raw: unknown) => ChangeOwnPinSchema.parse(raw))
  .handler(async ({ data }): Promise<ChangeOwnPinResult> => {
    const { idToken, currentPin, newPin } = data;

    let uid: string;
    try {
      // No checkRevoked here: it adds an identitytoolkit round trip this host
      // tends to stall (the change-PIN screen hung on it in production), and
      // the current-PIN re-proof below is the real gate — a revoked-but-valid
      // token without the current PIN still gets rejected.
      const decoded = await withTimeout(adminAuth.verifyIdToken(idToken), 8_000, "token verify");
      uid = decoded.uid;
    } catch {
      return { success: false, error: "unauthorized" };
    }

    if (newPin === currentPin) return { success: false, error: "same_pin" };
    if (WEAK_PINS.has(newPin)) return { success: false, error: "weak_pin" };

    const staffRef = adminDb.collection("staff").doc(uid);
    const snap = await withTimeout(staffRef.get(), 10_000, "staff lookup");
    if (!snap.exists) return { success: false, error: "unauthorized" };

    const staff = snap.data()!;
    if (staff.active === false) return { success: false, error: "unauthorized" };

    // Re-prove possession of the current PIN. Without this, an unattended
    // unlocked tablet is enough to permanently take over the account.
    if (!(await bcrypt.compare(currentPin, staff.pinHash as string))) {
      return { success: false, error: "wrong_pin" };
    }

    await withTimeout(
      staffRef.update({
        pinHash: await bcrypt.hash(newPin, 12),
        mustChangePin: false,
        failCount: 0,
        lockedUntil: null,
      }),
      10_000,
      "pin change write",
    );

    return { success: true };
  });
