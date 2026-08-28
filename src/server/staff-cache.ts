// In-memory staff cache used by the login path. Deliberately its own module,
// separate from auth.ts: this file (unlike auth.ts) is never imported by any
// client-reachable code, so it's safe for it to touch `adminDb`/bcrypt at
// module scope.
//
// Why this split exists: auth.ts is a "use server" file whose createServerFn
// handlers (loginFn, changeOwnPinFn) DO get their bodies swapped for an RPC
// stub in the client bundle -- but that per-handler split doesn't remove the
// *rest* of a file's top-level code. When these cache functions lived
// alongside loginFn in auth.ts, their direct `adminDb`/bcrypt usage kept
// firebase-admin's import (and its Node-only dependency graph) in auth.ts's
// module body, which src/lib/auth.tsx statically imports for the client's
// login screen -- so it shipped into the browser and crashed on first paint.
// Moving all of the adminDb-touching logic here, with nothing exported that
// auth.ts's *unstripped* code needs, keeps firebase-admin out of that import
// chain entirely.
//
// Login must NOT depend on a live Firestore read. This shared host
// intermittently stalls the outbound route to firestore.googleapis.com for
// seconds at a time. Proven in production, and proven NOT to be a stale-socket
// issue (brand-new connections stall too). A stalled read hung login. So keep
// the whole (tiny) staff collection in process memory, refreshed in the
// background; login does an in-memory lookup + bcrypt + local token mint with
// ZERO per-request network I/O. A network stall then only delays the background
// refresh (serving slightly stale staff data), never a login.
import bcrypt from "bcryptjs";
import { adminDb } from "./firebase-admin";
import { withRetry, withTimeout } from "./retry";
import { sanitizePermissions, type ModuleKey, type StaffRole } from "@/lib/permissions";

export interface CachedStaff {
  id: string;
  username: string;
  pinHash: string;
  role: StaffRole;
  name: string;
  permissions: ModuleKey[];
  active: boolean;
  mustChangePin: boolean;
  pinRounds: number;
}

/** Usernames are matched case-insensitively; the index doc is keyed by the
 *  lowercased form while the staff doc keeps the display casing. */
const usernameKey = (u: string) => u.trim().toLowerCase();

let staffById = new Map<string, CachedStaff>();
let staffIdByUsername = new Map<string, string>();
let cacheLoadedAt = 0;
let refreshInFlight: Promise<void> | null = null;

const STAFF_CACHE_TTL_MS = 60 * 1000;

function toCached(id: string, d: Record<string, unknown>): CachedStaff {
  const pinHash = (d.pinHash as string) ?? "";
  return {
    id,
    username: (d.username as string) ?? "",
    pinHash,
    role: d.role as StaffRole,
    name: (d.name as string) ?? "Staff",
    permissions: sanitizePermissions(d.permissions),
    active: d.active !== false,
    mustChangePin: d.mustChangePin === true,
    pinRounds: pinHash ? bcrypt.getRounds(pinHash) : 10,
  };
}

/** Reload the whole staff collection into memory. De-duped so concurrent
 *  callers share one in-flight read; time-boxed so a stall can't wedge it. */
function refreshStaffCache(): Promise<void> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const snap = await withTimeout(adminDb.collection("staff").get(), 6_000, "staff cache load");
      const byId = new Map<string, CachedStaff>();
      const byName = new Map<string, string>();
      for (const doc of snap.docs) {
        const rec = toCached(doc.id, doc.data());
        byId.set(doc.id, rec);
        if (rec.username) byName.set(usernameKey(rec.username), doc.id);
      }
      staffById = byId;
      staffIdByUsername = byName;
      cacheLoadedAt = Date.now();
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

/** Keep the cache fresh without ever blocking a login on the flaky network:
 *  a stale cache refreshes in the background. The first load is handled by the
 *  boot-warm loop below, not here, so login never waits 40s on a cold worker. */
