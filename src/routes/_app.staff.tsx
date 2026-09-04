import { createFileRoute, Link } from "@tanstack/react-router";
import { useStaffList } from "@/lib/use-staff-list";
import { useAuth } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { Settings2 } from "lucide-react";

export const Route = createFileRoute("/_app/staff")({
  head: () => ({ meta: [{ title: "Staff · Polish Station OS" }] }),
  component: StaffPage,
});

function StaffPage() {
  const { staffList } = useStaffList();
  const { staff } = useAuth();

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="Staff"
        subtitle={`${staffList.length} team members`}
        actions={
          // This page is read-only (the roster); create/edit/deactivate
          // lives at Settings → Staff & Access. Surfacing that here is the
          // fix for audit finding S3 -- there was previously no path from
          // one to the other at all.
          isAdmin(staff?.role) && (
            <Link
              to="/settings"
              search={{ tab: "access" }}
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent"
            >
              <Settings2 className="h-4 w-4" /> Manage Staff & Access
            </Link>
          )
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {staffList.map((s) => (
          <div
            key={s.id}
            className="rounded-xl border border-border bg-card p-4 shadow-card hover:shadow-elevated transition-shadow"
          >
            <div className="flex items-center gap-3">
              <div
                className="grid h-12 w-12 place-items-center rounded-full font-bold text-primary-foreground"
                style={{ background: s.color }}
              >
                {s.name
                  .split(" ")
                  .map((p) => p[0])
                  .join("")}
              </div>
              <div className="flex-1">
                <div className="font-display font-bold">{s.name}</div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider">
                  {s.role}
                </div>
              </div>
            </div>
            <div className="mt-3 text-[11px] text-muted-foreground border-t border-border pt-3">
              <span>
                User · <span className="font-mono">{s.username || "—"}</span>
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
