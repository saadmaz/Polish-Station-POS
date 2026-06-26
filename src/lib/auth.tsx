import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type StaffRole = "Technician" | "Cashier" | "Advisor" | "Manager" | "Admin";

export interface Staff {
  id: string;
  name: string;
  role: StaffRole;
  password: string;
  color: string;
}

export const STAFF: Staff[] = [
  { id: "s1", name: "Thalal T", role: "Admin", password: "admin@ps", color: "oklch(0.55 0.21 27)" },
  { id: "s2", name: "Ismail H", role: "Manager", password: "mgr@ps", color: "oklch(0.6 0.13 240)" },
  { id: "s3", name: "Salman Z.", role: "Advisor", password: "advisor@ps", color: "oklch(0.65 0.16 145)" },
  { id: "s4", name: "Mijwadh A.", role: "Cashier", password: "cashier@ps", color: "oklch(0.78 0.15 75)" },
  { id: "s5", name: "Saad M.", role: "Technician", password: "tech@ps", color: "oklch(0.45 0.2 20)" },
  { id: "s6", name: "Abbas M.", role: "Technician", password: "tech@ps", color: "oklch(0.5 0.18 30)" },
];

const SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const ACTIVITY_KEY = "ps_last_activity";

interface AuthState {
  staff: Staff | null;
  login: (s: Staff) => void;
  logout: () => void;
  touchActivity: () => void;
}

const AuthContext = createContext<AuthState | null>(null);
const STORAGE_KEY = "ps_active_staff_id";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [staff, setStaff] = useState<Staff | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const logout = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(ACTIVITY_KEY);
    setStaff(null);
  }, []);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(logout, SESSION_TIMEOUT_MS);
    window.localStorage.setItem(ACTIVITY_KEY, Date.now().toString());
  }, [logout]);

  const touchActivity = useCallback(() => resetTimer(), [resetTimer]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = window.localStorage.getItem(STORAGE_KEY);
    if (id) {
      const found = STAFF.find((s) => s.id === id);
      if (found) {
        // Check if session already expired
        const last = Number(window.localStorage.getItem(ACTIVITY_KEY) ?? "0");
        if (Date.now() - last < SESSION_TIMEOUT_MS) {
          setStaff(found);
          resetTimer();
        } else {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      }
    }
    // Track user activity globally
    const events = ["mousedown", "keydown", "touchstart", "scroll"];
    const handler = () => { if (window.localStorage.getItem(STORAGE_KEY)) resetTimer(); };
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    return () => {
      events.forEach((e) => window.removeEventListener(e, handler));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [resetTimer]);

  const value = useMemo<AuthState>(
    () => ({
      staff,
      login: (s) => {
        window.localStorage.setItem(STORAGE_KEY, s.id);
        setStaff(s);
        resetTimer();
      },
      logout,
      touchActivity,
    }),
    [staff, logout, resetTimer, touchActivity],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}
