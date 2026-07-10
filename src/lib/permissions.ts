// Single source of truth for roles and module access.
//
// Two orthogonal concepts:
//   • Role        — what you may DO (create / update / delete). A hierarchy for
//                   Manager < Admin < SuperAdmin; Cashier and Advisor are peers.
//   • Permissions — which modules you may SEE. An explicit per-user list that a
//                   SuperAdmin edits. Roles only supply the default list.
//
// Both are carried in the Firebase custom-token claims, so firestore.rules and
// the UI read the same values. This file is imported by client, server and
// seed scripts — keep it free of any firebase/react imports.

export type StaffRole = "Technician" | "Cashier" | "Advisor" | "Manager" | "Admin" | "SuperAdmin";

export const STAFF_ROLES: StaffRole[] = [
  "Technician",
  "Cashier",
  "Advisor",
  "Manager",
  "Admin",
  "SuperAdmin",
];

// Cashier and Advisor deliberately share a rank: neither is a superset of the
// other, so seniority comparisons between them are meaningless (and are never
// made — only Admin+ can manage staff).
const ROLE_RANK: Record<StaffRole, number> = {
  Technician: 1,
  Cashier: 2,
  Advisor: 2,
  Manager: 3,
  Admin: 4,
  SuperAdmin: 5,
};

export const rank = (r: StaffRole) => ROLE_RANK[r];
export const isSuperAdmin = (r?: StaffRole | null) => r === "SuperAdmin";
export const isAdmin = (r?: StaffRole | null) => r === "Admin" || isSuperAdmin(r);
export const isManagerOrAbove = (r?: StaffRole | null) => r === "Manager" || isAdmin(r);

/** True when `actor` may act on a staff member holding `target`'s role. */
export function outranks(actor: StaffRole, target: StaffRole): boolean {
  return rank(actor) > rank(target);
}

// ── Modules ───────────────────────────────────────────────────────────────────

export const MODULES = [
  { key: "dashboard", label: "Dashboard", route: "/dashboard" },
  { key: "bookings", label: "Bookings", route: "/bookings" },
  { key: "jobs", label: "Active Jobs", route: "/jobs" },
  { key: "bay-board", label: "Bay Board", route: "/bay-board" },
  { key: "customers", label: "Customers", route: "/customers" },
  { key: "inventory", label: "Inventory", route: "/inventory" },
  { key: "equipment", label: "Equipment", route: "/equipment" },
  { key: "purchase-orders", label: "Purchase Orders", route: "/purchase-orders" },
  { key: "notifications", label: "Notifications", route: "/notifications" },
  { key: "pos", label: "POS / Checkout", route: "/pos" },
  { key: "staff", label: "Staff", route: "/staff" },
  { key: "reports", label: "Reports", route: "/reports" },
  { key: "settings", label: "Settings", route: "/settings" },
] as const;

export type ModuleKey = (typeof MODULES)[number]["key"];

export const ALL_MODULES: ModuleKey[] = MODULES.map((m) => m.key);

const MODULE_KEYS = new Set<string>(ALL_MODULES);

export const isModuleKey = (v: unknown): v is ModuleKey =>
  typeof v === "string" && MODULE_KEYS.has(v);

/** Starting permission set when a SuperAdmin creates a user with this role. */
export const ROLE_DEFAULT_PERMISSIONS: Record<StaffRole, ModuleKey[]> = {
  Technician: ["dashboard", "jobs", "bay-board"],
  Cashier: ["dashboard", "jobs", "bay-board", "bookings", "customers", "pos"],
  Advisor: [
    "dashboard",
    "jobs",
    "bay-board",
    "bookings",
    "customers",
    "pos",
    "inventory",
    "equipment",
    "notifications",
  ],
  Manager: ALL_MODULES.filter((m) => m !== "settings"),
  Admin: [...ALL_MODULES],
  SuperAdmin: [...ALL_MODULES],
};

/**
 * A SuperAdmin always holds every module — the permission list is not consulted.
 * Without this, revoking `settings` from the last SuperAdmin would lock the
 * whole business out of user management with no way back in.
 */
export function hasModule(
  role: StaffRole | null | undefined,
  permissions: readonly string[] | null | undefined,
  moduleKey: ModuleKey,
): boolean {
  if (!role) return false;
  if (isSuperAdmin(role)) return true;
  return !!permissions?.includes(moduleKey);
}

/** Which module (if any) a pathname belongs to. Longest route wins so that
 *  `/purchase-orders` is never matched by a shorter sibling prefix. */
export function moduleForPath(pathname: string): ModuleKey | null {
  let best: ModuleKey | null = null;
  let bestLen = 0;
  for (const m of MODULES) {
    if ((pathname === m.route || pathname.startsWith(m.route + "/")) && m.route.length > bestLen) {
      best = m.key;
      bestLen = m.route.length;
    }
  }
  return best;
}

/** Drop unknown keys and de-duplicate. Used on every write and read of a
 *  permission list, since claims and Firestore docs are both untrusted shapes. */
export function sanitizePermissions(input: unknown): ModuleKey[] {
  if (!Array.isArray(input)) return [];
  return ALL_MODULES.filter((k) => input.includes(k));
}
