import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { signInWithEmailAndPassword, signOut, onIdTokenChanged } from "firebase/auth";
import { toast } from "sonner";
import { doc, getDoc } from "firebase/firestore";
import { auth as firebaseAuth, db } from "./firebase";
import { toStaffEmail, toStaffPassword } from "./staff-auth";
import { hasModule, sanitizePermissions, type ModuleKey, type StaffRole } from "./permissions";
import {
  attemptOfflineUnlock,
  checkDeviceRevocation,
  fetchAndCacheOfflineCredential,
  isDeviceEnrolled,
} from "./offline-auth";

// Re-exported so the many `import { type StaffRole } from "@/lib/auth"` call
// sites keep working; permissions.ts is the definition.
export type { StaffRole, ModuleKey };
export { isAdmin, isManagerOrAbove, isSuperAdmin } from "./permissions";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StaffProfile {
  id: string;
  name: string;
  role: StaffRole;
  color: string;
  permissions: ModuleKey[];
}

export type LoginError =
  | { code: "invalid_credentials" }
  | { code: "locked"; remainingSec: number }
  | { code: "inactive" }
  | { code: "unknown"; message: string };

interface AuthState {
  staff: StaffProfile | null;
  loading: boolean;
  mustChangePin: boolean;
  /** True when `staff` came from a local offline-PIN unlock, not a real
   *  Firebase session -- see src/lib/offline-auth.ts. No real ID token backs
   *  this session, so every Firestore write is rejected regardless of any
   *  UI-level gating; consumers use this flag to keep the UI honest about it
   *  (an "Offline" badge, restricting nav to read-only screens). */
  isOffline: boolean;
  /** `staffId` is optional for API compatibility but should always be passed
   *  by callers that have it (the login screen's staff picker always does):
   *  it's what lets the offline fallback find this account's cached
   *  credential when Firebase itself is unreachable. */
  login: (username: string, pin: string, staffId?: string) => Promise<LoginError | null>;
  logout: () => Promise<void>;
  touchActivity: () => void;
  /** Clears the forced-PIN-change gate after a successful change. */
  clearMustChangePin: () => void;
  /** Module access for the signed-in user. SuperAdmins always pass. */
  can: (moduleKey: ModuleKey) => boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15-minute inactivity timeout
const ACTIVITY_KEY = "ps_last_activity";

// ── Context ───────────────────────────────────────────────────────────────────

// ── Resilient login ─────────────────────────────────────────────────────────

export function withClientTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

/**
 * The app runs on shared hosting whose outbound network intermittently stalls a
 * single server-function call: the request reaches the server and simply
 * never returns (observed hanging 45s+), even on a warm worker. The same
 * stall shows up for minutes at a time right after a deploy, while Passenger
 * respawns the Node process and CI's own warm-up loop (up to ~60s, see
 * .github/workflows/deploy.yml) is still chasing /healthz. A keep-warm can't
 * fix either case, so the client time-boxes each attempt and retries: 8
 * attempts at 10s plus a 1.5s pause between them budgets ~91s total, enough
 * to ride out a typical deploy-restart window as a longer spinner instead of
 * a hard "couldn't reach the server" that makes someone re-enter their PIN.
 *
 * Retrying is safe here because a *logical* result (wrong PIN, locked,
 * inactive, wrong current PIN, etc.) always comes back well under the
 * per-attempt timeout and is returned immediately without retrying; only a
 * genuine timeout/network error triggers another attempt. `changeOwnPinFn`
 * meets that contract by resolving with a `{success:false}` payload instead
 * of throwing, so the default `shouldRetry` (retry everything that throws)
 * is correct there. `signInWithEmailAndPassword` does NOT meet it -- it
 * throws for a wrong PIN just like it does for a network stall -- so its
 * caller passes a `shouldRetry` that excludes Firebase's definitive auth
 * error codes, or a single mistyped PIN would retry up to 8 times.
 */
export async function retryTransient<T>(
  attempt: () => Promise<T>,
  what: string,
  attempts = 8,
  perAttemptMs = 10_000,
  shouldRetry: (err: unknown) => boolean = () => true,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await withClientTimeout(attempt(), perAttemptMs, what);
    } catch (err) {
      lastErr = err;
      if (!shouldRetry(err)) throw err; // a definitive answer, not a stall
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`${what} failed`);
}

/** Firebase Auth error codes that represent a definitive answer (wrong PIN,
 *  disabled account, rate-limited, etc.), not a network/timeout stall --
 *  retrying these wastes ~12s and hammers Firebase's own rate limiter for no
 *  benefit, since the same credentials will fail the same way every time. */
const DEFINITIVE_AUTH_ERROR_CODES = new Set([
  "auth/user-not-found",
  "auth/wrong-password",
  "auth/invalid-credential",
  "auth/invalid-email",
  "auth/user-disabled",
  "auth/too-many-requests",
]);

