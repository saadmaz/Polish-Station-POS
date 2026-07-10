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
        // would let the UI and the rules disagree.
        const { claims } = await user.getIdTokenResult();
        const role = claims.role as StaffRole | undefined;

        // colour is cosmetic and not worth a claim; it lives in staff_public.
        const snap = await getDoc(doc(db, "staff_public", user.uid));

        if (!role || !snap.exists() || snap.data().active === false) {
          await signOut(firebaseAuth);
          setStaff(null);
        } else {
          setStaff({
            id: user.uid,
            name: (claims.name as string) ?? (snap.data().name as string),
            role,
            color: snap.data().color as string,
            permissions: sanitizePermissions(claims.perms),
          });
          resetTimer();
        }
      } catch {
        // Token revoked, or staff_public unreadable — either way, no session.
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

  const login = useCallback(async (username: string, pin: string): Promise<LoginError | null> => {
    try {
      const result: LoginResult = await loginFn({ data: { username, pin } });

      if (!result.success) {
        if (result.error === "locked") return { code: "locked", remainingSec: result.remainingSec };
        if (result.error === "inactive") return { code: "inactive" };
        return { code: "invalid_credentials" };
      }

      // Set before sign-in: onIdTokenChanged fires synchronously enough that a
      // later setState could lose the race with the route guard.
      if (result.mustChangePin) sessionStorage.setItem(MUST_CHANGE_KEY, "1");
      setMustChangePin(result.mustChangePin);

      await signInWithCustomToken(firebaseAuth, result.customToken);
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