function ensureStaffCache(): void {
  if (cacheLoadedAt !== 0 && Date.now() - cacheLoadedAt > STAFF_CACHE_TTL_MS) {
    void refreshStaffCache().catch(() => {});
  }
}

let warmLoopActive = false;

/** Called by /healthz (boot self-warm + keep-warm cron). If the cache is cold,
 *  kick off a background loop (once) that keeps retrying the load until it
 *  succeeds, so a freshly-spawned worker becomes login-ready within a couple of
 *  seconds instead of only when the first (40s-stalling) login forces the load.
 *  Returns immediately; never blocks the caller. */
export function warmStaffCache(): void {
  if (cacheLoadedAt !== 0) {
    void refreshStaffCache().catch(() => {}); // already warm, just refresh
    return;
  }
  if (warmLoopActive) return; // a load loop is already running
  warmLoopActive = true;
  void (async () => {
    for (let i = 0; i < 30 && cacheLoadedAt === 0; i++) {
      await refreshStaffCache().catch(() => {});
      if (cacheLoadedAt === 0) await new Promise((r) => setTimeout(r, 2000));
    }
    warmLoopActive = false;
  })();
}

/** Called by staff mutations so a create/edit/reset/deactivate/delete is
 *  reflected immediately rather than only after the TTL. Best-effort. */
export function invalidateStaffCache(): Promise<void> {
  return refreshStaffCache().catch(() => {});
}

/** Fallback for a login on a worker whose cache hasn't loaded yet: read just
 *  this one user (username index → staff doc) instead of the whole collection.
 *  Two small reads, each retried. Plain reads are reliable from this host, so
 *  a cold worker still serves a working login instead of rejecting it. */
async function readStaffDirect(key: string): Promise<CachedStaff | undefined> {
  const idx = await withRetry(
    () => adminDb.collection("usernames").doc(key).get(),
    "username lookup",
    3,
    5_000,
  );
  const staffId = idx.exists ? idx.data()?.staffId : undefined;
  if (typeof staffId !== "string") return undefined;

  const snap = await withRetry(
    () => adminDb.collection("staff").doc(staffId).get(),
    "staff lookup",
    3,
    5_000,
  );
  if (!snap.exists) return undefined;
  return toCached(staffId, snap.data()!);
}

/** Look up a username for login, preferring the in-memory cache and falling
 *  back to a direct two-read lookup on a cold worker (see readStaffDirect).
 *  Encapsulates the exact cache-then-cold-path decision loginFn needs. */
export async function lookupStaffForLogin(username: string): Promise<CachedStaff | undefined> {
  const key = usernameKey(username);
  ensureStaffCache(); // background refresh if stale; never blocks

  if (cacheLoadedAt !== 0) {
    // Warm cache: the fast path, no network at all.
    let staffId = staffIdByUsername.get(key);
    // A just-created user may not be in the cache yet; one forced refresh
    // covers that (and genuinely-unknown usernames, which are rare).
    if (!staffId) {
      await refreshStaffCache().catch(() => {});
      staffId = staffIdByUsername.get(key);
    }
    return staffId ? staffById.get(staffId) : undefined;
  }

  // Cold worker (freshly spawned; its cache is still loading). Do NOT fail
  // the login: plain Firestore READS are reliable from this host, it is
  // only the cache's whole-collection load that can lag. Read this one
  // user directly so a login on a cold worker still works, and nudge the
  // background load along for the next request.
  warmStaffCache();
  return readStaffDirect(key).catch(() => undefined);
}

/** Applied after a successful login when the stored hash used the old,
 *  more expensive bcrypt cost -- rehashes it down transparently and keeps
 *  the cache entry in sync so we don't redo this on every login. */
export function rehashIfLegacyCost(staff: CachedStaff, pin: string): void {
  if (staff.pinRounds <= 10) return;
  void bcrypt
    .hash(pin, 10)
    .then((h) => {
      staff.pinHash = h;
      staff.pinRounds = 10;
      return adminDb.collection("staff").doc(staff.id).update({ pinHash: h });
    })
    .catch(() => {});
}
