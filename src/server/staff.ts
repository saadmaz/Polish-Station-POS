"use server";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { adminAuth, adminDb } from "./firebase-admin";
import { USERNAME_RE, PIN_RE, usernameKey, withTimeout, invalidateStaffCache } from "./auth";
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
 * authoritative — which is also why `checkRevoked` is deliberately NOT used:
 * it adds a blocking identitytoolkit round trip that this shared host tends to
 * stall (the same class of hang that broke login before preferRest), and a
 * demoted/deactivated caller is already rejected by the fresh doc read below.
 * Every await is time-boxed so a stalled upstream fails in seconds instead of
 * hanging the request into LiteSpeed's 408.
 */
async function requireCaller(idToken: string): Promise<Caller | null> {
  let uid: string;
  try {
    uid = (await withTimeout(adminAuth.verifyIdToken(idToken), 8_000, "token verify")).uid;
  } catch {
    return null;
  }

  const snap = await withTimeout(
    adminDb.collection("staff").doc(uid).get(),
    10_000,
    "caller lookup",
  );
  if (!snap.exists) return null;

  const staff = snap.data()!;
  if (staff.active === false) return null;

  return { uid, role: staff.role as StaffRole };
}

/**
 * Revoking refresh tokens is what makes a role change bite before the target
 * logs out, but it's an identitytoolkit call this host can stall. Attempt it
 * with a hard deadline and never block the response on failure: the staff doc
 * (checked server-side on every sensitive call) is already updated, so the
 * stale claims only linger for client-side rule checks until logout.
 */
function revokeBestEffort(staffId: string) {
  void withTimeout(adminAuth.revokeRefreshTokens(staffId), 8_000, "token revoke").catch((err) =>
    console.error(`[staff] revokeRefreshTokens(${staffId}) failed:`, err),
  );
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
  const snap = await withTimeout(
    adminDb.collection("staff").where("role", "==", "SuperAdmin").get(),
    10_000,
    "superadmin count",
  );
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
  const snap = await withTimeout(
    adminDb.collection("staff").where("name", "==", name).get(),
    10_000,
    "name uniqueness check",
  );
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
    // what makes username uniqueness atomic. A timeout must NOT be reported as
    // username_taken, so it is re-thrown for the client's generic error path.
    try {
      await withTimeout(
        adminDb.collection("usernames").doc(key).create({ staffId }),
        10_000,
        "username claim",
      );
    } catch (err) {
      if (err instanceof Error && err.message.includes("timed out")) throw err;
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
        pinHash: await bcrypt.hash(data.pin, 10),
        active: true,
        // The admin-issued PIN IS the working credential — users sign in with
        // exactly what the admin gives them and are never forced to change it.
        mustChangePin: false,
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
      await withTimeout(batch.commit(), 10_000, "staff create commit");
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

    await invalidateStaffCache();
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
    const snap = await withTimeout(targetRef.get(), 10_000, "target lookup");
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
    await withTimeout(batch.commit(), 10_000, "staff update commit");

    // Role and permissions live in the token claims, which survive ID-token
    // refresh. Revoke so a demotion bites before the target logs out — but
    // best-effort: the staff doc is already updated and re-checked server-side.
    revokeBestEffort(data.targetStaffId);

    await invalidateStaffCache();
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
    const snap = await withTimeout(targetRef.get(), 10_000, "target lookup");
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
    await withTimeout(batch.commit(), 10_000, "set-active commit");

    // Deactivation must end any session already open on a shop tablet.
    if (!data.active) revokeBestEffort(data.targetStaffId);

    await invalidateStaffCache();
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
    const snap = await withTimeout(targetRef.get(), 10_000, "target lookup");
    if (!snap.exists) return { success: false, error: "not_found" };

    const targetRole = snap.data()!.role as StaffRole;
    // Resetting a peer's or a senior's PIN is an account takeover.
    if (caller.uid !== data.targetStaffId && !mayActOn(caller, targetRole)) {
      return { success: false, error: "forbidden" };
    }

    await withTimeout(
      targetRef.update({
        pinHash: await bcrypt.hash(data.newPin, 10),
        // The admin sets the PIN and the user signs in with exactly that — no
        // forced change on next login.
        mustChangePin: false,
        failCount: 0,
        lockedUntil: null,
      }),
      10_000,
      "pin reset write",
    );

    revokeBestEffort(data.targetStaffId);

    await invalidateStaffCache();
    return { success: true };
  });

// ── Delete ────────────────────────────────────────────────────────────────────

const DeleteStaffSchema = z.object({
  idToken: z.string().min(1),
  targetStaffId: z.string().min(1).max(64),
});

// Hard delete, distinct from deactivate: removes the account entirely rather
// than disabling it. Same seniority rules as every other staff mutation — an
// Admin may delete anyone strictly below them, a SuperAdmin anyone; nobody may
// delete themselves or the last remaining SuperAdmin.
export const deleteStaffFn = createServerFn({ method: "POST" })
  .validator((raw: unknown) => DeleteStaffSchema.parse(raw))
  .handler(async ({ data }): Promise<StaffActionResult> => {
    const caller = await requireAdmin(data.idToken);
    if (!caller) return { success: false, error: "unauthorized" };
    if (caller.uid === data.targetStaffId) return { success: false, error: "self_target" };

    const targetRef = adminDb.collection("staff").doc(data.targetStaffId);
    const snap = await withTimeout(targetRef.get(), 10_000, "target lookup");
    if (!snap.exists) return { success: false, error: "not_found" };

    const target = snap.data()!;
    const targetRole = target.role as StaffRole;
    if (!mayActOn(caller, targetRole)) return { success: false, error: "forbidden" };

    // Deleting the final SuperAdmin would strand the business with nobody able
    // to manage users — same guard as demote/deactivate.
    if (targetRole === "SuperAdmin" && (await otherActiveSuperAdmins(data.targetStaffId)) === 0) {
      return { success: false, error: "last_super_admin" };
    }

    // Remove the private doc, the public roster doc, and the username index
    // entry (freeing the username for reuse), then end any live session.
    const batch = adminDb.batch();
    batch.delete(targetRef);
    batch.delete(adminDb.collection("staff_public").doc(data.targetStaffId));
    const username = target.username;
    if (typeof username === "string" && username) {
      batch.delete(adminDb.collection("usernames").doc(usernameKey(username)));
    }
    await withTimeout(batch.commit(), 10_000, "staff delete commit");

    revokeBestEffort(data.targetStaffId);

    await invalidateStaffCache();
    return { success: true };
  });
