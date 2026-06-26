import { createFileRoute } from "@tanstack/react-router";
import { STAFF } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import { Calendar } from "lucide-react";

export const Route = createFileRoute("/_app/staff")({
  head: () => ({ meta: [{ title: "Staff — Polish Station OS" }] }),
  component: StaffPage,
});

function StaffPage() {
  const { jobs, invoices } = useStore();
  const today = new Date().toISOString().slice(0, 10);

  // Real stats per tech name (join by name since staff don't have IDs in jobs yet)
  function statsFor(name: string) {
    const techJobs = jobs.filter((j) => j.tech === name && j.createdAt.startsWith(today));
    const doneJobs = techJobs.filter((j) => j.status === "Done Today");
    const techInvs = invoices.filter((i) => {
      const job = jobs.find((j) => j.id === i.jobId);
      return job?.tech === name && i.createdAt.startsWith(today);
    });
    const revenue = techInvs.reduce((s, i) => s + i.total, 0);
    const onTime = doneJobs.length > 0
      ? Math.round((doneJobs.filter((j) => j.elapsedMin <= j.estimateMin).length / doneJobs.length) * 100)
      : 100;
    return { jobsToday: techJobs.length, revenue, onTime };
  }

  const activeJobs = jobs.filter((j) => j.status === "In Bay" || j.status === "Awaiting QC");
  const activeTechs = new Set(activeJobs.map((j) => j.tech).filter(Boolean));

  return (
    <div className="p-6">
      <PageHeader
        title="Staff"
        subtitle={`${STAFF.length} team members · ${activeTechs.size} currently active`}
        actions={
          <button className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent">
            <Calendar className="h-4 w-4" /> Schedule
          </button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
        {STAFF.map((s) => {
          const stats = statsFor(s.name);
          const isActive = activeTechs.has(s.name);
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
                <StatusChip variant={isActive ? "success" : "neutral"}>
                  {isActive ? "Active" : "Idle"}
                </StatusChip>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <Stat label="Jobs Today" value={stats.jobsToday} />
                <Stat label="Revenue" value={stats.revenue > 0 ? `LKR ${Math.round(stats.revenue / 1000)}k` : "—"} />
                <Stat label="On-time" value={`${stats.onTime}%`} />
              </div>
              <div className="mt-3 flex justify-between text-[11px] text-muted-foreground border-t border-border pt-3">
                <span>PIN · <span className="font-mono">●●●●●</span></span>
                <span>Shift · 08:00 – 18:00</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Active jobs by tech */}
      {activeJobs.length > 0 && (
        <div className="rounded-xl border border-border bg-card shadow-card">
          <div className="px-5 py-3 border-b border-border">
            <h2 className="font-display text-base font-bold">Currently in Bay</h2>
          </div>
          <div className="divide-y divide-border">
            {activeJobs.map((j) => (
              <div key={j.id} className="flex items-center gap-4 px-5 py-3 text-sm">
                <span className="font-mono text-[11px] text-muted-foreground w-16">{j.id}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{j.customerName}</div>
                  <div className="text-xs text-muted-foreground">{j.serviceName} · {j.bay}</div>
                </div>
                <span className="text-muted-foreground">{j.tech}</span>
                <span className={j.elapsedMin > j.estimateMin ? "font-mono font-bold text-primary" : "font-mono text-muted-foreground"}>
                  {j.elapsedMin}m / {j.estimateMin}m
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
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
