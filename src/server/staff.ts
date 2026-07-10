"use server";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { adminAuth, adminDb } from "./firebase-admin";
import { USERNAME_RE, PIN_RE, usernameKey } from "./auth";
import {
  ALL_MODULES,
  isAdmin,
  isManagerOrAbove,
  isSuperAdmin,
  rank,
  sanitizePermissions,
  STAFF_ROLES,
  type ModuleKey,
  type StaffRole,
} from "@/lib/permissions";

// ── Schemas ───────────────────────────────────────────────────────────────────

const RoleSchema = z.enum(STAFF_ROLES as [StaffRole, ...StaffRole[]]);
const PermissionsSchema = z.array(z.string()).max(64);
const NameSchema = z.string().trim().min(2).max(40);
const ColorSchema = z.string().trim().min(3).max(64);

export type StaffActionError =
  | "unauthorized" // caller is not Admin+, or token invalid/revoked
  | "forbidden" // caller is Admin+ but outranked by the operation
  | "not_found"
  | "username_taken"
  | "name_taken"
  | "last_super_admin" // would leave the system with no SuperAdmin
  | "self_target"; // cannot deactivate or demote yourself

export type StaffActionResult = { success: true } | { success: false; error: StaffActionError };

export type CreateStaffResult =
  { success: true; staffId: string } | { success: false; error: StaffActionError };

// ── Caller identity ───────────────────────────────────────────────────────────

interface Caller {
  uid: string;
  role: StaffRole;
}

/**
 * Verify the caller's ID token and read their role from the *staff document*,
 * not from the token claim. A claim can be up to an hour stale; the document is
 * authoritative. `checkRevoked: true` rejects tokens issued before a
 * revocation, which is what makes demotion take effect immediately.
 */
async function requireCaller(idToken: string): Promise<Caller | null> {
  let uid: string;
  try {
    uid = (await adminAuth.verifyIdToken(idToken, true)).uid;
  } catch {
    return null;
  }

  const snap = await adminDb.collection("staff").doc(uid).get();
  if (!snap.exists) return null;

  const staff = snap.data()!;
  if (staff.active === false) return null;

  return { uid, role: staff.role as StaffRole };
}

/** Managing users (create / edit / deactivate) is Admin+. */
async function requireAdmin(idToken: string): Promise<Caller | null> {
  const caller = await requireCaller(idToken);
  return caller && isAdmin(caller.role) ? caller : null;
}

/** Resetting a subordinate's PIN stays available to Managers, as before. */
async function requireManager(idToken: string): Promise<Caller | null> {
  const caller = await requireCaller(idToken);
  return caller && isManagerOrAbove(caller.role) ? caller : null;
}

/**
 * An Admin may act on anyone strictly below them. A SuperAdmin may act on
 * anyone. This is what stops an Admin from editing a peer Admin, and — combined
 * with the role check in `assertMayAssignRole` — from escalating themselves.
 */
function mayActOn(caller: Caller, targetRole: StaffRole): boolean {
  if (isSuperAdmin(caller.role)) return true;
  return rank(caller.role) > rank(targetRole);
}

/** Nobody may grant a role senior to their own. Only a SuperAdmin mints a
 *  SuperAdmin (implied by the rank check, since SuperAdmin is the top rank). */
function mayAssignRole(caller: Caller, newRole: StaffRole): boolean {
  if (isSuperAdmin(caller.role)) return true;
  return rank(newRole) <= rank(caller.role);
}

/** Count active SuperAdmins, optionally ignoring one staffId (the one being
 *  changed). Equality-only query — no composite index required. */
async function otherActiveSuperAdmins(excludeStaffId: string): Promise<number> {
  const snap = await adminDb.collection("staff").where("role", "==", "SuperAdmin").get();
  return snap.docs.filter((d) => d.id !== excludeStaffId && d.data().active !== false).length;
}

/** Display names must be unique: firestore.rules authorizes a technician's job
 *  edit with `resource.data.tech == request.auth.token.name`, so two staff
 *  sharing a name could edit each other's jobs.
 *
 *  This is a read-then-write check, so two simultaneous creates of the same
 *  name could both pass. Closing that needs a `staffNames/{lower}` index doc
 *  the way usernames works — worth doing when jobs move to `techId`. */
