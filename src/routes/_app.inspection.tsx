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
import { formatDate } from "@/lib/date-format";
import type { Job, JobStatus } from "@/lib/job";
import type { Lead } from "@/lib/db";
import { latestNonSupersededInspection } from "@/lib/inspection";
import { ClipboardCheck, Camera, CheckCircle2, Plus, Car, FileText } from "lucide-react";

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

  const eligibleJobs = jobs
    .filter((j) => ELIGIBLE_STATUSES.includes(j.status))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const sheetJob = sheetJobId ? (jobs.find((j) => j.id === sheetJobId) ?? null) : null;
  const sheetInspection = sheetJob ? latestNonSupersededInspection(inspections, sheetJob.id) : null;

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
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-red hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" />
            New Inspection
          </button>
        }
      />

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
                  <Car className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span className="font-mono font-medium">{job.vehicle.plate || "—"}</span>
                  <span className="ml-2 text-sm">
                    {[job.vehicle.make, job.vehicle.model].filter(Boolean).join(" ")}
                  </span>
                  <span className="ml-2 text-sm text-muted-foreground">
                    {job.customerSnapshot?.name ?? job.customerName}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground capitalize">
                    {job.status.replace(/_/g, " ")}
                  </span>
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
                  <Car className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{leadVehicleLabel(lead)}</span>
                  <span className="ml-2 text-sm">{lead.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{lead.phone ?? "—"}</span>
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
                        <div className="flex items-center gap-3">
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
