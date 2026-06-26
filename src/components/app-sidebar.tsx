import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Calendar,
  Wrench,
  Users,
  Boxes,
  CreditCard,
  UserCog,
  BarChart3,
  Settings,
  Lock,
  ChevronsLeft,
  ChevronsRight,
  MonitorPlay,
} from "lucide-react";
import { useState } from "react";
import { useAuth, type StaffRole } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: StaffRole[]; // empty = all roles
}

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard",    icon: LayoutDashboard, roles: [] },
  { to: "/bookings",  label: "Bookings",     icon: Calendar,        roles: [] },
  { to: "/jobs",      label: "Active Jobs",  icon: Wrench,          roles: [] },
  { to: "/bay-board", label: "Bay Board",    icon: MonitorPlay,     roles: [] },
  { to: "/customers", label: "Customers",    icon: Users,           roles: [] },
  { to: "/inventory", label: "Inventory",    icon: Boxes,           roles: ["Admin", "Manager", "Advisor"] },
  { to: "/pos",       label: "POS / Checkout", icon: CreditCard,   roles: ["Admin", "Manager", "Cashier", "Advisor"] },
  { to: "/staff",     label: "Staff",        icon: UserCog,         roles: ["Admin", "Manager"] },
  { to: "/reports",   label: "Reports",      icon: BarChart3,       roles: ["Admin", "Manager"] },
  { to: "/settings",  label: "Settings",     icon: Settings,        roles: ["Admin"] },
];

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { staff, logout } = useAuth();
  const navigate = useNavigate();

  const role = staff?.role;

  const visibleNav = NAV.filter(
    (item) => item.roles.length === 0 || (role && item.roles.includes(role)),
  );

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200",
        collapsed ? "w-16" : "w-56",
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-5">
        <div className="grid h-9 w-9 place-items-center rounded-md gradient-brand shadow-red">
          <span className="font-display text-base font-black text-primary-foreground">PS</span>
        </div>
        {!collapsed && (
          <div className="leading-tight">
            <div className="text-xs font-semibold tracking-[0.18em] text-sidebar-foreground/70">
              POLISH
            </div>
            <div className="-mt-0.5 text-sm font-bold text-sidebar-foreground">STATION OS</div>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 px-2 pt-2">
        {visibleNav.map(({ to, label, icon: Icon }) => {
          const active = pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-foreground"
                  : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )}
            >
              {active && (
                <span className="absolute inset-y-1 left-0 w-1 rounded-r bg-sidebar-primary" />
              )}
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-sidebar-border p-2">
        {staff && (
          <div
            className={cn("flex items-center gap-2 rounded-md p-2", collapsed && "justify-center")}
          >
            <div
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-semibold text-primary-foreground"
              style={{ background: staff.color }}
            >
              {staff.name
                .split(" ")
                .map((p) => p[0])
                .join("")}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-sm font-semibold">{staff.name}</div>
                <div className="text-[11px] uppercase tracking-wider text-sidebar-foreground/60">
                  {staff.role}
                </div>
              </div>
            )}
            {!collapsed && (
              <button
                aria-label="Lock"
                onClick={() => {
                  logout();
                  navigate({ to: "/" });
                }}
                className="rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              >
                <Lock className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="mt-1 flex w-full items-center justify-center gap-2 rounded-md py-2 text-xs text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          {collapsed ? (
            <ChevronsRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronsLeft className="h-4 w-4" /> Collapse
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