async function nameTaken(name: string, excludeStaffId?: string): Promise<boolean> {
  const snap = await adminDb.collection("staff").where("name", "==", name).get();
  return snap.docs.some((d) => d.id !== excludeStaffId);
}

/** SuperAdmins implicitly hold every module (see `hasModule`), so persist the
 *  full list rather than whatever partial set the UI happened to submit. */
function permissionsFor(role: StaffRole, requested: unknown): ModuleKey[] {
  return isSuperAdmin(role) ? [...ALL_MODULES] : sanitizePermissions(requested);
}

// ── Create ────────────────────────────────────────────────────────────────────

const CreateStaffSchema = z.object({
  idToken: z.string().min(1),
  username: z.string().trim().regex(USERNAME_RE),
  name: NameSchema,
  role: RoleSchema,
  color: ColorSchema,
  pin: z.string().regex(PIN_RE),
  permissions: PermissionsSchema,
});

export const createStaffFn = createServerFn({ method: "POST" })
  .validator((raw: unknown) => CreateStaffSchema.parse(raw))
  .handler(async ({ data }): Promise<CreateStaffResult> => {
    const caller = await requireAdmin(data.idToken);
    if (!caller) return { success: false, error: "unauthorized" };
    if (!mayAssignRole(caller, data.role)) return { success: false, error: "forbidden" };

    if (await nameTaken(data.name)) return { success: false, error: "name_taken" };

    const staffId = adminDb.collection("staff").doc().id;
    const key = usernameKey(data.username);

    // `.create()` throws if the doc exists — this, not a read-then-write, is
    // what makes username uniqueness atomic.
    try {
      await adminDb.collection("usernames").doc(key).create({ staffId });
    } catch {
      return { success: false, error: "username_taken" };
    }

    const permissions = permissionsFor(data.role, data.permissions);

    try {
      const batch = adminDb.batch();
      batch.set(adminDb.collection("staff").doc(staffId), {
        username: data.username,
        name: data.name,
        role: data.role,
        color: data.color,
        permissions,
        pinHash: await bcrypt.hash(data.pin, 12),
        active: true,
        // An admin-issued PIN is a bootstrap credential, never a password.
        mustChangePin: true,
        failCount: 0,
        lockedUntil: null,
      });
      batch.set(adminDb.collection("staff_public").doc(staffId), {
        username: data.username,
        name: data.name,
        role: data.role,
        color: data.color,
        active: true,
      });
      await batch.commit();
    } catch (err) {
      // Don't strand the username on a failed create — it would be
      // unclaimable forever with no staff doc to explain why.
      await adminDb
        .collection("usernames")
        .doc(key)
        .delete()
        .catch(() => {});
      throw err;
    }

    return { success: true, staffId };
  });

// ── Update (name, role, colour, permissions) ──────────────────────────────────

const UpdateStaffSchema = z.object({
  idToken: z.string().min(1),
  targetStaffId: z.string().min(1).max(64),
  name: NameSchema,
  role: RoleSchema,
  color: ColorSchema,
  permissions: PermissionsSchema,
});

