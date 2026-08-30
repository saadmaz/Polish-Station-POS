"use server";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { adminAuth, adminDb } from "./firebase-admin";
import { USERNAME_RE, PIN_RE } from "./auth";
import { withRetry } from "./retry";
import { invalidateStaffCache } from "./staff-cache";
import { usernameKey, toStaffEmail, toStaffPassword } from "@/lib/staff-auth";
import {
  requireAdmin,
  requireManager,
  revokeBestEffort,
  otherActiveSuperAdmins,
  nameTaken,
  claimUsername,
  syncAuthUser,
  type Caller,
} from "./staff-admin";
import {
  ALL_MODULES,
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
// requireCaller/requireAdmin/requireManager/revokeBestEffort/
// otherActiveSuperAdmins/nameTaken/claimUsername live in ./staff-admin now
// (see that file's header comment for why).

/**
 * An Admin may act on anyone strictly below them. A SuperAdmin may act on
 * anyone. This is what stops an Admin from editing a peer Admin, and, combined
 * with the role check in `assertMayAssignRole`, from escalating themselves.
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

    // Atomic uniqueness claim, retried through network stalls without ever
    // mistaking a stalled-but-landed create for "username taken".
    if (!(await claimUsername(key, staffId))) {
      return { success: false, error: "username_taken" };
    }

    const permissions = permissionsFor(data.role, data.permissions);
    // Hashed once, outside the retry: re-hashing per attempt would burn CPU and
    // is pointless (any of the hashes verifies the same PIN).
    const pinHash = await bcrypt.hash(data.pin, 10);

    try {
      // The batch is rebuilt inside the retry: a Firestore WriteBatch can only
      // be committed once, so a retry must construct a fresh one. Both writes
      // are set() (idempotent), so re-issuing after a stall is safe.
      await withRetry(() => {
        const batch = adminDb.batch();
        batch.set(adminDb.collection("staff").doc(staffId), {
          username: data.username,
          name: data.name,
          role: data.role,
          color: data.color,
          permissions,
          pinHash,
          active: true,
          // The admin-issued PIN IS the working credential: users sign in with
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
        return batch.commit();
      }, "staff create commit");
    } catch (err) {
      // Don't strand the username on a failed create: it would be
      // unclaimable forever with no staff doc to explain why.
      await adminDb
        .collection("usernames")
        .doc(key)
        .delete()
        .catch(() => {});
      throw err;
    }

    try {
      await syncAuthUser({
        staffId,
        email: toStaffEmail(data.username),
        password: toStaffPassword(data.pin),
        disabled: false,
        claims: { role: data.role, perms: permissions, name: data.name, mustChangePin: false },
      });
    } catch (err) {
      // The staff doc is useless without a matching Auth account (nobody
      // could ever sign in): roll everything back rather than strand it.
      await Promise.all([
        adminDb.collection("staff").doc(staffId).delete(),
        adminDb.collection("staff_public").doc(staffId).delete(),
        adminDb.collection("usernames").doc(key).delete(),
      ]).catch(() => {});
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
    const snap = await withRetry(() => targetRef.get(), "target lookup");
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

    // Rebuilt per attempt (a WriteBatch commits only once); update() is
    // idempotent so re-issuing after a network stall is safe.
    await withRetry(() => {
      const batch = adminDb.batch();
      batch.update(targetRef, { name: data.name, role: data.role, color: data.color, permissions });
      batch.update(adminDb.collection("staff_public").doc(data.targetStaffId), {
        name: data.name,
        role: data.role,
        color: data.color,
      });
      return batch.commit();
    }, "staff update commit");

    // Role and permissions live in the token claims, which survive ID-token
    // refresh. Revoke so a demotion bites before the target logs out, but
    // best-effort: the staff doc is already updated and re-checked server-side.
    revokeBestEffort(data.targetStaffId);

    // Same best-effort treatment as the revoke above: the staff doc (the
    // authoritative source server-side) is already updated, so a stalled
    // claims sync here just means the client's rules-level access lags until
    // the next successful update or login.
    void syncAuthUser({
      staffId: data.targetStaffId,
      claims: {
        role: data.role,
        perms: permissions,
        name: data.name,
        mustChangePin: target.mustChangePin ?? false,
      },
    }).catch((err) => console.error(`[staff] syncAuthUser(${data.targetStaffId}) failed:`, err));

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
    const snap = await withRetry(() => targetRef.get(), "target lookup");
    if (!snap.exists) return { success: false, error: "not_found" };

    const targetRole = snap.data()!.role as StaffRole;
    if (!mayActOn(caller, targetRole)) return { success: false, error: "forbidden" };

    if (!data.active && targetRole === "SuperAdmin") {
      if ((await otherActiveSuperAdmins(data.targetStaffId)) === 0) {
        return { success: false, error: "last_super_admin" };
      }
    }

    await withRetry(() => {
      const batch = adminDb.batch();
      batch.update(targetRef, { active: data.active, failCount: 0, lockedUntil: null });
      batch.update(adminDb.collection("staff_public").doc(data.targetStaffId), {
        active: data.active,
      });
      return batch.commit();
    }, "set-active commit");

    // The real gate: Firebase Auth itself refuses sign-in for a disabled
    // user, so this is awaited rather than best-effort.
    await syncAuthUser({ staffId: data.targetStaffId, disabled: !data.active });

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
    const snap = await withRetry(() => targetRef.get(), "target lookup");
    if (!snap.exists) return { success: false, error: "not_found" };

    const targetRole = snap.data()!.role as StaffRole;
    // Resetting a peer's or a senior's PIN is an account takeover.
    if (caller.uid !== data.targetStaffId && !mayActOn(caller, targetRole)) {
      return { success: false, error: "forbidden" };
    }

    // Hashed once, outside the retry (re-hashing per attempt is wasted CPU).
    const newPinHash = await bcrypt.hash(data.newPin, 10);
    await withRetry(
      () =>
        targetRef.update({
          pinHash: newPinHash,
          // The admin sets the PIN and the user signs in with exactly that: no
          // forced change on next login.
          mustChangePin: false,
          failCount: 0,
          lockedUntil: null,
        }),
      "pin reset write",
    );

    const targetData = snap.data()!;
    await syncAuthUser({
      staffId: data.targetStaffId,
      password: toStaffPassword(data.newPin),
      claims: {
        role: targetRole,
        perms: sanitizePermissions(targetData.permissions),
        name: targetData.name,
        mustChangePin: false,
      },
    });

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
// than disabling it. Same seniority rules as every other staff mutation: an
// Admin may delete anyone strictly below them, a SuperAdmin anyone; nobody may
// delete themselves or the last remaining SuperAdmin.
export const deleteStaffFn = createServerFn({ method: "POST" })
  .validator((raw: unknown) => DeleteStaffSchema.parse(raw))
  .handler(async ({ data }): Promise<StaffActionResult> => {
    const caller = await requireAdmin(data.idToken);
    if (!caller) return { success: false, error: "unauthorized" };
    if (caller.uid === data.targetStaffId) return { success: false, error: "self_target" };

    const targetRef = adminDb.collection("staff").doc(data.targetStaffId);
    const snap = await withRetry(() => targetRef.get(), "target lookup");
    if (!snap.exists) return { success: false, error: "not_found" };

    const target = snap.data()!;
    const targetRole = target.role as StaffRole;
    if (!mayActOn(caller, targetRole)) return { success: false, error: "forbidden" };

    // Deleting the final SuperAdmin would strand the business with nobody able
    // to manage users, same guard as demote/deactivate.
    if (targetRole === "SuperAdmin" && (await otherActiveSuperAdmins(data.targetStaffId)) === 0) {
      return { success: false, error: "last_super_admin" };
    }

    // Remove the private doc, the public roster doc, and the username index
    // entry (freeing the username for reuse), then end any live session.
    // Rebuilt per attempt; delete() is idempotent so retrying is safe.
    const username = target.username;
    await withRetry(() => {
      const batch = adminDb.batch();
      batch.delete(targetRef);
      batch.delete(adminDb.collection("staff_public").doc(data.targetStaffId));
      if (typeof username === "string" && username) {
        batch.delete(adminDb.collection("usernames").doc(usernameKey(username)));
      }
      return batch.commit();
    }, "staff delete commit");

    // The Firestore docs are already gone and this can't be rolled back at
    // this point, but a surviving Auth account would keep working on its
    // still-valid claims -- retry hard, and log loudly rather than swallow a
    // failure that leaves a "deleted" user able to sign in.
    await withRetry(
      () =>
        adminAuth.deleteUser(data.targetStaffId).catch((err) => {
          if ((err as { code?: string }).code !== "auth/user-not-found") throw err;
        }),
      "auth user delete",
    ).catch((err) => console.error(`[staff] deleteUser(${data.targetStaffId}) failed:`, err));

    revokeBestEffort(data.targetStaffId);

    await invalidateStaffCache();
    return { success: true };
  });