/**
 * Firebase's own errors already merge "no such user" and "wrong password"
 * into auth/invalid-credential, so the enumeration-safety the old server-side
 * 200ms-delay hack existed for comes for free here.
 */
function mapFirebaseAuthError(err: unknown): LoginError {
  const code = err instanceof Error ? (err as { code?: string }).code : undefined;

  switch (code) {
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
    case "auth/invalid-email":
      return { code: "invalid_credentials" };
    case "auth/user-disabled":
      return { code: "inactive" };
    case "auth/too-many-requests":
      // Firebase doesn't expose the real remaining cooldown; this is a fixed
      // estimate for the existing countdown UI, not an exact value.
      return { code: "locked", remainingSec: 60 };
    default:
      return { code: "unknown", message: err instanceof Error ? err.message : "Login failed" };
  }
}

const AuthContext = createContext<AuthState | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [staff, setStaff] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(true);
  // Comes from the same ID-token claims as role/perms (see onIdTokenChanged
  // below), so it's always consistent with `staff` -- no separate channel to
  // race against the route guard the way a pre-login-response value would.
  const [mustChangePin, setMustChangePin] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const logout = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    localStorage.removeItem(ACTIVITY_KEY);
    setMustChangePin(false);
    setIsOffline(false);
    // An offline session has no real Firebase user to sign out of.
    if (firebaseAuth.currentUser) await signOut(firebaseAuth);
    else setStaff(null);
  }, []);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(logout, SESSION_TIMEOUT_MS);
    localStorage.setItem(ACTIVITY_KEY, Date.now().toString());
  }, [logout]);

  const touchActivity = useCallback(() => resetTimer(), [resetTimer]);

  // changeOwnPinFn now applies its Firebase Auth claims update best-effort,
  // NOT awaited before it responds (see that function's comment -- awaiting
  // it there made a routine PIN change fail on this host's slow identitytoolkit
  // connections). So a forced token refresh here can't be relied on to have
  // anything new to fetch yet. The Firestore write it's paired with already
  // confirmed the change synchronously, which is enough to unblock the
  // current session locally; the claim itself catches up in the background
  // for whenever this person's session/token next refreshes for real.
  const clearMustChangePin = useCallback(() => {
    setMustChangePin(false);
  }, []);

  // Sync with Firebase Auth session. onIdTokenChanged (rather than
  // onAuthStateChanged) also fires on token refresh, so a server-side
  // revokeRefreshTokens surfaces here as a failed getIdTokenResult and signs
  // the user out, which is what makes a demotion take effect immediately.
  useEffect(() => {
    const unsub = onIdTokenChanged(firebaseAuth, async (user) => {
      if (!user) {
        setStaff(null);
        setLoading(false);
        return;
      }

      try {
        // Role and permissions come from the token claims, the same values
        // firestore.rules enforces on. Reading them from a document instead
        // would let the UI and the rules disagree. The claims alone are enough
        // to enter the app: no Firestore read on the login critical path.
        const { claims } = await user.getIdTokenResult();
        const role = claims.role as StaffRole | undefined;

        if (!role) {
          await signOut(firebaseAuth);
          setStaff(null);
        } else {
          setStaff({
            id: user.uid,
            name: (claims.name as string) ?? "Staff",
            role,
            color: "oklch(0.55 0.21 27)", // brand default until the doc arrives
            permissions: sanitizePermissions(claims.perms),
          });
          setMustChangePin(!!claims.mustChangePin);
          setIsOffline(false); // a real token always supersedes any offline session
          resetTimer();

          // Cosmetics + deactivation sweep off the critical path: fetch the
          // public profile in the background for the real colour, and sign
          // out if the account has been deactivated since the token was
          // minted (server functions and rules already reject it regardless).
          void getDoc(doc(db, "staff_public", user.uid))
            .then(async (snap) => {
              if (!snap.exists() || snap.data().active === false) {
                await signOut(firebaseAuth);
                setStaff(null);
              } else {
                const d = snap.data();
                setStaff((prev) =>
                  prev && prev.id === user.uid
                    ? {
                        ...prev,
                        name: (d.name as string) ?? prev.name,
                        color: (d.color as string) ?? prev.color,
                      }
                    : prev,
                );
              }
            })
            .catch(() => {}); // transient read failure ≠ invalid session
        }
      } catch {
        // Token revoked, so no session.
        await signOut(firebaseAuth);
        setStaff(null);
      }

      setLoading(false);
    });

    return unsub;
  }, [resetTimer]);

  // Inactivity detection: reset the timer on any user interaction
  useEffect(() => {
    if (!staff) return;
    const events = ["mousedown", "keydown", "touchstart", "scroll"] as const;
    const handler = () => touchActivity();
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    return () => {
      events.forEach((e) => window.removeEventListener(e, handler));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [staff, touchActivity]);

  // Keep the app server warm while anyone is signed in. A loaded SPA talks
  // straight to Firestore, so the Node process gets no traffic and Passenger
  // idles it out (~5 min), and then the next server function (add user, change
  // PIN) pays a ~20s cold start and 408s. Pinging /healthz (not /) every 4 min
  // from any open tab keeps the login path specifically warm: it exercises
  // firebase-admin + a Firestore connection, which a bare `/` SSR ping never
  // touches. So a manager's open dashboard keeps a new employee's first login
  // on a shop tablet fast. Complements PassengerMinInstances and the cron.
  // Same stale-bundle check as the login screen (see src/routes/index.tsx),
  // but softer here: a signed-in tab may be mid-checkout, so nudge with a
  // dismissible toast instead of reloading out from under someone. Fires at
  // most once per tab so it doesn't re-toast every 4 minutes.
  useEffect(() => {
    if (!staff) return;
    let notified = false;
    const ping = () =>
      void fetch("/healthz", { cache: "no-store" })
        .then((r) => {
          const serverBuild = r.headers.get("X-Build-Id");
          if (notified || !serverBuild || serverBuild === __BUILD_ID__) return;
          notified = true;
          toast.info("An update is available", {
            description: "Refresh when convenient to get the latest fixes.",
            action: { label: "Refresh", onClick: () => window.location.reload() },
            duration: Infinity,
          });
        })
        .catch(() => {});
    // Riding along on the same interval: while online, confirm this specific
    // till hasn't been revoked (Settings → Devices). A revoked till wipes its
    // own offline cache the next time it happens to check -- see
    // src/lib/offline-auth.ts -- there's no way to push that to an already-
    // offline device.
    ping(); // once on mount too, not only after the first interval
    void checkDeviceRevocation();
    const t = setInterval(
      () => {
        ping();
        void checkDeviceRevocation();
      },
      4 * 60 * 1000,
    );
    return () => clearInterval(t);
  }, [staff]);

  const login = useCallback(
    async (username: string, pin: string, staffId?: string): Promise<LoginError | null> => {
      try {
        // Talks straight to Google's identitytoolkit -- our own server is never
        // touched during login, which is the whole point: the shared host's
        // cold starts used to be exactly what "Couldn't reach the server" meant
        // here. Still retried: a shop router/DNS hiccup reaching Google's auth
        // domain specifically is possible even when everything else is fine.
        await retryTransient(
          () =>
            signInWithEmailAndPassword(firebaseAuth, toStaffEmail(username), toStaffPassword(pin)),
          "sign-in",
          8,
          10_000,
          (err) =>
            !DEFINITIVE_AUTH_ERROR_CODES.has((err as { code?: string } | undefined)?.code ?? ""),
        );
        // Real online success: refresh this till's cached offline credential
        // in the background, best-effort. onIdTokenChanged picks up
        // staff/mustChangePin from the real token above.
        if (staffId) void fetchAndCacheOfflineCredential(staffId).catch(() => {});
        return null;
      } catch (err) {
        const code = err instanceof Error ? (err as { code?: string }).code : undefined;
        const isDefinitive = !!code && DEFINITIVE_AUTH_ERROR_CODES.has(code);

        // Only a genuine network failure (never a definitive rejection --
        // that's a real "wrong PIN"/"deactivated" answer from Firebase
        // itself) falls back to a local unlock, and only on a till that's
        // actually enrolled for it.
        if (!isDefinitive && staffId && isDeviceEnrolled()) {
          const offline = await attemptOfflineUnlock(staffId, pin);
          if (offline.ok) {
            const { claims } = offline;
            setStaff({
              id: claims.staffId,
              name: claims.name,
              role: claims.role,
              color: "oklch(0.55 0.21 27)", // brand default -- no network to fetch the real one
              permissions: claims.perms,
            });
            setMustChangePin(claims.mustChangePin);
            setIsOffline(true);
            resetTimer();
            return null;
          }
          if (offline.reason === "wrong_pin") return { code: "invalid_credentials" };
          if (offline.reason === "locked") {
            return { code: "locked", remainingSec: offline.remainingSec ?? 30 };
          }
          // "no_cached_credential" / "stale": nothing usable offline for this
          // account on this till -- fall through to the normal network error.
        }
        return mapFirebaseAuthError(err);
      }
    },
    [resetTimer],
  );

  const can = useCallback(
    (moduleKey: ModuleKey) => hasModule(staff?.role, staff?.permissions, moduleKey),
    [staff],
  );

  const value = useMemo<AuthState>(
    () => ({
      staff,
      loading,
      mustChangePin,
      isOffline,
      login,
      logout,
      touchActivity,
      clearMustChangePin,
      can,
    }),
    [
      staff,
      loading,
      mustChangePin,
      isOffline,
      login,
      logout,
      touchActivity,
      clearMustChangePin,
      can,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
