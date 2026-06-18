import { createFileRoute } from "@tanstack/react-router";
import { TrendingUp, TrendingDown, RefreshCw, AlertTriangle } from "lucide-react";
import { JOBS, BOOKINGS, INVENTORY } from "@/lib/mock-data";
import { StatusChip, statusVariant } from "@/components/status-chip";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Polish Station OS" }] }),
  component: Dashboard,
});

const KPIS = [
  { label: "Revenue Today", value: "LKR 184,200", delta: 12.4, up: true },
  { label: "Jobs Completed", value: "14", delta: 6, up: true },
  { label: "In Progress", value: "5", delta: -1, up: false },
  { label: "Upcoming (4h)", value: "8", delta: 3, up: true },
  { label: "Avg Duration", value: "1h 42m", delta: -8.2, up: true },
  { label: "Outstanding", value: "LKR 26,500", delta: 2, up: false },
];

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
  return (
    <div className="p-6">
      <PageHeader
        title="Operations Dashboard"
        subtitle="Live snapshot · auto-refreshing every 30s"
        actions={
          <button className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
        {KPIS.map((k) => (
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
                {Math.abs(k.delta)}%
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
            <span className="text-xs text-muted-foreground">{JOBS.length} active</span>
          </div>
          <div className="divide-y divide-border">
            {JOBS.slice(0, 6).map((j) => {
              const overdue = j.elapsedMin > j.estimateMin;
              return (
                <div key={j.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40">
                  <span className="font-mono text-[11px] text-muted-foreground w-14">{j.id}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{j.customer}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {j.vehicle} · {j.service}
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
            })}
          </div>
        </div>

        {/* Right column */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl border border-border bg-card shadow-card">
            <div className="px-5 py-3 border-b border-border">
              <h2 className="font-display text-base font-bold">Today's Timeline</h2>
            </div>
            <div className="p-4 space-y-1.5 max-h-[260px] overflow-auto">
              {BOOKINGS.map((b) => (
                <div key={b.id} className="flex items-center gap-3">
                  <span className="font-mono text-xs w-12 text-muted-foreground">{b.time}</span>
                  <div className="flex-1 rounded-md border border-border px-2.5 py-1.5 bg-background">
                    <div className="text-xs font-semibold truncate">{b.customer}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{b.service}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card shadow-card">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
              <AlertTriangle className="h-4 w-4 text-primary" />
              <h2 className="font-display text-base font-bold">Inventory Alerts</h2>
            </div>
            <div className="divide-y divide-border">
              {INVENTORY.filter((i) => i.stock <= i.reorder).map((i) => (
                <div key={i.id} className="flex items-center justify-between px-5 py-2.5">
                  <div>
                    <div className="text-sm font-medium">{i.name}</div>
                    <div className="text-[11px] text-muted-foreground font-mono">{i.sku}</div>
                  </div>
                  <StatusChip variant={i.stock === 0 ? "danger" : "warning"}>
                    {i.stock === 0 ? "Out" : `${i.stock} ${i.unit}`}
                  </StatusChip>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
