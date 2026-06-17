import { createFileRoute } from "@tanstack/react-router";
import { JOBS, type JobStatus } from "@/lib/mock-data";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { Clock, Pause, Flag, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_app/jobs")({
  head: () => ({ meta: [{ title: "Active Jobs — Polish Station OS" }] }),
  component: ActiveJobs,
});

const COLUMNS: { status: JobStatus; tone: string }[] = [
  { status: "Queue", tone: "border-info" },
  { status: "In Bay", tone: "border-primary" },
  { status: "On Hold", tone: "border-warning" },
  { status: "Awaiting QC", tone: "border-warning" },
  { status: "Ready", tone: "border-success" },
  { status: "Done Today", tone: "border-muted-foreground" },
];

const CAT_COLORS: Record<string, string> = {
  Exterior: "var(--info)",
  Interior: "var(--success)",
  "Full Detail": "var(--primary)",
  "Paint Protection": "var(--warning)",
  Coating: "var(--charcoal)",
};

function ActiveJobs() {
  return (
    <div className="p-6 h-full flex flex-col">
      <PageHeader
        title="Active Jobs"
        subtitle="Kanban board · drag cards to update status"
      />

      <div className="flex-1 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 min-h-0">
        {COLUMNS.map((col) => {
          const items = JOBS.filter((j) => j.status === col.status);
          return (
            <div key={col.status} className={cn("flex flex-col rounded-xl border-t-[3px] bg-card border-border", col.tone)}>
              <div className="flex items-center justify-between px-3 pt-3 pb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider">{col.status}</h3>
                <span className="text-[11px] font-mono text-muted-foreground bg-muted rounded-full px-2 py-0.5">{items.length}</span>
              </div>
              <div className="flex-1 overflow-auto px-2 pb-2 space-y-2">
                {items.map((j) => {
                  const overdue = j.elapsedMin > j.estimateMin;
                  return (
                    <div
                      key={j.id}
                      className="rounded-lg border border-border bg-background p-2.5 hover:shadow-card cursor-pointer transition-shadow border-l-[3px]"
                      style={{ borderLeftColor: CAT_COLORS[j.category] ?? "var(--primary)" }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate">{j.customer}</div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {j.vehicle} · <span className="font-mono">{j.plate}</span>
                          </div>
                        </div>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                      </div>
                      <div className="mt-2 text-[11px] line-clamp-2">{j.service}</div>
                      <div className="mt-2 flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">{j.tech} · {j.bay}</span>
                        <span className={cn(
                          "inline-flex items-center gap-1 font-mono font-semibold",
                          overdue ? "text-primary" : "text-muted-foreground",
                        )}>
                          <Clock className="h-3 w-3" />
                          {j.elapsedMin}m
                        </span>
                      </div>
                    </div>
                  );
                })}
                {items.length === 0 && (
                  <div className="text-center text-[11px] text-muted-foreground py-6">Empty</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Tech performance strip */}
      <div className="mt-4 rounded-xl border border-border bg-card shadow-card p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mr-2">
            On Shift
          </div>
          {[
            { name: "Imran S.", done: 5, status: "Active" },
            { name: "Dilshan H.", done: 3, status: "Active" },
            { name: "Niro D.", done: 0, status: "Idle" },
            { name: "Tharu K.", done: 0, status: "Break" },
          ].map((t) => (
            <div key={t.name} className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5">
              <div className="grid h-7 w-7 place-items-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
                {t.name.split(" ").map((p) => p[0]).join("")}
              </div>
              <div className="leading-tight">
                <div className="text-xs font-semibold">{t.name}</div>
                <div className="text-[10px] text-muted-foreground">{t.done} jobs · {t.status}</div>
              </div>
            </div>
          ))}
          <div className="ml-auto flex gap-1.5">
            <button className="rounded-md border border-input p-1.5 hover:bg-accent" title="Pause"><Pause className="h-3.5 w-3.5" /></button>
            <button className="rounded-md border border-input p-1.5 hover:bg-accent" title="Flag"><Flag className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
