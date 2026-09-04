// Split out of staff.ts for the same reason server/staff-cache.ts was split
// out of auth.ts: staff.ts is a "use server" file imported by the client
// (src/components/access-panel.tsx). Its createServerFn handlers get their
// bodies swapped for an RPC stub in the client bundle, but these plain
// top-level helpers -- called BY those handlers but not nested inside them --
// don't get stripped, which kept adminDb/adminAuth's imports (and
// firebase-admin's Node-only dependency graph) alive in the client bundle.
import { webcrypto } from "node:crypto";
import { adminAuth, adminDb } from "./firebase-admin";
import { withRetry, withTimeout } from "./retry";
import { isAdmin, isManagerOrAbove, type StaffRole } from "@/lib/permissions";
import { encryptOfflinePayload } from "@/lib/offline-crypto";

interface AuthUserSync {
  staffId: string;
  email?: string; // only needed the first time an account is provisioned
  password?: string; // only when setting or resetting the PIN
  disabled?: boolean;
  claims?: { role: StaffRole; perms: string[]; name: string; mustChangePin: boolean };
}

/**
 * Provisions or updates the Firebase Auth account backing a staff member, and
 * persists role/perms/name/mustChangePin as custom claims -- the same values
 * firestore.rules reads via request.auth.token.*, now set here (rarely, at
 * account create/edit time) instead of embedded in a per-login custom token.
 *
 * No Firebase Auth user is guaranteed to exist yet: historically an account
 * only sprang into existence, passwordless and claimless, the first time
 * someone signed in with a custom token for that uid. updateUser() 404s for
 * anyone who predates this, so fall back to createUser() with the same uid.
 *
 * Unlike revokeBestEffort below, this is awaited at every call site: it IS
 * the operation (the account that can or can't sign in), not a best-effort
 * side effect -- but still time-boxed like every other identitytoolkit call
 * this host is prone to stalling on.
 */
export async function syncAuthUser({ staffId, email, password, disabled, claims }: AuthUserSync) {
  const patch: Record<string, unknown> = {};
  if (email !== undefined) patch.email = email;
  if (password !== undefined) patch.password = password;
  if (disabled !== undefined) patch.disabled = disabled;

  if (Object.keys(patch).length) {
    try {
      await withRetry(() => adminAuth.updateUser(staffId, patch), "auth user update");
    } catch (err) {
      if ((err as { code?: string }).code === "auth/user-not-found") {
        await withRetry(
          () =>
            adminAuth.createUser({ uid: staffId, email, password, disabled: disabled ?? false }),
          "auth user create",
        );
      } else {
        throw err;
      }
    }
  }

  if (claims) {
    await withRetry(() => adminAuth.setCustomUserClaims(staffId, claims), "auth claims set");
  }
}

/**
 * The bcrypt `pinHash` proves a PIN was typed correctly; it can never
 * reconstruct an offline credential, because bcrypt hashes can't be
 * un-hashed. So every call site that ever sees a *raw* PIN (create, reset,
 * self-change -- never login itself, which stays a direct Firebase Auth
 * call) also derives this: an AES-GCM blob only that exact PIN can decrypt.
 * A till caches its own further-wrapped copy of it (see
 * src/lib/offline-auth.ts) so a staff member can be authenticated with no
 * network at all, once they've logged in online on that till at least once
 * since their PIN was last set.
 */
export async function offlineBlobFields(
  pin: string,
  claims: {
    staffId: string;
    role: StaffRole;
    perms: string[];
    name: string;
    mustChangePin: boolean;
  },
) {
  const blob = await encryptOfflinePayload(webcrypto as unknown as Crypto, pin, claims);
  return {
    offlineSalt: blob.salt,
    offlineIterations: blob.iterations,
    offlineIv: blob.iv,
    offlineCiphertext: blob.ciphertext,
  };
}

export interface Caller {
  uid: string;
  role: StaffRole;
}

/**
 * Verify the caller's ID token and read their role from the *staff document*,
 * not from the token claim. A claim can be up to an hour stale; the document is
 * authoritative, which is also why `checkRevoked` is deliberately NOT used:
 * it adds a blocking identitytoolkit round trip that this shared host tends to
 * stall (the same class of hang that broke login before preferRest), and a
 * demoted/deactivated caller is already rejected by the fresh doc read below.
 * Every await is time-boxed so a stalled upstream fails in seconds instead of
 * hanging the request into LiteSpeed's 408.
 */
export async function requireCaller(idToken: string): Promise<Caller | null> {
  let uid: string;
  try {
    // Retried: the cert fetch behind verifyIdToken is an outbound call this
    // host stalls, and a stall here spun the admin's button forever.
    uid = (await withRetry(() => adminAuth.verifyIdToken(idToken), "token verify")).uid;
  } catch {
    return null;
  }

  const snap = await withRetry(() => adminDb.collection("staff").doc(uid).get(), "caller lookup");
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
export function revokeBestEffort(staffId: string) {
  void withTimeout(adminAuth.revokeRefreshTokens(staffId), 8_000, "token revoke").catch((err) =>
    console.error(`[staff] revokeRefreshTokens(${staffId}) failed:`, err),
  );
}

/** Managing users (create / edit / deactivate) is Admin+. */
export async function requireAdmin(idToken: string): Promise<Caller | null> {
  const caller = await requireCaller(idToken);
  return caller && isAdmin(caller.role) ? caller : null;
}

/** Resetting a subordinate's PIN stays available to Managers, as before. */
export async function requireManager(idToken: string): Promise<Caller | null> {
  const caller = await requireCaller(idToken);
  return caller && isManagerOrAbove(caller.role) ? caller : null;
}

/** Count active SuperAdmins, optionally ignoring one staffId (the one being
 *  changed). Equality-only query, no composite index required. */
export async function otherActiveSuperAdmins(excludeStaffId: string): Promise<number> {
  const snap = await withRetry(
    () => adminDb.collection("staff").where("role", "==", "SuperAdmin").get(),
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
 *  the way usernames works; worth doing when jobs move to `techId`. */
export async function nameTaken(name: string, excludeStaffId?: string): Promise<boolean> {
  const snap = await withRetry(
    () => adminDb.collection("staff").where("name", "==", name).get(),
    "name uniqueness check",
  );
  return snap.docs.some((d) => d.id !== excludeStaffId);
}

/** Claim the username index doc. `.create()` is single-shot (it throws if the
 *  doc exists); that atomicity is what guarantees uniqueness, but it also
 *  means a naive retry after a STALLED create would see "already exists" and
 *  wrongly report username_taken for a claim we actually won. So on a timeout,
 *  re-read the doc: if it now holds OUR staffId the create did land (success);
 *  if it holds someone else's it's genuinely taken; if it's absent, retry. */
export async function claimUsername(key: string, staffId: string): Promise<boolean> {
  for (let i = 0; i < 4; i++) {
    try {
      await withTimeout(
        adminDb.collection("usernames").doc(key).create({ staffId }),
        6_000,
        "username claim",
      );
      return true;
    } catch (err) {
      const timedOut = err instanceof Error && err.message.includes("timed out");
      if (!timedOut) return false; // already exists → genuinely taken

      const snap = await withRetry(
        () => adminDb.collection("usernames").doc(key).get(),
        "username re-check",
      ).catch(() => null);
      if (snap?.exists) return snap.data()?.staffId === staffId;
      // Not created: the stall killed it before it landed. Try again.
    }
  }
  throw new Error("username claim failed after retries");
}
