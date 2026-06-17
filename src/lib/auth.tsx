import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type StaffRole = "Technician" | "Cashier" | "Advisor" | "Manager" | "Admin";

export interface Staff {
  id: string;
  name: string;
  role: StaffRole;
  pin: string;
  color: string;
}

export const STAFF: Staff[] = [
  { id: "s1", name: "Asha P.", role: "Admin", pin: "112233", color: "oklch(0.55 0.21 27)" },
  { id: "s2", name: "Ravi M.", role: "Manager", pin: "2580", color: "oklch(0.6 0.13 240)" },
  { id: "s3", name: "Niro D.", role: "Advisor", pin: "1234", color: "oklch(0.65 0.16 145)" },
  { id: "s4", name: "Tharu K.", role: "Cashier", pin: "4321", color: "oklch(0.78 0.15 75)" },
  { id: "s5", name: "Imran S.", role: "Technician", pin: "1111", color: "oklch(0.45 0.2 20)" },
  { id: "s6", name: "Dilshan H.", role: "Technician", pin: "2222", color: "oklch(0.5 0.18 30)" },
];

interface AuthState {
  staff: Staff | null;
  login: (s: Staff) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);
const STORAGE_KEY = "ps_active_staff_id";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [staff, setStaff] = useState<Staff | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = window.localStorage.getItem(STORAGE_KEY);
    if (id) {
      const found = STAFF.find((s) => s.id === id);
      if (found) setStaff(found);
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      staff,
      login: (s) => {
        window.localStorage.setItem(STORAGE_KEY, s.id);
        setStaff(s);
      },
      logout: () => {
        window.localStorage.removeItem(STORAGE_KEY);
        setStaff(null);
      },
    }),
    [staff],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}
