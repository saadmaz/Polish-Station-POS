import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { Clock, ChevronRight, X, Check, ArrowRight, Trash2, Plus } from "lucide-react";
import type { Job, JobStatus } from "@/lib/db";

export const Route = createFileRoute("/_app/jobs")({
  head: () => ({ meta: [{ title: "Active Jobs — Polish Station OS" }] }),
  component: ActiveJobs,
});

const COLUMNS: { status: JobStatus; tone: string; nextStatus?: JobStatus; nextLabel?: string }[] = [
  { status: "Queue",        tone: "border-info",             nextStatus: "In Bay",      nextLabel: "Start" },
  { status: "In Bay",       tone: "border-primary",          nextStatus: "Awaiting QC", nextLabel: "Send to QC" },
  { status: "On Hold",      tone: "border-warning",          nextStatus: "In Bay",      nextLabel: "Resume" },
  { status: "Awaiting QC",  tone: "border-warning",          nextStatus: "Ready",       nextLabel: "Approve" },
  { status: "Ready",        tone: "border-success",          nextStatus: "Done Today",  nextLabel: "Mark Done" },
  { status: "Done Today",   tone: "border-muted-foreground" },
];

const CAT_COLORS: Record<string, string> = {
  Exterior: "var(--info)",
  Interior: "var(--success)",
  "Full Detail": "var(--primary)",
  "Paint Protection": "var(--warning)",
  Coating: "var(--charcoal)",
};

const BAYS = ["—", "Bay 1", "Bay 2", "Bay 3", "Bay 4", "Bay 5"];

// ─── Job detail side panel ────────────────────────────────────────────────────

