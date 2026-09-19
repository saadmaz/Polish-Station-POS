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
import { JobSheet } from "@/components/job-sheet";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { formatDate, formatDateTime } from "@/lib/date-format";
import type { Job, JobStatus } from "@/lib/job";
import { formatDocumentLabel, type Lead } from "@/lib/db";
import { latestNonSupersededInspection, type Inspection } from "@/lib/inspection";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ClipboardCheck, Camera, CheckCircle2, Plus, Car, FileText, History } from "lucide-react";

/** "CBA 2421 - INSPECTION 3" -- same plate-prefixed convention as invoices/
 *  quotes (see db.ts's formatDocumentLabel). Falls back to the job ref for
 *  an inspection created before Inspection.number existed. */
function inspectionLabel(inspection: Inspection): string {
  const n = inspection.number?.replace(/^INS-/, "") ?? inspection.jobRef;
  return formatDocumentLabel(inspection.vehicleSnapshot.plate, `INSPECTION ${n}`);
}

export const Route = createFileRoute("/_app/inspection")({
  head: () => ({ meta: [{ title: "Inspection · Polish Station OS" }] }),
  component: InspectionPage,
});

// Vehicle is physically at the shop and work isn't finished/cancelled yet —
// the window in which an inspection makes sense.
const ELIGIBLE_STATUSES: JobStatus[] = ["arrived", "checked_in", "in_progress", "qc", "ready"];

// Same free-text-vs-parsed fallback _app.leads.tsx's own vehicleLabel() uses
// — not imported from there since that one isn't exported, and this is the
// only other place that needs it.
function leadVehicleLabel(lead: Lead): string {
  if (lead.vehicleMake || lead.vehicleModel) {
    const makeModel = [lead.vehicleMake, lead.vehicleModel].filter(Boolean).join(" ");
    return lead.vehicleYear ? `${makeModel} · ${lead.vehicleYear}` : makeModel;
  }
  return lead.vehicle || "No vehicle description yet";
}

