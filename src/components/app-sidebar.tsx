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
  Hammer,
  ShoppingCart,
  Bell,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { MODULES, type ModuleKey } from "@/lib/permissions";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

// Visibility comes from the user's `perms` claim, not from the role — a
// SuperAdmin grants modules per person. MODULES is the ordering and the
// source of the label and route; this map only supplies the icon.
const ICONS: Record<ModuleKey, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  bookings: Calendar,
  jobs: Wrench,
  "bay-board": MonitorPlay,
  customers: Users,
  inventory: Boxes,
  equipment: Hammer,
  "purchase-orders": ShoppingCart,
  notifications: Bell,
  pos: CreditCard,
  staff: UserCog,
  reports: BarChart3,
  settings: Settings,
};

/** The module nav list, shared by the desktop sidebar and the mobile sheet. */
function NavLinks({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { can } = useAuth();
  const { customersNeedingReminder, jobsNeedingReview } = useStore();

  const notificationCount = customersNeedingReminder.length + jobsNeedingReview.length;

  const visibleNav = MODULES.filter((m) => can(m.key)).map((m) => ({
    to: m.route,
    label: m.label,
    icon: ICONS[m.key],
  }));

  return (
    <nav aria-label="Main navigation" className="flex-1 space-y-0.5 px-2 pt-2">
      {visibleNav.map(({ to, label, icon: Icon }) => {
        const active = pathname.startsWith(to);
        const isNotifications = to === "/notifications";
        const badge = isNotifications && notificationCount > 0 ? notificationCount : null;
        return (
          <Link
            key={to}
            to={to}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
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
            <div className="relative shrink-0">
              <Icon className="h-5 w-5" />
              {badge !== null && collapsed && (
                <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-[8px] font-bold text-white">
                  {badge > 9 ? "9+" : badge}
                </span>
              )}
            </div>
            {!collapsed && (
              <>
                <span className="truncate flex-1">{label}</span>
                {badge !== null && (
                  <span className="ml-auto rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {badge}
                  </span>
                )}
              </>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function UserRow({
  collapsed = false,
  onAfterLock,
}: {
  collapsed?: boolean;
  onAfterLock?: () => void;
}) {
  const { staff, logout } = useAuth();
  const navigate = useNavigate();
  if (!staff) return null;
  return (
    <div className={cn("flex items-center gap-2 rounded-md p-2", collapsed && "justify-center")}>
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
            onAfterLock?.();
          }}
          className="rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <Lock className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/** Desktop sidebar. Hidden on phones — the TopBar hamburger opens
 *  MobileNavSheet instead, because a fixed 224px rail on a 375px screen
 *  leaves the actual app ~150px wide. */
export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "hidden md:flex h-screen flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200",
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

      <NavLinks collapsed={collapsed} />

      <div className="mt-auto border-t border-sidebar-border p-2">
        <UserRow collapsed={collapsed} />
        <button
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
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

/** Phone navigation: the same module list in a left-side sheet, opened from
 *  the TopBar hamburger. */
export function MobileNavSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-72 bg-sidebar text-sidebar-foreground border-sidebar-border p-0 flex flex-col"
      >
        <SheetHeader className="px-4 pt-5 pb-2">
          <SheetTitle className="flex items-center gap-2 text-sidebar-foreground">
            <span className="grid h-9 w-9 place-items-center rounded-md gradient-brand shadow-red font-display text-base font-black text-primary-foreground">
              PS
            </span>
            <span className="text-sm font-bold">STATION OS</span>
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto pb-2">
          <NavLinks onNavigate={() => onOpenChange(false)} />
        </div>
        <div className="mt-auto border-t border-sidebar-border p-2">
          <UserRow onAfterLock={() => onOpenChange(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
