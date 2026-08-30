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
  login: (username: string, pin: string) => Promise<LoginError | null>;
  logout: () => Promise<void>;
  touchActivity: () => void;
  /** Clears the forced-PIN-change gate after a successful change. */
  clearMustChangePin: () => Promise<void>;
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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const logout = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    localStorage.removeItem(ACTIVITY_KEY);
    setMustChangePin(false);
    await signOut(firebaseAuth);
  }, []);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(logout, SESSION_TIMEOUT_MS);
    localStorage.setItem(ACTIVITY_KEY, Date.now().toString());
  }, [logout]);

  const touchActivity = useCallback(() => resetTimer(), [resetTimer]);

  // changeOwnPinFn already awaits setCustomUserClaims before returning
  // success, so a forced refresh here is guaranteed to pick up the cleared
  // claim -- this re-fires onIdTokenChanged, which updates `mustChangePin`.
  const clearMustChangePin = useCallback(async () => {
    await firebaseAuth.currentUser?.getIdToken(true);
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
    ping(); // once on mount too, not only after the first interval
    const t = setInterval(ping, 4 * 60 * 1000);
    return () => clearInterval(t);
  }, [staff]);

  const login = useCallback(async (username: string, pin: string): Promise<LoginError | null> => {
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
      return null; // null = success; onIdTokenChanged picks up staff/mustChangePin
    } catch (err) {
      return mapFirebaseAuthError(err);
    }
  }, []);

  const can = useCallback(
    (moduleKey: ModuleKey) => hasModule(staff?.role, staff?.permissions, moduleKey),
    [staff],
  );

  const value = useMemo<AuthState>(
    () => ({
      staff,
      loading,
      mustChangePin,
      login,
      logout,
      touchActivity,
      clearMustChangePin,
      can,
    }),
    [staff, loading, mustChangePin, login, logout, touchActivity, clearMustChangePin, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
