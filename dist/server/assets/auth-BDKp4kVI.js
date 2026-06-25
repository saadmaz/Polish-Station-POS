import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { jsx } from "react/jsx-runtime";
//#region src/lib/auth.tsx
var DEMO_PIN = "12345";
var STAFF = [
	{
		id: "s1",
		name: "Thalal T",
		role: "Admin",
		pin: DEMO_PIN,
		color: "oklch(0.55 0.21 27)"
	},
	{
		id: "s2",
		name: "Ismail H",
		role: "Manager",
		pin: DEMO_PIN,
		color: "oklch(0.6 0.13 240)"
	},
	{
		id: "s3",
		name: "Salman Z.",
		role: "Advisor",
		pin: DEMO_PIN,
		color: "oklch(0.65 0.16 145)"
	},
	{
		id: "s4",
		name: "Mijwadh A.",
		role: "Cashier",
		pin: DEMO_PIN,
		color: "oklch(0.78 0.15 75)"
	},
	{
		id: "s5",
		name: "Saad M.",
		role: "Technician",
		pin: DEMO_PIN,
		color: "oklch(0.45 0.2 20)"
	},
	{
		id: "s6",
		name: "Abbas M.",
		role: "Technician",
		pin: DEMO_PIN,
		color: "oklch(0.5 0.18 30)"
	}
];
var AuthContext = createContext(null);
var STORAGE_KEY = "ps_active_staff_id";
function AuthProvider({ children }) {
	const [staff, setStaff] = useState(null);
	useEffect(() => {
		if (typeof window === "undefined") return;
		const id = window.localStorage.getItem(STORAGE_KEY);
		if (id) {
			const found = STAFF.find((s) => s.id === id);
			if (found) setStaff(found);
		}
	}, []);
	const value = useMemo(() => ({
		staff,
		login: (s) => {
			window.localStorage.setItem(STORAGE_KEY, s.id);
			setStaff(s);
		},
		logout: () => {
			window.localStorage.removeItem(STORAGE_KEY);
			setStaff(null);
		}
	}), [staff]);
	return /* @__PURE__ */ jsx(AuthContext.Provider, {
		value,
		children
	});
}
function useAuth() {
	const ctx = useContext(AuthContext);
	if (!ctx) throw new Error("useAuth outside provider");
	return ctx;
}
//#endregion
export { useAuth as i, DEMO_PIN as n, STAFF as r, AuthProvider as t };
