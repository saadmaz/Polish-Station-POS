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

// ── In-memory staff cache ───────────────────────────────────────────────────
// Login must NOT depend on a live Firestore read. This shared host
// intermittently stalls the outbound route to firestore.googleapis.com for
// seconds at a time — proven in production, and proven NOT to be a stale-socket
// issue (brand-new connections stall too). A stalled read hung login. So keep
// the whole (tiny) staff collection in process memory, refreshed in the
// background; login does an in-memory lookup + bcrypt + local token mint with
// ZERO per-request network I/O. A network stall then only delays the background
// refresh (serving slightly stale staff data), never a login.

interface CachedStaff {
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
 *  kick off a background loop — once — that keeps retrying the load until it
 *  succeeds, so a freshly-spawned worker becomes login-ready within a couple of
 *  seconds instead of only when the first (40s-stalling) login forces the load.
 *  Returns immediately; never blocks the caller. Deliberately NOT a top-level
 *  side effect — this is a "use server" module, so module-load code would leak
 *  into / break the client bundle; it runs only when invoked server-side. */
export function warmStaffCache(): void {
  if (cacheLoadedAt !== 0) {
    void refreshStaffCache().catch(() => {}); // already warm — just refresh
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
    const key = usernameKey(username);

    ensureStaffCache(); // background refresh if stale; never blocks

    // Cache not warmed yet (only just after a cold worker spawn — the boot-warm
    // loop is loading it right now). Fail as a transient error, NOT a rejected
    // PIN, so the client's retry lands a moment later on the warmed cache
    // instead of falsely telling a valid user their PIN is wrong. Nudge the
    // load along too.
    if (cacheLoadedAt === 0) {
      warmStaffCache(); // ensure the background load loop is running
      throw new Error("staff cache warming — retry");
    }

    let staffId = staffIdByUsername.get(key);
    // A just-created user may not be in the cache yet — one forced refresh
    // covers that (and genuinely-unknown usernames, which are rare). Everything
    // else is served straight from memory: no Firestore on the login path.
    if (!staffId) {
      await refreshStaffCache().catch(() => {});
      staffId = staffIdByUsername.get(key);
    }
    const staff = staffId ? staffById.get(staffId) : undefined;

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

    // Rehash legacy cost-12 hashes down to cost 10 transparently (fire-and-
    // forget; updates the cache entry so we don't rehash on every login).
    if (staff.pinRounds > 10) {
      void bcrypt
        .hash(pin, 10)
        .then((h) => {
          staff.pinHash = h;
          staff.pinRounds = 10;
          return adminDb.collection("staff").doc(staff.id).update({ pinHash: h });
        })
        .catch(() => {});
    }

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
