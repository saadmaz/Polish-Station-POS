"use server";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { adminAuth, adminDb } from "./firebase-admin";
import { withTimeout } from "./retry";
import { lookupStaffForLogin, rehashIfLegacyCost } from "./staff-cache";

// Deliberately NOT re-exported from here, even though staff.ts/bookings.ts/
// healthz.ts used to import them via this file: a `export {x} from "y"` is a
// static re-export, which the browser must fetch and evaluate as part of
// linking this module *regardless of whether the importer ever touches x* --
// so re-exporting anything from staff-cache.ts here would drag adminDb/
// bcrypt straight back into the client bundle that imports loginFn. Import
// warmStaffCache/invalidateStaffCache from "./staff-cache" directly instead.

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

// ── In-memory login lockout ─────────────────────────────────────────────────
// Brute-force guard for the 4-digit PIN, kept in memory (per worker) instead of
// Firestore-persisted so a failed login writes nothing over the network. 5
// fails → 5-minute lock; resets on process restart, an acceptable weakening for
// a shop POS versus the alternative of a stall-prone Firestore write on the
// login path.
interface Lock {
  fails: number;
  until: number;
}
const lockouts = new Map<string, Lock>();
const LOCK_THRESHOLD = 5;
const LOCK_MS = 5 * 60 * 1000;

export const loginFn = createServerFn({ method: "POST" })
  .validator((raw: unknown) => LoginSchema.parse(raw))
  .handler(async ({ data }): Promise<LoginResult> => {
    const { username, pin } = data;

    const staff = await lookupStaffForLogin(username);

    // An unknown username must be indistinguishable from a wrong PIN.
    if (!staff) {
      await new Promise((r) => setTimeout(r, 200));
      return { success: false, error: "invalid_credentials" };
    }

    if (!staff.active) return { success: false, error: "inactive" };

    const lock = lockouts.get(staff.id);
    if (lock && lock.until > Date.now()) {
      return {
        success: false,
        error: "locked",
        remainingSec: Math.ceil((lock.until - Date.now()) / 1000),
      };
    }

    const valid = staff.pinHash ? await bcrypt.compare(pin, staff.pinHash) : false;

    if (!valid) {
      const l = lockouts.get(staff.id) ?? { fails: 0, until: 0 };
      l.fails += 1;
      if (l.fails >= LOCK_THRESHOLD) {
        l.until = Date.now() + LOCK_MS;
        l.fails = 0;
      }
      lockouts.set(staff.id, l);
      return { success: false, error: "invalid_credentials" };
    }

    lockouts.delete(staff.id); // successful login clears the fail counter

    // Rehash legacy cost-12 hashes down to cost 10 transparently (fire-and-forget).
    rehashIfLegacyCost(staff, pin);

    // Local RSA signing (no network), but time-boxed as belt-and-suspenders.
    const customToken = await withTimeout(
      adminAuth.createCustomToken(staff.id, {
        role: staff.role,
        name: staff.name,
        perms: staff.permissions,
      }),
      8_000,
      "token mint",
    );

    return { success: true, customToken, mustChangePin: staff.mustChangePin };
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
      // the current-PIN re-proof below is the real gate: a revoked-but-valid
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
        pinHash: await bcrypt.hash(newPin, 10),
        mustChangePin: false,
        failCount: 0,
        lockedUntil: null,
      }),
      10_000,
      "pin change write",
    );

    return { success: true };
  });
