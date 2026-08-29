import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { RefreshCw, AlertTriangle, Activity } from "lucide-react";
import { useStore } from "@/lib/store";
import { computeDashboardMetrics } from "@/lib/dashboard-metrics";
import { StatusChip, statusVariant } from "@/components/status-chip";
import { PageHeader } from "@/components/page-header";
import { ShiftModal } from "@/components/shift-modal";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard · Polish Station OS" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { invoices, jobs, listenerErrors, openShift, lowStockItems, refreshAll } = useStore();
  const [shiftOpen, setShiftOpen] = useState(false);

  // The one computation every KPI card and the timeline both read from —
  // see src/lib/dashboard-metrics.ts for why this replaced four separate
  // ad-hoc "today" filters that used to drift out of sync with each other.
  // Reads Job, not Booking: Job is the work record now (see job.ts).
  const metrics = computeDashboardMetrics(invoices, jobs);
  const todayJobs = metrics.timelineJobs;

  // Revenue Today and Outstanding are derived from `invoices`, not `jobs` —
  // a failed jobs listener doesn't touch them. Only the timeline and
  // Upcoming (today) read jobs, so only those two get a degraded state
  // instead of a confident (and here, false) zero (audit finding D1).
  const jobsErrored = listenerErrors.has("jobs");

  const kpis: { label: string; value: string; degraded: boolean }[] = [
    {
      label: "Revenue Today",
      value: `LKR ${metrics.revenueToday.toLocaleString()}`,
      degraded: false,
    },
    {
      label: "Upcoming (today)",
      value: jobsErrored ? "—" : String(metrics.upcomingToday),
      degraded: jobsErrored,
    },
    {
      label: "Outstanding",
      value: `LKR ${metrics.outstanding.toLocaleString()}`,
      degraded: false,
    },
  ];

  return (
    <div className="p-6">
      <PageHeader
        title="Operations Dashboard"
        subtitle="Live snapshot"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShiftOpen(true)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors",
                openShift
                  ? "border-success/40 bg-success/10 text-success hover:bg-success/20"
                  : "border-border bg-muted text-muted-foreground hover:bg-muted/70",
              )}
            >
              <Activity className="h-3.5 w-3.5" />
              {openShift ? `Shift · ${openShift.staffName.split(" ")[0]}` : "Open Shift"}
            </button>
            <button
              onClick={refreshAll}
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
          </div>
        }
      />

      {/* KPIs */}
      {/* No trend delta or sparkline here: neither has a real day-over-day
          series behind it yet (see audit finding on fabricated deltas). Add
          one back only once there's an actual prior-period comparison to
          plot — a fixed/fake number is worse than no number. */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-border bg-card p-4 shadow-card">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
              {k.label}
            </div>
            <div
              className={cn("mt-1.5 font-display text-xl font-bold", k.degraded && "text-warning")}
              title={k.degraded ? "Couldn't load today's jobs" : undefined}
            >
              {k.value}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Today's job timeline */}
        <div className="rounded-xl border border-border bg-card shadow-card">
          <div className="px-5 py-3 border-b border-border">
            <h2 className="font-display text-base font-bold">Today's Timeline</h2>
          </div>
          <div className="p-4 space-y-1.5 max-h-65 overflow-auto">
            {jobsErrored ? (
              <p className="text-xs text-warning text-center py-4">
                Couldn't load today's jobs — this isn't an empty day, the data couldn't be read
              </p>
            ) : todayJobs.length > 0 ? (
              todayJobs
                .sort((a, b) => a.time.localeCompare(b.time))
                .map((j) => (
                  <div key={j.id} className="flex items-center gap-3">
                    <span className="font-mono text-xs w-12 text-muted-foreground shrink-0">
                      {j.time}
                    </span>
                    <div className="flex-1 rounded-md border border-border px-2.5 py-1.5 bg-background">
                      <div className="text-xs font-semibold truncate">{j.customerName}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {j.serviceName}
                      </div>
                    </div>
                    <StatusChip variant={statusVariant(j.status)}>{j.status}</StatusChip>
                  </div>
                ))
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">No jobs for today</p>
            )}
          </div>
        </div>

        {/* Inventory alerts */}
        <div className="rounded-xl border border-border bg-card shadow-card">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
            <AlertTriangle className="h-4 w-4 text-primary" />
            <h2 className="font-display text-base font-bold">Inventory Alerts</h2>
          </div>
          <div className="divide-y divide-border">
            {lowStockItems.length > 0 ? (
              lowStockItems.map((i) => (
                <div key={i.id} className="flex items-center justify-between px-5 py-2.5">
                  <div>
                    <div className="text-sm font-medium">{i.name}</div>
                    <div className="text-[11px] text-muted-foreground font-mono">{i.sku}</div>
                  </div>
                  <StatusChip variant={i.stock === 0 ? "danger" : "warning"}>
                    {i.stock === 0 ? "Out" : `${i.stock} ${i.unit}`}
                  </StatusChip>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">All items in stock</p>
            )}
          </div>
        </div>

        {/* Shift summary */}
        {openShift && (
          <div className="rounded-xl border border-success/30 bg-success/5 shadow-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="h-4 w-4 text-success" />
              <h2 className="font-display text-base font-bold text-success">Active Shift</h2>
            </div>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Staff</span>
                <span className="font-semibold">{openShift.staffName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Opened</span>
                <span className="font-mono">
                  {new Date(openShift.openedAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cash Sales</span>
                <span className="font-mono font-semibold">
                  LKR {openShift.cashSales.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Card Sales</span>
                <span className="font-mono font-semibold">
                  LKR {openShift.cardSales.toLocaleString()}
                </span>
              </div>
            </div>
            <button
              onClick={() => setShiftOpen(true)}
              className="mt-3 w-full text-center text-xs text-success hover:underline"
            >
              Manage shift →
            </button>
          </div>
        )}
      </div>

      <ShiftModal open={shiftOpen} onOpenChange={setShiftOpen} />
    </div>
  );
}
