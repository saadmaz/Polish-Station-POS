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
import { signInWithCustomToken, signOut, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth as firebaseAuth, db } from "./firebase";
import { loginFn, type LoginResult } from "@/server/auth";

// ── Types ─────────────────────────────────────────────────────────────────────

export type StaffRole = "Technician" | "Cashier" | "Advisor" | "Manager" | "Admin";

export interface StaffProfile {
  id:    string;
  name:  string;
  role:  StaffRole;
  color: string;
}

export type LoginError =
  | { code: "invalid_credentials" }
  | { code: "locked"; remainingSec: number }
  | { code: "inactive" }
  | { code: "unknown"; message: string };

interface AuthState {
  staff:         StaffProfile | null;
  loading:       boolean;
  login:         (staffId: string, pin: string) => Promise<LoginError | null>;
  logout:        () => Promise<void>;
  touchActivity: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15-minute inactivity timeout
const ACTIVITY_KEY       = "ps_last_activity";

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthState | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [staff,   setStaff]   = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const timerRef              = useRef<ReturnType<typeof setTimeout> | null>(null);

  const logout = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    localStorage.removeItem(ACTIVITY_KEY);
    await signOut(firebaseAuth);
  }, []);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(logout, SESSION_TIMEOUT_MS);
    localStorage.setItem(ACTIVITY_KEY, Date.now().toString());
  }, [logout]);

  const touchActivity = useCallback(() => resetTimer(), [resetTimer]);

  // Sync with Firebase Auth session (runs client-side only via useEffect)
  useEffect(() => {
    const unsub = onAuthStateChanged(firebaseAuth, async (user) => {
      if (user) {
        const snap = await getDoc(doc(db, "staff_public", user.uid));
        if (snap.exists()) {
          const d = snap.data();
          setStaff({
            id:    user.uid,
            name:  d.name  as string,
            role:  d.role  as StaffRole,
            color: d.color as string,
          });
          resetTimer();
        } else {
          // Firebase user exists but no staff_public record — sign out
          await signOut(firebaseAuth);
          setStaff(null);
        }
      } else {
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
    events.forEach(e => window.addEventListener(e, handler, { passive: true }));
    return () => {
      events.forEach(e => window.removeEventListener(e, handler));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [staff, touchActivity]);

  const login = useCallback(async (staffId: string, pin: string): Promise<LoginError | null> => {
    try {
      const result: LoginResult = await loginFn({ data: { staffId, pin } });

      if (!result.success) {
        if (result.error === "locked")
          return { code: "locked", remainingSec: result.remainingSec };
        if (result.error === "inactive")
          return { code: "inactive" };
        return { code: "invalid_credentials" };
      }

      await signInWithCustomToken(firebaseAuth, result.customToken);
      return null; // null = success
    } catch (err) {
      return {
        code:    "unknown",
        message: err instanceof Error ? err.message : "Login failed",
      };
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({ staff, loading, login, logout, touchActivity }),
    [staff, loading, login, logout, touchActivity],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
