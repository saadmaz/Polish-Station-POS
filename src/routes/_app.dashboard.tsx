import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { TrendingUp, TrendingDown, RefreshCw, AlertTriangle, Activity } from "lucide-react";
import { useStore } from "@/lib/store";
import { StatusChip, statusVariant } from "@/components/status-chip";
import { PageHeader } from "@/components/page-header";
import { ShiftModal } from "@/components/shift-modal";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Polish Station OS" }] }),
  component: Dashboard,
});

function Sparkline({ up }: { up: boolean }) {
  const pts = up
    ? "0,18 10,14 20,16 30,10 40,12 50,6 60,8 70,3"
    : "0,4 10,8 20,6 30,12 40,10 50,15 60,13 70,18";
  return (
    <svg viewBox="0 0 70 22" className="h-6 w-20">
      <polyline
        points={pts}
        fill="none"
        stroke={up ? "var(--success)" : "var(--primary)"}
        strokeWidth="1.5"
      />
    </svg>
  );
}

function Dashboard() {
  const {
    jobs,
    bookings,
    invoices,
    openShift,
    todayRevenue,
    todayJobs,
    lowStockItems,
    refreshAll,
  } = useStore();
  const [shiftOpen, setShiftOpen] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const todayBookings = bookings.filter((b) => b.date === today);

  const inProgress = jobs.filter(
    (j) => j.status === "In Bay" || j.status === "Awaiting QC" || j.status === "On Hold",
  ).length;
  const upcoming4h = todayBookings.filter(
    (b) => b.status === "Confirmed" || b.status === "Pending",
  ).length;

  const completedJobs = jobs.filter((j) => j.status === "Done Today");
  const avgDurationMin =
    completedJobs.length > 0
      ? Math.round(completedJobs.reduce((s, j) => s + j.elapsedMin, 0) / completedJobs.length)
      : 0;

  const outstanding = invoices
    .filter((i) => i.status === "Issued" || i.status === "Partially Paid")
    .reduce((s, i) => s + i.total, 0);

  const kpis = [
    {
      label: "Revenue Today",
      value: `LKR ${todayRevenue.toLocaleString()}`,
      delta: todayRevenue > 0 ? 12.4 : 0,
      up: true,
    },
    { label: "Jobs Completed", value: String(todayJobs), delta: todayJobs, up: true },
    { label: "In Progress", value: String(inProgress), delta: inProgress, up: false },
    { label: "Upcoming (today)", value: String(upcoming4h), delta: upcoming4h, up: true },
    {
      label: "Avg Duration",
      value:
        avgDurationMin > 0 ? `${Math.floor(avgDurationMin / 60)}h ${avgDurationMin % 60}m` : "—",
      delta: 0,
      up: true,
    },
    {
      label: "Outstanding",
      value: `LKR ${outstanding.toLocaleString()}`,
      delta: outstanding > 0 ? 2 : 0,
      up: false,
    },
  ];

  const activeJobs = jobs.filter((j) => j.status !== "Done Today").slice(0, 6);

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
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-border bg-card p-4 shadow-card">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
              {k.label}
            </div>
            <div className="mt-1.5 font-display text-xl font-bold">{k.value}</div>
            <div className="mt-2 flex items-center justify-between">
              <div
                className={cn(
                  "flex items-center gap-1 text-xs font-semibold",
                  k.up ? "text-success" : "text-primary",
                )}
              >
                {k.up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {k.delta > 0 ? `${k.delta}` : "—"}
              </div>
              <Sparkline up={k.up} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Live Job Board */}
        <div className="lg:col-span-3 rounded-xl border border-border bg-card shadow-card">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
            <h2 className="font-display text-base font-bold">Live Job Board</h2>
            <span className="text-xs text-muted-foreground">{jobs.length} jobs</span>
          </div>
          <div className="divide-y divide-border">
            {activeJobs.length > 0 ? (
              activeJobs.map((j) => {
                const overdue = j.elapsedMin > j.estimateMin;
                return (
                  <div key={j.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40">
                    <span className="font-mono text-[11px] text-muted-foreground w-14">{j.id}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{j.customerName}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {j.vehicleModel || j.plate} · {j.serviceName}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground hidden md:block">{j.tech}</div>
                    <div className="text-xs text-muted-foreground w-14 text-right hidden sm:block">
                      {j.bay}
                    </div>
                    <div
                      className={cn(
                        "font-mono text-xs w-14 text-right",
                        overdue ? "text-primary font-bold" : "text-muted-foreground",
                      )}
                    >
                      {j.elapsedMin}m
                    </div>
                    <StatusChip variant={statusVariant(j.status)}>{j.status}</StatusChip>
                  </div>
                );
              })
            ) : (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                No active jobs · use Walk-In or Bookings to add
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Today's bookings timeline */}
          <div className="rounded-xl border border-border bg-card shadow-card">
            <div className="px-5 py-3 border-b border-border">
              <h2 className="font-display text-base font-bold">Today's Timeline</h2>
            </div>
            <div className="p-4 space-y-1.5 max-h-65 overflow-auto">
              {todayBookings.length > 0 ? (
                todayBookings
                  .sort((a, b) => a.time.localeCompare(b.time))
                  .map((b) => (
                    <div key={b.id} className="flex items-center gap-3">
                      <span className="font-mono text-xs w-12 text-muted-foreground shrink-0">
                        {b.time}
                      </span>
                      <div className="flex-1 rounded-md border border-border px-2.5 py-1.5 bg-background">
                        <div className="text-xs font-semibold truncate">{b.customerName}</div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {b.serviceName}
                        </div>
                      </div>
                      <StatusChip variant={statusVariant(b.status)}>{b.status}</StatusChip>
                    </div>
                  ))
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No bookings for today
                </p>
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
      </div>

      <ShiftModal open={shiftOpen} onOpenChange={setShiftOpen} />
    </div>
  );
}