function JobDetail({ job, onClose }: { job: Job; onClose: () => void }) {
  const { moveJob, deleteJob, openShift } = useStore();
  const [tech, setTech] = useState(job.tech);
  const [bay, setBay] = useState(job.bay);

  const col = COLUMNS.find((c) => c.status === job.status);
  const overdue = job.elapsedMin > job.estimateMin;

  function advance() {
    if (!col?.nextStatus) return;
    moveJob(job.id, col.nextStatus, tech, bay);
    toast.success(`${job.customerName} → ${col.nextStatus}`);
  }

  function hold() {
    moveJob(job.id, "On Hold", tech, bay);
    toast.info(`Job on hold: ${job.customerName}`);
  }

  function remove() {
    if (!confirm(`Delete job ${job.id}? This cannot be undone.`)) return;
    deleteJob(job.id);
    toast.error("Job deleted");
    onClose();
  }

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-sm bg-background border-l border-border shadow-elevated overflow-y-auto flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <div className="font-mono text-xs text-muted-foreground">{job.id}</div>
          <h2 className="font-display text-base font-bold">{job.customerName}</h2>
        </div>
        <button onClick={onClose} className="rounded-md p-1.5 hover:bg-muted">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 p-5 space-y-5">
        {/* Vehicle */}
        <div className="rounded-lg bg-muted/40 border border-border p-3 space-y-1">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Vehicle</div>
          <div className="font-semibold">{job.vehicleModel || "—"}</div>
          <div className="font-mono text-sm">{job.plate}</div>
          {job.vehicleColor && <div className="text-sm text-muted-foreground">{job.vehicleColor}</div>}
        </div>

        {/* Service */}
        <div className="rounded-lg bg-muted/40 border border-border p-3 space-y-1">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Service</div>
          <div className="font-semibold">{job.serviceName}</div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{job.category}</span>
            <span className="font-mono font-bold">LKR {job.price.toLocaleString()}</span>
          </div>
          <div className={cn("text-sm font-mono", overdue ? "text-primary font-bold" : "text-muted-foreground")}>
            {job.elapsedMin}m elapsed / {job.estimateMin}m est.
            {overdue && " ⚠ OVERDUE"}
          </div>
        </div>

        {/* Assign tech + bay */}
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">Technician</label>
            <input
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={tech}
              onChange={(e) => setTech(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Bay</label>
            <select
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={bay}
              onChange={(e) => setBay(e.target.value)}
            >
              {BAYS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
        </div>

        {job.notes && (
          <div className="rounded-lg bg-muted/40 border border-border p-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Notes</div>
            <p className="text-sm">{job.notes}</p>
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          Created: {new Date(job.createdAt).toLocaleString()}
          {job.startedAt && <div>Started: {new Date(job.startedAt).toLocaleString()}</div>}
          {job.completedAt && <div>Completed: {new Date(job.completedAt).toLocaleString()}</div>}
          {!openShift && <div className="text-warning mt-1">No active shift — job won't be linked to revenue</div>}
        </div>
      </div>

      <div className="p-5 border-t border-border space-y-2">
        {col?.nextStatus && (
          <button
            onClick={advance}
            className="w-full flex items-center justify-center gap-2 rounded-md bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-red hover:bg-primary/90"
          >
            <ArrowRight className="h-4 w-4" />
            {col.nextLabel ?? `Move to ${col.nextStatus}`}
          </button>
        )}
        {job.status !== "On Hold" && job.status !== "Done Today" && (
          <button
            onClick={hold}
            className="w-full rounded-md border border-warning/40 bg-warning/10 text-warning py-2.5 text-sm font-semibold hover:bg-warning/20"
          >
            Place On Hold
          </button>
        )}
        <button
          onClick={remove}
          className="w-full flex items-center justify-center gap-2 rounded-md border border-border py-2 text-sm text-muted-foreground hover:text-primary hover:border-primary/40"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete Job
        </button>
      </div>
    </div>
  );
}

// ─── Main kanban view ─────────────────────────────────────────────────────────

function ActiveJobs() {
  const { jobs, moveJob } = useStore();
  const [selected, setSelected] = useState<Job | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<JobStatus | null>(null);

  function onDragStart(e: React.DragEvent, jobId: string) {
    setDragId(jobId);
    e.dataTransfer.effectAllowed = "move";
  }

  function onDragOver(e: React.DragEvent, status: JobStatus) {
    e.preventDefault();
    setDropTarget(status);
  }

  function onDrop(e: React.DragEvent, status: JobStatus) {
    e.preventDefault();
    if (dragId && dragId !== jobs.find((j) => j.status === status && j.id === dragId)?.id) {
      moveJob(dragId, status);
      toast.success(`Job moved to ${status}`);
    }
    setDragId(null);
    setDropTarget(null);
  }

  const inProgress = jobs.filter((j) => j.status !== "Done Today" && j.status !== "Queue");
  const techMap = inProgress.reduce<Record<string, number>>((acc, j) => {
    if (j.tech && j.tech !== "—") acc[j.tech] = (acc[j.tech] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="p-6 h-full flex flex-col">
      <PageHeader
        title="Active Jobs"
        subtitle="Kanban board · drag cards between columns or click to manage"
      />

      <div className="flex-1 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 min-h-0">
        {COLUMNS.map((col) => {
          const items = jobs.filter((j) => j.status === col.status);
          const isTarget = dropTarget === col.status;
          return (
            <div
              key={col.status}
              onDragOver={(e) => onDragOver(e, col.status)}
              onDrop={(e) => onDrop(e, col.status)}
              onDragLeave={() => setDropTarget(null)}
              className={cn(
                "flex flex-col rounded-xl border-t-[3px] bg-card border-border transition-colors",
                col.tone,
                isTarget && "bg-primary/5 border-primary/30",
              )}
            >
              <div className="flex items-center justify-between px-3 pt-3 pb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider">{col.status}</h3>
                <span className="text-[11px] font-mono text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                  {items.length}
                </span>
              </div>
              <div className="flex-1 overflow-auto px-2 pb-2 space-y-2">
                {items.map((j) => {
                  const overdue = j.elapsedMin > j.estimateMin;
                  return (
                    <div
                      key={j.id}
                      draggable
                      onDragStart={(e) => onDragStart(e, j.id)}
                      onClick={() => setSelected(j)}
                      className="rounded-lg border border-border bg-background p-2.5 hover:shadow-card cursor-pointer transition-shadow border-l-[3px] select-none"
                      style={{ borderLeftColor: CAT_COLORS[j.category] ?? "var(--primary)" }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate">{j.customerName}</div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {j.vehicleModel} · <span className="font-mono">{j.plate}</span>
                          </div>
                        </div>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                      </div>
                      <div className="mt-2 text-[11px] line-clamp-2">{j.serviceName}</div>
                      <div className="mt-2 flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground truncate">
                          {j.tech} · {j.bay}
                        </span>
                        <span className={cn("inline-flex items-center gap-1 font-mono font-semibold shrink-0", overdue ? "text-primary" : "text-muted-foreground")}>
                          <Clock className="h-3 w-3" />
                          {j.elapsedMin}m
                        </span>
                      </div>
                      {col.nextStatus && (
                        <button
                          onClick={(e) => { e.stopPropagation(); moveJob(j.id, col.nextStatus!); toast.success(`${j.customerName} → ${col.nextStatus}`); }}
                          className="mt-2 w-full flex items-center justify-center gap-1 rounded bg-primary/10 text-primary text-[10px] font-semibold py-1 hover:bg-primary/20"
                        >
                          <Check className="h-3 w-3" />
                          {col.nextLabel}
                        </button>
                      )}
                    </div>
                  );
                })}
                {items.length === 0 && (
                  <div className="text-center text-[11px] text-muted-foreground py-6 border-2 border-dashed border-border rounded-lg">
                    Drop here
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Tech strip */}
      <div className="mt-4 rounded-xl border border-border bg-card shadow-card p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mr-2">
            Active Techs
          </div>
          {Object.entries(techMap).map(([name, count]) => (
            <div key={name} className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5">
              <div className="grid h-7 w-7 place-items-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
                {name.split(" ").map((p) => p[0]).join("")}
              </div>
              <div className="leading-tight">
                <div className="text-xs font-semibold">{name}</div>
                <div className="text-[10px] text-muted-foreground">{count} job{count !== 1 ? "s" : ""} active</div>
              </div>
            </div>
          ))}
          {Object.keys(techMap).length === 0 && (
            <span className="text-xs text-muted-foreground">No jobs in progress</span>
          )}
          <div className="ml-auto">
            <span className="text-xs text-muted-foreground">{jobs.length} total jobs today</span>
          </div>
        </div>
      </div>

      {/* Side panel */}
      {selected && (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/20"
            onClick={() => setSelected(null)}
          />
          <JobDetail
            key={selected.id}
            job={jobs.find((j) => j.id === selected.id) ?? selected}
            onClose={() => setSelected(null)}
          />
        </>
      )}
    </div>
  );
}