export const updateStaffFn = createServerFn({ method: "POST" })
  .validator((raw: unknown) => UpdateStaffSchema.parse(raw))
  .handler(async ({ data }): Promise<StaffActionResult> => {
    const caller = await requireAdmin(data.idToken);
    if (!caller) return { success: false, error: "unauthorized" };

    const targetRef = adminDb.collection("staff").doc(data.targetStaffId);
    const snap = await targetRef.get();
    if (!snap.exists) return { success: false, error: "not_found" };

    const target = snap.data()!;
    const currentRole = target.role as StaffRole;
    const isSelf = caller.uid === data.targetStaffId;
    const roleIsChanging = currentRole !== data.role;

    // Editing your own name/colour is fine; changing your own role is not.
    if (isSelf && roleIsChanging) return { success: false, error: "self_target" };
    if (!isSelf && !mayActOn(caller, currentRole)) return { success: false, error: "forbidden" };
    if (!mayAssignRole(caller, data.role)) return { success: false, error: "forbidden" };

    // Demoting the final SuperAdmin would leave nobody able to manage users.
    if (currentRole === "SuperAdmin" && data.role !== "SuperAdmin") {
      if ((await otherActiveSuperAdmins(data.targetStaffId)) === 0) {
        return { success: false, error: "last_super_admin" };
      }
    }

    if (target.name !== data.name && (await nameTaken(data.name, data.targetStaffId))) {
      return { success: false, error: "name_taken" };
    }

    const permissions = permissionsFor(data.role, data.permissions);

    const batch = adminDb.batch();
    batch.update(targetRef, { name: data.name, role: data.role, color: data.color, permissions });
    batch.update(adminDb.collection("staff_public").doc(data.targetStaffId), {
      name: data.name,
      role: data.role,
      color: data.color,
    });
    await batch.commit();

    // Role and permissions live in the token claims, which survive ID-token
    // refresh. Without revoking, a demoted user keeps their old access until
    // they happen to log out — the change would be cosmetic.
    await adminAuth.revokeRefreshTokens(data.targetStaffId);

    return { success: true };
  });

// ── Activate / deactivate ─────────────────────────────────────────────────────

const SetActiveSchema = z.object({
  idToken: z.string().min(1),
  targetStaffId: z.string().min(1).max(64),
  active: z.boolean(),
});

export const setStaffActiveFn = createServerFn({ method: "POST" })
  .validator((raw: unknown) => SetActiveSchema.parse(raw))
  .handler(async ({ data }): Promise<StaffActionResult> => {
    const caller = await requireAdmin(data.idToken);
    if (!caller) return { success: false, error: "unauthorized" };
    if (caller.uid === data.targetStaffId) return { success: false, error: "self_target" };

    const targetRef = adminDb.collection("staff").doc(data.targetStaffId);
    const snap = await targetRef.get();
    if (!snap.exists) return { success: false, error: "not_found" };

    const targetRole = snap.data()!.role as StaffRole;
    if (!mayActOn(caller, targetRole)) return { success: false, error: "forbidden" };

    if (!data.active && targetRole === "SuperAdmin") {
      if ((await otherActiveSuperAdmins(data.targetStaffId)) === 0) {
        return { success: false, error: "last_super_admin" };
      }
    }

    const batch = adminDb.batch();
    batch.update(targetRef, { active: data.active, failCount: 0, lockedUntil: null });
    batch.update(adminDb.collection("staff_public").doc(data.targetStaffId), {
      active: data.active,
    });
    await batch.commit();

    // Deactivation must end any session already open on a shop tablet.
    if (!data.active) await adminAuth.revokeRefreshTokens(data.targetStaffId);

    return { success: true };
  });

// ── Reset another user's PIN ──────────────────────────────────────────────────

const ResetPinSchema = z.object({
  idToken: z.string().min(1),
  targetStaffId: z.string().min(1).max(64),
  newPin: z.string().regex(PIN_RE),
});

export const resetPinFn = createServerFn({ method: "POST" })
  .validator((raw: unknown) => ResetPinSchema.parse(raw))
  .handler(async ({ data }): Promise<StaffActionResult> => {
    const caller = await requireManager(data.idToken);
    if (!caller) return { success: false, error: "unauthorized" };

    const targetRef = adminDb.collection("staff").doc(data.targetStaffId);
    const snap = await targetRef.get();
    if (!snap.exists) return { success: false, error: "not_found" };

    const targetRole = snap.data()!.role as StaffRole;
    // Resetting a peer's or a senior's PIN is an account takeover.
    if (caller.uid !== data.targetStaffId && !mayActOn(caller, targetRole)) {
      return { success: false, error: "forbidden" };
    }

    await targetRef.update({
      pinHash: await bcrypt.hash(data.newPin, 12),
      // The target chooses their own PIN on next login; the admin never
      // knows the credential the user ends up with.
      mustChangePin: true,
      failCount: 0,
      lockedUntil: null,
    });

    await adminAuth.revokeRefreshTokens(data.targetStaffId);

    return { success: true };
  });
