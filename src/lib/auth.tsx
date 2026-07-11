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
import { signInWithCustomToken, signOut, onIdTokenChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth as firebaseAuth, db } from "./firebase";
import { loginFn, type LoginResult } from "@/server/auth";
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

export interface LoginSuccess {
  mustChangePin: boolean;
}

interface AuthState {
  staff: StaffProfile | null;
  loading: boolean;
  mustChangePin: boolean;
  login: (username: string, pin: string) => Promise<LoginError | null>;
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
const MUST_CHANGE_KEY = "ps_must_change_pin";

// ── Context ───────────────────────────────────────────────────────────────────

// ── Resilient login ─────────────────────────────────────────────────────────

function withClientTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

/**
 * The app runs on shared hosting whose outbound network intermittently stalls a
 * single Firestore call inside loginFn — the request reaches the server and
 * simply never returns (observed hanging 45s+), even on a warm worker, roughly
 * 1 attempt in 4. A keep-warm can't fix a per-request stall, so the client
 * time-boxes each attempt and retries: with ~75% per-attempt success, three
 * tries make login succeed ~98% of the time and cap the worst case at ~30s
 * instead of an indefinite hang.
 *
 * Retrying is safe: a correct PIN never increments the fail counter, and a
 * wrong PIN / locked / inactive account returns a *result* in well under the
 * per-attempt timeout, so those answers are returned immediately and never
 * trigger a retry — only a genuine timeout/network error does.
 */
async function loginWithRetry(
  username: string,
  pin: string,
  attempts = 3,
  perAttemptMs = 10_000,
): Promise<LoginResult> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await withClientTimeout(loginFn({ data: { username, pin } }), perAttemptMs, "login");
    } catch (err) {
      lastErr = err; // transient stall/network — try again
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Login failed");
}

const AuthContext = createContext<AuthState | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [staff, setStaff] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(true);
  // Survives the remount caused by signInWithCustomToken → onIdTokenChanged.
  const [mustChangePin, setMustChangePin] = useState(
    () => typeof window !== "undefined" && sessionStorage.getItem(MUST_CHANGE_KEY) === "1",
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const logout = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    localStorage.removeItem(ACTIVITY_KEY);
    sessionStorage.removeItem(MUST_CHANGE_KEY);
    setMustChangePin(false);
    await signOut(firebaseAuth);
  }, []);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(logout, SESSION_TIMEOUT_MS);
    localStorage.setItem(ACTIVITY_KEY, Date.now().toString());
  }, [logout]);

  const touchActivity = useCallback(() => resetTimer(), [resetTimer]);

  const clearMustChangePin = useCallback(() => {
    sessionStorage.removeItem(MUST_CHANGE_KEY);
    setMustChangePin(false);
  }, []);

  // Sync with Firebase Auth session. onIdTokenChanged (rather than
  // onAuthStateChanged) also fires on token refresh, so a server-side
  // revokeRefreshTokens surfaces here as a failed getIdTokenResult and signs
  // the user out — that is what makes a demotion take effect immediately.
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
        // to enter the app — no Firestore read on the login critical path.
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
        // Token revoked — no session.
        await signOut(firebaseAuth);
        setStaff(null);
      }

      setLoading(false);
    });

    return unsub;
  }, [resetTimer]);

  // Inactivity detection — reset the timer on any user interaction
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
  // idles it out (~5 min) — then the next server function (add user, change
  // PIN) pays a ~20s cold start and 408s. Pinging /healthz (not /) every 4 min
  // from any open tab keeps the login path specifically warm: it exercises
  // firebase-admin + a Firestore connection, which a bare `/` SSR ping never
  // touches. So a manager's open dashboard keeps a new employee's first login
  // on a shop tablet fast. Complements PassengerMinInstances and the cron.
  useEffect(() => {
    if (!staff) return;
    const ping = () => void fetch("/healthz", { cache: "no-store" }).catch(() => {});
    ping(); // once on mount too, not only after the first interval
    const t = setInterval(ping, 4 * 60 * 1000);
    return () => clearInterval(t);
  }, [staff]);

  const login = useCallback(async (username: string, pin: string): Promise<LoginError | null> => {
    try {
      const result: LoginResult = await loginWithRetry(username, pin);

      if (!result.success) {
        if (result.error === "locked") return { code: "locked", remainingSec: result.remainingSec };
        if (result.error === "inactive") return { code: "inactive" };
        return { code: "invalid_credentials" };
      }

      // Set before sign-in: onIdTokenChanged fires synchronously enough that a
      // later setState could lose the race with the route guard.
      if (result.mustChangePin) sessionStorage.setItem(MUST_CHANGE_KEY, "1");
      setMustChangePin(result.mustChangePin);

      // signInWithCustomToken is a network call too — time-box it so a stalled
      // identitytoolkit request surfaces as a retryable error instead of an
      // indefinite "Signing in…" hang.
      await withClientTimeout(
        signInWithCustomToken(firebaseAuth, result.customToken),
        15_000,
        "sign-in",
      );
      return null; // null = success
    } catch (err) {
      return {
        code: "unknown",
        message: err instanceof Error ? err.message : "Login failed",
      };
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
