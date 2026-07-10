import { createFileRoute, Outlet, Navigate, useRouterState } from "@tanstack/react-router";
import { Loader2, ShieldOff } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import { TopBar } from "@/components/top-bar";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { MODULES, moduleForPath } from "@/lib/permissions";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function Spinner() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

function AppLayout() {
  const { staff, loading, mustChangePin, can } = useAuth();
  const { storeLoading } = useStore();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Order matters: resolve auth first and bounce logged-out visitors to the
  // login page immediately — before considering data. storeLoading only
  // gates signed-in users (listeners don't even start until login).
  if (loading) return <Spinner />;

  if (!staff) return <Navigate to="/" />;

  // A bootstrap PIN issued by an admin cannot be used to reach the app.
  if (mustChangePin) return <Navigate to="/change-pin" />;

  // Module access. This is a convenience guard, not the security boundary —
  // firestore.rules enforces the same `perms` claim on every read and write.
  const moduleKey = moduleForPath(pathname);
  if (moduleKey && !can(moduleKey)) {
    const fallback = MODULES.find((m) => can(m.key));
    return fallback ? <Navigate to={fallback.route} /> : <NoAccess />;
  }

  if (storeLoading) return <Spinner />;

  return (
    <div className="flex h-screen w-full bg-background text-foreground">
      <AppSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-auto bg-muted/30">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/** Reachable only if an administrator saved a user with zero modules. */
function NoAccess() {
  const { staff, logout } = useAuth();
  return (
    <div className="grid h-screen w-full place-items-center bg-background px-4">
      <div className="max-w-sm text-center">
        <ShieldOff className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-4 font-display text-lg font-bold">No modules assigned</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {staff?.name}, your account has no sections enabled yet. Ask an administrator to grant you
          access.
        </p>
        <button
          onClick={logout}
          className="mt-5 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
