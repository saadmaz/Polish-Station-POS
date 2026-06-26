import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Clock, CheckCircle2, PauseCircle, AlertTriangle, Maximize2, Minimize2, Car } from "lucide-react";
import type { Job } from "@/lib/db";

export const Route = createFileRoute("/_app/bay-board")({
  head: () => ({ meta: [{ title: "Bay Board — Polish Station OS" }] }),
  component: BayBoard,
});

const BAYS = ["Bay 1", "Bay 2", "Bay 3", "Bay 4", "Bay 5"];

const CAT_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  Exterior:         { bg: "bg-info/10",             border: "border-info/40",             text: "text-info"    },
  Interior:         { bg: "bg-success/10",           border: "border-success/40",           text: "text-success" },
  "Full Detail":    { bg: "bg-primary/10",           border: "border-primary/40",           text: "text-primary" },
  "Paint Protection": { bg: "bg-warning/10",         border: "border-warning/40",           text: "text-warning" },
  Coating:          { bg: "bg-muted",                border: "border-muted-foreground/30",  text: "text-foreground" },
};

const STATUS_ICON: Record<string, React.ElementType> = {
  "In Bay":      Clock,
  "Awaiting QC": CheckCircle2,
  "On Hold":     PauseCircle,
  "Ready":       CheckCircle2,
};

function liveElapsedMin(job: Job): number {
  if ((job.status === "In Bay" || job.status === "Awaiting QC") && job.startedAt) {
    return Math.floor((Date.now() - new Date(job.startedAt).getTime()) / 60_000);
  }
  return job.elapsedMin;
}

