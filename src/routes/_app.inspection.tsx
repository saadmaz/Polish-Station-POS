// Inspection module landing page — a worklist of jobs eligible for
// inspection (vehicle physically at the shop) with a Start/Continue action,
// modeled on _app.jobs.tsx's flat worklist. Opens the guided stepper
// (InspectionSheet), which now covers photo capture, the damage diagram,
// and sign-off (Phases 2-4). Viewing a signed inspection in place (rather
// than just showing its status here) is a later phase.
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { InspectionSheet } from "@/components/inspection-sheet";
import { formatDate } from "@/lib/date-format";
import type { Job, JobStatus } from "@/lib/job";
import { latestNonSupersededInspection, type Inspection } from "@/lib/inspection";
import { ClipboardCheck, Camera, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_app/inspection")({
  head: () => ({ meta: [{ title: "Inspection · Polish Station OS" }] }),
  component: InspectionPage,
});

// Vehicle is physically at the shop and work isn't finished/cancelled yet —
// the window in which an inspection makes sense.
const ELIGIBLE_STATUSES: JobStatus[] = ["arrived", "checked_in", "in_progress", "qc", "ready"];

function InspectionPage() {
  const { jobs, inspections, startInspection } = useStore();
  const [sheetState, setSheetState] = useState<{ job: Job; inspection: Inspection } | null>(null);
  const [starting, setStarting] = useState<string | null>(null);

  const eligibleJobs = jobs
    .filter((j) => ELIGIBLE_STATUSES.includes(j.status))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  async function handleStartOrContinue(job: Job) {
    const existing = latestNonSupersededInspection(inspections, job.id);
    if (existing && existing.status !== "signed") {
      setSheetState({ job, inspection: existing });
      return;
    }
    if (existing && existing.status === "signed") return; // no action yet — supersession is a later phase
    setStarting(job.id);
    try {
      const inspection = await startInspection(job);
      setSheetState({ job, inspection });
    } catch {
      toast.error("Couldn't start the inspection, please try again");
    } finally {
      setStarting(null);
    }
  }

  return (
    <div className="p-6">
      <PageHeader title="Inspection" />

      {eligibleJobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card py-16 text-center text-muted-foreground">
          <ClipboardCheck className="h-8 w-8" />
          <p className="text-sm">No vehicles currently checked in for inspection.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3">Job</th>
                <th className="px-4 py-3">Vehicle</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Inspection</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {eligibleJobs.map((job) => {
                const inspection = latestNonSupersededInspection(inspections, job.id);
                return (
                  <tr key={job.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-mono text-xs">{job.id}</td>
                    <td className="px-4 py-3">
                      {job.vehicle ? (
                        <div>
                          <div className="font-mono">{job.vehicle.plate || "—"}</div>
                          <div className="text-xs text-muted-foreground">
                            {[job.vehicle.make, job.vehicle.model].filter(Boolean).join(" ")}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">No vehicle intake</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{job.customerSnapshot?.name ?? job.customerName}</td>
                    <td className="px-4 py-3 text-xs capitalize text-muted-foreground">
                      {job.status.replace(/_/g, " ")}
                    </td>
                    <td className="px-4 py-3">
                      {!inspection && (
                        <span className="text-xs text-muted-foreground">Not started</span>
                      )}
                      {inspection && inspection.status === "signed" && (
                        <span className="flex items-center gap-1 text-xs text-success">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Signed
                        </span>
                      )}
                      {inspection && inspection.status === "draft" && (
                        <span className="text-xs text-muted-foreground">
                          In progress · {formatDate(inspection.updatedAt)}
                        </span>
                      )}
                      {inspection && inspection.status === "pending_acknowledgment" && (
                        <span className="text-xs text-muted-foreground">Awaiting customer ack</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!job.vehicle ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : inspection?.status === "signed" ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <button
                          type="button"
                          disabled={starting === job.id}
                          onClick={() => handleStartOrContinue(job)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-60"
                        >
                          <Camera className="h-3.5 w-3.5" />
                          {inspection ? "Continue" : "Start Inspection"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {sheetState && (
        <InspectionSheet
          open={!!sheetState}
          onOpenChange={(open) => !open && setSheetState(null)}
          job={sheetState.job}
          inspection={sheetState.inspection}
        />
      )}
    </div>
  );
}
