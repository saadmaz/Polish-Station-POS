"use server";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { adminAuth, adminDb } from "./firebase-admin";
import { withTimeout } from "./retry";
import { toStaffPassword } from "@/lib/staff-auth";
import { syncAuthUser } from "./staff-admin";
import { sanitizePermissions, type StaffRole } from "@/lib/permissions";

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

const PinSchema = z.string().regex(PIN_RE);

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

    // Best-effort, not awaited: adminAuth.updateUser/setCustomUserClaims are
    // identitytoolkit calls this shared host is prone to stalling on for tens
    // of seconds (the whole reason revokeBestEffort elsewhere in this file's
    // callers is fire-and-forget too) -- awaiting them here made a routine
    // PIN change fail with "Couldn't reach the server" even inside a widened
    // client retry budget. The Firestore write above already recorded the
    // change (the source of truth for "did this succeed"); the caller stays
    // signed in on their current session regardless, and clearMustChangePin
    // on the client clears the forced-change gate locally rather than
    // waiting on this claim to propagate. A password/claims sync that's
    // still catching up only matters for a *future* login, which this same
    // retried-with-backoff call should have long since completed by then.
    void syncAuthUser({
      staffId: uid,
      password: toStaffPassword(newPin),
      claims: {
        role: staff.role as StaffRole,
        perms: sanitizePermissions(staff.permissions),
        name: staff.name as string,
        mustChangePin: false,
      },
    }).catch((err) => console.error(`[auth] syncAuthUser(${uid}) after PIN change failed:`, err));

    return { success: true };
  });