function formatElapsed(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ─── Bay card ─────────────────────────────────────────────────────────────────

function BayCard({ bay, job, tick }: { bay: string; job: Job | undefined; tick: number }) {
  if (!job) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-border bg-card flex flex-col items-center justify-center gap-3 p-6 min-h-[220px]">
        <Car className="h-10 w-10 text-muted-foreground/30" />
        <div className="text-center">
          <div className="text-lg font-bold text-foreground">{bay}</div>
          <div className="text-sm text-success font-semibold mt-1">Available</div>
        </div>
      </div>
    );
  }

  const elapsed = liveElapsedMin(job);
  // suppress ts warning about tick not being used — it's there to trigger re-render
  void tick;

  const pct = Math.min(100, job.estimateMin > 0 ? (elapsed / job.estimateMin) * 100 : 0);
  const overdue = elapsed > job.estimateMin;
  const atRisk  = !overdue && pct >= 80;

  const colors = CAT_COLORS[job.category] ?? CAT_COLORS["Exterior"];
  const StatusIcon = STATUS_ICON[job.status] ?? Clock;

  const progressColor = overdue ? "bg-primary" : atRisk ? "bg-warning" : "bg-success";
  const borderColor   = overdue ? "border-primary/60" : atRisk ? "border-warning/60" : "border-success/40";

  return (
    <div className={cn("rounded-2xl border-2 bg-card p-5 flex flex-col gap-4 min-h-[220px] transition-colors", borderColor)}>
      {/* Bay label + status */}
      <div className="flex items-center justify-between">
        <div className="text-base font-bold text-foreground">{bay}</div>
        <div className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", colors.bg, colors.text)}>
          <StatusIcon className="h-3.5 w-3.5" />
          {job.status}
        </div>
      </div>

      {/* Customer + vehicle */}
      <div className="flex-1">
        <div className="text-xl font-display font-bold leading-tight truncate">{job.customerName}</div>
        <div className="text-sm text-muted-foreground mt-0.5 truncate">
          {job.vehicleModel} · <span className="font-mono">{job.plate}</span>
        </div>
        <div className="mt-2 text-sm font-medium truncate">{job.serviceName}</div>
        <div className="text-xs text-muted-foreground mt-0.5">Tech: {job.tech}</div>
      </div>

      {/* Timer + progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className={cn("font-mono font-bold text-lg", overdue ? "text-primary" : "text-foreground")}>
            {formatElapsed(elapsed)}
          </span>
          <span className="text-muted-foreground text-xs">
            / {formatElapsed(job.estimateMin)} est.
          </span>
        </div>
        <div className="h-2.5 rounded-full bg-muted overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-1000", progressColor)}
            style={{ width: `${pct}%` }}
          />
        </div>
        {overdue && (
          <div className="flex items-center gap-1.5 text-primary text-xs font-semibold">
            <AlertTriangle className="h-3.5 w-3.5" />
            Overdue by {formatElapsed(elapsed - job.estimateMin)}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main bay board ───────────────────────────────────────────────────────────

function BayBoard() {
  const { jobs } = useStore();
  const [tick, setTick] = useState(0);
  const [time, setTime] = useState(new Date());
  const [fullscreen, setFullscreen] = useState(false);

  // Update clock + elapsed times every 30s
  useEffect(() => {
    const id = setInterval(() => {
      setTick((t) => t + 1);
      setTime(new Date());
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  // Active (non-done, non-queue) jobs assigned to a bay
  const activeJobs = jobs.filter(
    (j) => j.bay !== "—" && j.status !== "Done Today" && j.status !== "Queue",
  );

  // Queue
  const queued = jobs.filter((j) => j.status === "Queue");

  // Done today
  const doneToday = jobs.filter((j) => j.status === "Done Today");

  function bayJob(bay: string): Job | undefined {
    return activeJobs.find((j) => j.bay === bay);
  }

  const occupiedCount = BAYS.filter((b) => bayJob(b)).length;

  return (
    <div className={cn("p-6 h-full flex flex-col gap-5", fullscreen && "fixed inset-0 z-50 bg-background overflow-auto")}>
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-display font-black tracking-tight">Bay Board</h1>
          <p className="text-sm text-muted-foreground">
            {occupiedCount}/{BAYS.length} bays occupied · Live view updates every 30s
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Stats */}
          <div className="flex items-center gap-3 text-sm">
            <div className="rounded-lg border border-border bg-card px-3 py-2 text-center">
              <div className="font-bold text-lg text-primary">{activeJobs.length}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Active</div>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-2 text-center">
              <div className="font-bold text-lg text-warning">{queued.length}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Queued</div>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-2 text-center">
              <div className="font-bold text-lg text-success">{doneToday.length}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Done</div>
            </div>
          </div>

          {/* Clock */}
          <div className="rounded-lg border border-border bg-card px-4 py-2 text-right">
            <div className="font-mono text-2xl font-bold tabular-nums">
              {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {time.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}
            </div>
          </div>

          <button
            onClick={() => setFullscreen((f) => !f)}
            className="rounded-lg border border-border bg-card p-2.5 hover:bg-muted transition-colors"
            title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {fullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Bay grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 shrink-0">
        {BAYS.map((bay) => (
          <BayCard key={bay} bay={bay} job={bayJob(bay)} tick={tick} />
        ))}
      </div>

      {/* Queue & Done strips */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Queue */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Queue</h3>
            <span className="text-[11px] font-mono text-muted-foreground bg-muted rounded-full px-2 py-0.5">
              {queued.length}
            </span>
          </div>
          {queued.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-3">No vehicles waiting</div>
          ) : (
            <div className="space-y-2">
              {queued.map((j) => (
                <div key={j.id} className="flex items-center justify-between rounded-lg bg-muted/40 border border-border px-3 py-2">
                  <div>
                    <div className="text-sm font-semibold">{j.customerName}</div>
                    <div className="text-[11px] text-muted-foreground">{j.serviceName} · {j.plate}</div>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">{j.tech !== "—" ? j.tech : "Unassigned"}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Done today */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Done Today</h3>
            <span className="text-[11px] font-mono text-muted-foreground bg-muted rounded-full px-2 py-0.5">
              {doneToday.length}
            </span>
          </div>
          {doneToday.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-3">No completed jobs yet</div>
          ) : (
            <div className="space-y-2">
              {doneToday.map((j) => (
                <div key={j.id} className="flex items-center justify-between rounded-lg bg-success/5 border border-success/20 px-3 py-2">
                  <div>
                    <div className="text-sm font-semibold">{j.customerName}</div>
                    <div className="text-[11px] text-muted-foreground">{j.serviceName} · {j.plate}</div>
                  </div>
                  <div className="flex items-center gap-1.5 text-success text-xs font-semibold">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {j.completedAt
                      ? new Date(j.completedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                      : "Done"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {fullscreen && (
        <div className="shrink-0 text-center text-xs text-muted-foreground">
          Press <kbd className="rounded border border-border px-1.5 py-0.5 font-mono">Esc</kbd> or click{" "}
          <button onClick={() => setFullscreen(false)} className="underline">exit fullscreen</button>
        </div>
      )}
    </div>
  );
}