// Shared by the desktop table row and the mobile card below it — same
// status logic rendered twice would drift out of sync otherwise.
function InspectionStatusBadge({ inspection }: { inspection: Inspection | null }) {
  if (!inspection) return <span className="text-xs text-muted-foreground">Not started</span>;
  if (inspection.status === "signed") {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-1 text-xs text-success">
          <CheckCircle2 className="h-3.5 w-3.5" /> Signed
        </span>
        {inspection.documents?.report && (
          <a
            href={inspection.documents.report.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            <FileText className="h-3.5 w-3.5" /> Report
          </a>
        )}
      </div>
    );
  }
  if (inspection.status === "draft") {
    return (
      <span className="text-xs text-muted-foreground">
        In progress · {formatDate(inspection.updatedAt)}
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">Awaiting customer ack</span>;
}

function InspectionActionButton({
  job,
  inspection,
  starting,
  onStart,
  className,
}: {
  job: Job;
  inspection: Inspection | null;
  starting: string | null;
  onStart: (job: Job) => void;
  className?: string;
}) {
  if (!job.vehicle || inspection?.status === "signed") {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <button
      type="button"
      disabled={starting === job.id}
      onClick={() => onStart(job)}
      className={
        className ??
        "inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-60"
      }
    >
      <Camera className="h-3.5 w-3.5" />
      {inspection ? "Continue" : "Start Inspection"}
    </button>
  );
}

// Mobile card — the desktop table's six columns don't reflow onto a phone
// screen, so this is a separate, narrower layout for the same row's data
// (same pattern _app.jobs.tsx's JobCard/JobRow pair already uses).
function InspectionJobCard({
  job,
  inspection,
  starting,
  onStart,
}: {
  job: Job;
  inspection: Inspection | null;
  starting: string | null;
  onStart: (job: Job) => void;
}) {
  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs font-semibold">{job.id}</span>
            <span className="text-[11px] capitalize text-muted-foreground">
              {job.status.replace(/_/g, " ")}
            </span>
          </div>
          {job.vehicle ? (
            <div className="mt-1 text-sm">
              <span className="font-mono">{job.vehicle.plate || "—"}</span>{" "}
              <span className="text-xs text-muted-foreground">
                {[job.vehicle.make, job.vehicle.model].filter(Boolean).join(" ")}
              </span>
            </div>
          ) : (
            <div className="mt-1 text-xs text-muted-foreground">No vehicle intake</div>
          )}
          <div className="text-[11px] text-muted-foreground truncate">
            {job.customerSnapshot?.name ?? job.customerName}
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <InspectionStatusBadge inspection={inspection} />
        <InspectionActionButton
          job={job}
          inspection={inspection}
          starting={starting}
          onStart={onStart}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-[11px] font-medium hover:bg-accent disabled:opacity-60"
        />
      </div>
    </div>
  );
}

// A completed inspection's row, shared by the "fill the empty state" inline
// list and the full All Reports drawer.
function InspectionReportRow({ inspection }: { inspection: Inspection }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
      <div className="min-w-0">
        <div className="font-mono text-xs text-muted-foreground">{inspectionLabel(inspection)}</div>
        <div className="truncate text-sm font-medium">{inspection.customerSnapshot.name}</div>
        <div className="truncate text-xs text-muted-foreground">
          {[inspection.vehicleSnapshot.make, inspection.vehicleSnapshot.model]
            .filter(Boolean)
            .join(" ")}{" "}
          · {formatDateTime(inspection.updatedAt)}
        </div>
      </div>
      {inspection.documents?.report ? (
        <a
          href={inspection.documents.report.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
        >
          <FileText className="h-3.5 w-3.5" /> Report
        </a>
      ) : (
        <span className="shrink-0 text-xs text-muted-foreground">No report file</span>
      )}
    </div>
  );
}

function InspectionPage() {
  const { jobs, leads, inspections, startInspection } = useStore();
  // Only the id — never the Job/Inspection objects themselves. Those come
  // from useStore()'s live, onSnapshot-backed arrays on every render (see
  // sheetJob/sheetInspection below); freezing a snapshot here was the actual
  // bug behind "sign-off keeps failing with a permission error even on the
  // very first click" — the sheet went on showing a draft/pending_ack
  // inspection as still-editable long after some other write (an earlier
  // attempt that actually succeeded, a supersession, anything) had already
  // moved the real document to "signed"/"superseded" server-side, so every
  // further write against it was correctly rejected by storage.rules/
  // firestore.rules while the stale UI kept inviting another try.
  const [sheetJobId, setSheetJobId] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [convertLead, setConvertLead] = useState<Lead | null>(null);
  const [reportsOpen, setReportsOpen] = useState(false);

  const eligibleJobs = jobs
    .filter((j) => ELIGIBLE_STATUSES.includes(j.status))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const sheetJob = sheetJobId ? (jobs.find((j) => j.id === sheetJobId) ?? null) : null;
  const sheetInspection = sheetJob ? latestNonSupersededInspection(inspections, sheetJob.id) : null;

  // Every completed inspection, most recent first -- superseded ones excluded
  // (an outdated re-inspection, not something anyone wants to browse to).
  // Denormalized vehicleSnapshot/customerSnapshot on the Inspection itself
  // means this needs no join back to Job.
  const completedInspections = inspections
    .filter((i) => i.status === "signed")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  async function handleStartOrContinue(job: Job) {
    const existing = latestNonSupersededInspection(inspections, job.id);
    if (existing && existing.status !== "signed") {
      setSheetJobId(job.id);
      return;
    }
    if (existing && existing.status === "signed") return; // no action yet — supersession is a later phase
    setStarting(job.id);
    try {
      await startInspection(job);
      setSheetJobId(job.id);
    } catch {
      toast.error("Couldn't start the inspection, please try again");
    } finally {
      setStarting(null);
    }
  }

  // Plate numbers only ever exist on a Job (they get typed in during vehicle
  // intake — see JobSheet's convertLead form); Leads never carry one, only a
  // free-text description. So "search by vehicle number" has to search Jobs,
  // not Leads — this is every job with vehicle intake done, regardless of
  // its current status, so a vehicle that's already in the system (whatever
  // stage it's at) is always findable here, not just the ones currently
  // sitting in the eligible-jobs table below.
  const q = query.trim().toLowerCase();
  const pickableJobs = jobs
    .filter((j): j is Job & { vehicle: NonNullable<Job["vehicle"]> } => !!j.vehicle)
    .filter((j) => {
      if (!q) return true;
      const haystack = [
        j.vehicle.plate,
        j.vehicle.make,
        j.vehicle.model,
        j.customerSnapshot?.name ?? j.customerName,
        j.customerSnapshot?.phone,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // Leads not yet turned into a job — the second pool "New Inspection" picks
  // from, for a vehicle that isn't in the system as a Job yet at all. Once a
  // lead is converted it gets a real vehicle intake (plate, make, model,
  // mileage, etc.) and moves into pickableJobs above instead.
  const pickableLeads = leads
    .filter((l) => l.status !== "lost" && l.status !== "duplicate" && l.convertedTo?.type !== "job")
    .filter((l) => {
      if (!q) return true;
      const haystack = [l.name, l.phone, l.phoneRaw, l.vehicle, l.vehicleMake, l.vehicleModel]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  function handlePickJob(job: Job) {
    setPickerOpen(false);
    setQuery("");
    void handleStartOrContinue(job);
  }

  function handlePickLead(lead: Lead) {
    setPickerOpen(false);
    setQuery("");
    setConvertLead(lead);
  }

  function closeSheet(open: boolean) {
    if (!open) setSheetJobId(null);
  }

  // The vehicle-intake form (JobSheet in convertLead mode) already asks for
  // everything the reference sheet wants up front — plate, customer name,
  // make/model/colour/body type, mileage. Once that job exists, jump
  // straight into the same inspection stepper the eligible-jobs table uses.
  function handleJobCreatedFromLead(job: Job) {
    setConvertLead(null);
    void handleStartOrContinue(job);
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Inspection"
        actions={
          <>
            <button
              type="button"
              onClick={() => setReportsOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
            >
              <History className="h-3.5 w-3.5" />
              All Inspection Reports
            </button>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-red hover:bg-primary/90"
            >
              <Plus className="h-3.5 w-3.5" />
              New Inspection
            </button>
          </>
        }
      />

      <Sheet open={reportsOpen} onOpenChange={setReportsOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>All Inspection Reports</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            {completedInspections.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No completed inspections yet.
              </div>
            ) : (
              completedInspections.map((i) => <InspectionReportRow key={i.id} inspection={i} />)
            )}
          </div>
        </SheetContent>
      </Sheet>

      <CommandDialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <CommandInput
          placeholder="Search by vehicle number, make/model, or customer name…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>
            {jobs.length === 0 && leads.length === 0
              ? "No vehicles in the system yet."
              : "No matching vehicle."}
          </CommandEmpty>
          {pickableJobs.length > 0 && (
            <CommandGroup heading="Existing Vehicles">
              {pickableJobs.slice(0, 30).map((job) => (
                <CommandItem
                  key={job.id}
                  value={[
                    job.id,
                    job.vehicle.plate,
                    job.vehicle.make,
                    job.vehicle.model,
                    job.customerSnapshot?.name ?? job.customerName,
                    job.customerSnapshot?.phone,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onSelect={() => handlePickJob(job)}
                >
                  <Car className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-mono font-medium">{job.vehicle.plate || "—"}</span>
                      <span className="truncate text-sm text-muted-foreground">
                        {[job.vehicle.make, job.vehicle.model].filter(Boolean).join(" ")}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="truncate">
                        {job.customerSnapshot?.name ?? job.customerName}
                      </span>
                      <span className="shrink-0 capitalize">{job.status.replace(/_/g, " ")}</span>
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {pickableLeads.length > 0 && (
            <CommandGroup heading="Vehicles from Leads">
              {pickableLeads.slice(0, 30).map((lead) => (
                <CommandItem
                  key={lead.id}
                  value={[
                    lead.id,
                    lead.name,
                    lead.phone,
                    lead.vehicle,
                    lead.vehicleMake,
                    lead.vehicleModel,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onSelect={() => handlePickLead(lead)}
                >
                  <Car className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <span className="truncate font-medium">{leadVehicleLabel(lead)}</span>
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="truncate">{lead.name}</span>
                      <span className="shrink-0">{lead.phone ?? "—"}</span>
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>

      {convertLead && (
        <JobSheet
          open={!!convertLead}
          onOpenChange={(open) => !open && setConvertLead(null)}
          convertLead={{ lead: convertLead }}
          onCreated={handleJobCreatedFromLead}
        />
      )}

      {eligibleJobs.length === 0 ? (
        <div className="space-y-6">
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card py-10 text-center text-muted-foreground">
            <ClipboardCheck className="h-8 w-8" />
            <p className="text-sm">No vehicles currently checked in for inspection.</p>
          </div>
          {completedInspections.length > 0 && (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  Recent Inspection Reports
                </h3>
                <button
                  type="button"
                  onClick={() => setReportsOpen(true)}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  View all
                </button>
              </div>
              <div className="space-y-2">
                {completedInspections.slice(0, 6).map((i) => (
                  <InspectionReportRow key={i.id} inspection={i} />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Phone-width card list — the six-column table below doesn't
              reflow onto a narrow screen, so this is a separate layout for
              the same rows, not a smaller version of the same markup. */}
          <div className="divide-y divide-border rounded-xl border border-border bg-card md:hidden">
            {eligibleJobs.map((job) => (
              <InspectionJobCard
                key={job.id}
                job={job}
                inspection={latestNonSupersededInspection(inspections, job.id)}
                starting={starting}
                onStart={handleStartOrContinue}
              />
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
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
                      <td className="px-4 py-3">
                        {job.customerSnapshot?.name ?? job.customerName}
                      </td>
                      <td className="px-4 py-3 text-xs capitalize text-muted-foreground">
                        {job.status.replace(/_/g, " ")}
                      </td>
                      <td className="px-4 py-3">
                        <InspectionStatusBadge inspection={inspection} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <InspectionActionButton
                          job={job}
                          inspection={inspection}
                          starting={starting}
                          onStart={handleStartOrContinue}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {sheetJob && sheetInspection && (
        <InspectionSheet
          open={!!sheetJobId}
          onOpenChange={closeSheet}
          job={sheetJob}
          inspection={sheetInspection}
        />
      )}
    </div>
  );
}
