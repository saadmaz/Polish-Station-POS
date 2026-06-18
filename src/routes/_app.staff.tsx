import { createFileRoute } from "@tanstack/react-router";
import { STAFF } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import { Plus, Calendar } from "lucide-react";

export const Route = createFileRoute("/_app/staff")({
  head: () => ({ meta: [{ title: "Staff — Polish Station OS" }] }),
  component: StaffPage,
});

function StaffPage() {
  return (
    <div className="p-6">
      <PageHeader
        title="Staff"
        subtitle={`${STAFF.length} team members · 4 on shift today`}
        actions={
          <>
            <button className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent">
              <Calendar className="h-4 w-4" /> Schedule
            </button>
            <button className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-red hover:bg-primary/90">
              <Plus className="h-4 w-4" /> Add Staff
            </button>
          </>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
        {STAFF.map((s, idx) => {
          // deterministic per-staff stats (no Math.random — avoids hydration mismatch)
          const jobs = [5, 3, 0, 0, 6, 4][idx] ?? 0;
          const rev = [42, 88, 12, 0, 64, 51][idx] ?? 0;
          const onTime = [96, 92, 100, 88, 89, 94][idx] ?? 90;
          return (
            <div key={s.id} className="rounded-xl border border-border bg-card p-4 shadow-card hover:shadow-elevated transition-shadow">
              <div className="flex items-center gap-3">
                <div
                  className="grid h-12 w-12 place-items-center rounded-full font-bold text-primary-foreground"
                  style={{ background: s.color }}
                >
                  {s.name.split(" ").map((p) => p[0]).join("")}
                </div>
                <div className="flex-1">
                  <div className="font-display font-bold">{s.name}</div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider">{s.role}</div>
                </div>
                <StatusChip variant="success">Active</StatusChip>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <Stat label="Jobs Today" value={jobs} />
                <Stat label="Revenue" value={`LKR ${rev}k`} />
                <Stat label="On-time" value={`${onTime}%`} />
              </div>
              <div className="mt-3 flex justify-between text-[11px] text-muted-foreground border-t border-border pt-3">
                <span>PIN · <span className="font-mono">●●●●●</span></span>
                <span>Shift · 08:00 – 18:00</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md bg-muted/40 py-2">
      <div className="font-display text-base font-bold">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}
