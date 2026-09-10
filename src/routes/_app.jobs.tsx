// Job intake worklist — list + filter bar + inline expand-in-place detail +
// a create/edit Sheet, modeled on _app.customers.tsx (a flat worklist, not a
// scheduling grid like _app.bookings.tsx). Booking above is still just "the
// promise"; POS checkout remains the other writer of this same `jobs`
// collection, transitioning a job straight to "delivered" on walk-in sale.
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { useStaffList } from "@/lib/use-staff-list";
import { useConfirm } from "@/hooks/use-confirm";
import { PageHeader } from "@/components/page-header";
import { StatusChip, statusVariant } from "@/components/status-chip";
import { JobSheet } from "@/components/job-sheet";
import { HandoverSheet } from "@/components/handover-sheet";
import { formatCurrency } from "@/lib/currency";
import { formatDate } from "@/lib/date-format";
import { legalNextStatuses, type Job, type JobStatus } from "@/lib/job";
import { generateJobCardPDF } from "@/lib/pdf";
import { buildWALink } from "@/lib/notifications";
import { isPendingAcknowledgmentOverdue, latestNonSupersededInspection } from "@/lib/inspection";
import {
  Search,
  Plus,
  Pencil,
  ChevronDown,
  ChevronUp,
  FileDown,
  MessageCircle,
  AlertTriangle,
} from "lucide-react";

export const Route = createFileRoute("/_app/jobs")({
  head: () => ({ meta: [{ title: "Jobs · Polish Station OS" }] }),
  component: Jobs,
});

const JOB_STATUSES: JobStatus[] = [
  "booked",
  "arrived",
  "checked_in",
  "in_progress",
  "qc",
  "ready",
  "delivered",
  "cancelled",
  "no_show",
];

const TERMINAL_CONFIRM: Partial<Record<JobStatus, string>> = {
  cancelled: "Cancel this job? This cannot be undone.",
  no_show: "Mark this job a no-show? This cannot be undone.",
};

function statusLabel(status: JobStatus): string {
  return status.replace(/_/g, " ");
}

// ─── Detail panel ───────────────────────────────────────────────────────────

function JobDetailPanel({ job }: { job: Job }) {
  const { transitionJobStatus, updateJob, inspections } = useStore();
  const { staffList } = useStaffList();
  const { confirm, ConfirmDialog } = useConfirm();
  const [generating, setGenerating] = useState(false);
  const [handoverOpen, setHandoverOpen] = useState(false);

  const supervisorName = staffList.find((s) => s.id === job.schedule?.supervisorId)?.name ?? "";
  const technicianNames = (job.schedule?.technicianIds ?? [])
    .map((id) => staffList.find((s) => s.id === id)?.name)
    .filter((n): n is string => !!n);

  const nextStatuses = legalNextStatuses(job.status);
  const jobCard = job.documents?.jobCard;
  const upToDate = jobCard && jobCard.version === (job.estimate?.quoteVersion ?? 1);

  // Inspection Phase 4: work must not start while this job's inspection sits
  // unanswered in "pending_acknowledgment" past the threshold — a real
  // block on the transition, not just a UI warning that's easy to click
  // past. Only "in_progress" is gated; that's the transition that means
  // "work has actually started" (see job.ts's LEGAL_TRANSITIONS comment).
  const inspection = latestNonSupersededInspection(inspections, job.id);
  const inspectionOverdue = inspection ? isPendingAcknowledgmentOverdue(inspection) : false;

  async function handleTransition(to: JobStatus) {
    if (to === "in_progress" && inspectionOverdue) {
      toast.error(
        "Can't start work — this job's inspection has been awaiting customer acknowledgment for over 4 hours. Resolve it on the Inspection page first.",
      );
      return;
    }
    // Phase 7: "ready" -> "delivered" isn't a plain status flip — it opens
    // the handover screen, which does the actual transition itself once
    // the after-photos and acceptance signature are captured. See
    // HandoverSheet's handleConfirm().
    if (to === "delivered") {
      setHandoverOpen(true);
      return;
    }
    const confirmMessage = TERMINAL_CONFIRM[to];
    if (confirmMessage && !(await confirm({ title: confirmMessage, requirePin: true }))) return;
    try {
      await transitionJobStatus(job.id, to);
      toast.success(`Job marked ${statusLabel(to)}`);
    } catch {
      toast.error("Couldn't update the job status, please try again");
    }
  }

  async function handleGeneratePDF() {
    setGenerating(true);
    try {
      const result = await generateJobCardPDF(job, { supervisorName, technicianNames });
      updateJob({
        ...job,
        documents: {
          ...job.documents,
          jobCard: { ...result, generatedAt: new Date().toISOString() },
        },
      });
      toast.success("Job card generated");
    } catch {
      toast.error("Couldn't generate the job card, please try again");
    } finally {
      setGenerating(false);
    }
  }

  const whatsAppMessage = jobCard
    ? `Hi ${job.customerSnapshot?.name ?? job.customerName}, here's your job card (${job.id}) from Polish Station: ${jobCard.url}`
    : "";

  return (
    <div className="space-y-4">
      {ConfirmDialog}
      <HandoverSheet open={handoverOpen} onOpenChange={setHandoverOpen} job={job} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
            Vehicle
          </h4>
          {job.vehicle ? (
            <div className="text-sm space-y-0.5">
              <div className="font-mono">{job.vehicle.plate || "—"}</div>
              <div className="text-muted-foreground">
                {[job.vehicle.year, job.vehicle.make, job.vehicle.model]
                  .filter(Boolean)
                  .join(" ") || "—"}
                {job.vehicle.colour ? ` · ${job.vehicle.colour}` : ""}
              </div>
              <div className="text-xs text-muted-foreground">
                {job.vehicle.bodyType} ·{" "}
                {job.vehicle.mileage != null ? `${job.vehicle.mileage} km` : "—"}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No vehicle on file</p>
          )}
        </div>
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
            Schedule
          </h4>
          <div className="text-sm space-y-0.5">
            <div>Supervisor: {supervisorName || "Unassigned"}</div>
            <div>
              Technician(s):{" "}
              {technicianNames.length > 0 ? technicianNames.join(", ") : "Unassigned"}
            </div>
            <div className="text-xs text-muted-foreground">Bay: {job.bay || "—"}</div>
          </div>
        </div>
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
            Estimate
          </h4>
          <div className="text-sm space-y-0.5">
            <div className="font-mono font-semibold">{formatCurrency(job.price)}</div>
            {job.estimate?.isProvisional && (
              <div className="text-[11px] font-medium text-warning">
                Provisional · subject to on-site inspection
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              Version {job.estimate?.quoteVersion ?? 1}
            </div>
          </div>
        </div>
      </div>

      {job.notes && (
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
            Notes
          </h4>
          <p className="text-sm text-muted-foreground">{job.notes}</p>
        </div>
      )}

      {inspectionOverdue && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          This job's inspection has been awaiting customer acknowledgment for over 4 hours. Work
          can't start until that's resolved on the Inspection page.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        {nextStatuses.map((s) => {
          const blocked = s === "in_progress" && inspectionOverdue;
          return (
            <button
              key={s}
              disabled={blocked}
              title={
                blocked ? "Blocked — inspection awaiting acknowledgment past 4 hours" : undefined
              }
              onClick={(e) => {
                e.stopPropagation();
                handleTransition(s);
              }}
              className="rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium capitalize hover:bg-accent disabled:opacity-40 disabled:hover:bg-background"
            >
              Mark {statusLabel(s)}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleGeneratePDF();
          }}
          disabled={generating}
          className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-60"
        >
          <FileDown className="h-3.5 w-3.5" />
          {generating
            ? "Generating…"
            : jobCard && upToDate
              ? "Download Job Card"
              : jobCard
                ? "Regenerate Job Card (price changed)"
                : "Generate Job Card"}
        </button>
        {jobCard && job.customerSnapshot?.phone && (
          <a
            href={buildWALink(job.customerSnapshot.phone, whatsAppMessage)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Share via WhatsApp
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Row / card ─────────────────────────────────────────────────────────────

function JobRow({ job, onEdit }: { job: Job; onEdit: () => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr className="hover:bg-muted/40 cursor-pointer" onClick={() => setExpanded((v) => !v)}>
        <td className="px-5 py-3">
          <div className="font-mono text-xs font-semibold">{job.id}</div>
          <div className="text-[11px] text-muted-foreground">{job.customerName}</div>
        </td>
        <td className="px-3 py-3 font-mono text-xs text-muted-foreground">
          {job.vehicle?.plate || "—"}
        </td>
        <td className="px-3 py-3 text-xs text-muted-foreground">{job.serviceName}</td>
        <td className="px-3 py-3 text-xs text-muted-foreground">
          {formatDate(job.date)} {job.time}
        </td>
        <td className="px-3 py-3 text-right font-mono font-semibold">
          {formatCurrency(job.price)}
        </td>
        <td className="px-3 py-3">
          <StatusChip variant={statusVariant(job.status)}>{statusLabel(job.status)}</StatusChip>
        </td>
        <td className="px-3 py-3">
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              aria-label="Edit job"
              className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Edit"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-muted/20">
          <td colSpan={7} className="px-5 py-4">
            <JobDetailPanel job={job} />
          </td>
        </tr>
      )}
    </>
  );
}

function JobCard({ job, onEdit }: { job: Job; onEdit: () => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="p-4">
      <button
        className="flex w-full items-start justify-between gap-2.5 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-sm font-semibold">{job.id}</span>
            <StatusChip variant={statusVariant(job.status)}>{statusLabel(job.status)}</StatusChip>
          </div>
          <div className="text-[11px] text-muted-foreground truncate">
            {job.customerName} · {job.vehicle?.plate || "—"}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{job.serviceName}</span>
            <span className="font-mono font-semibold text-foreground">
              {formatCurrency(job.price)}
            </span>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          onClick={onEdit}
          className="inline-flex items-center gap-1 rounded-md border border-input px-2.5 py-1.5 text-[11px] font-medium hover:bg-accent"
        >
          <Pencil className="h-3.5 w-3.5" /> Edit
        </button>
      </div>

      {expanded && (
        <div className="mt-3 border-t border-border pt-3">
          <JobDetailPanel job={job} />
        </div>
      )}
    </div>
  );
}

// ─── Main list ──────────────────────────────────────────────────────────────

function Jobs() {
  const { jobs } = useStore();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Job | undefined>(undefined);

  const filtered = jobs.filter((j) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      j.id.toLowerCase().includes(q) ||
      j.customerName.toLowerCase().includes(q) ||
      (j.vehicle?.plate ?? "").toLowerCase().includes(q);
    const matchesStatus = statusFilter === "All" || j.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  function openCreate() {
    setEditing(undefined);
    setSheetOpen(true);
  }

  function openEdit(job: Job) {
    setEditing(job);
    setSheetOpen(true);
  }

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="Jobs"
        subtitle={`${jobs.length} jobs`}
        actions={
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-red hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> New Job
          </button>
        }
      />

      <div className="rounded-xl border border-border bg-card shadow-card">
        <div className="flex flex-col gap-3 p-4 border-b border-border sm:flex-row sm:items-center">
          <div className="flex flex-1 items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              className="flex-1 bg-transparent outline-none"
              placeholder="Search by ref, customer, plate…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="min-h-9 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option>All</option>
            {JOB_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        </div>

        <div className="divide-y divide-border md:hidden">
          {filtered.map((j) => (
            <JobCard key={j.id} job={j} onEdit={() => openEdit(j)} />
          ))}
          {filtered.length === 0 && (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {search || statusFilter !== "All" ? "No jobs match your filter" : "No jobs yet"}
            </div>
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead className="bg-charcoal text-charcoal-foreground text-[11px] uppercase tracking-wider">
              <tr>
                <th className="text-left px-5 py-2.5">Job</th>
                <th className="text-left px-3 py-2.5">Plate</th>
                <th className="text-left px-3 py-2.5">Service</th>
                <th className="text-left px-3 py-2.5">Scheduled</th>
                <th className="text-right px-3 py-2.5">Amount</th>
                <th className="text-left px-3 py-2.5">Status</th>
                <th className="w-16 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((j) => (
                <JobRow key={j.id} job={j} onEdit={() => openEdit(j)} />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-muted-foreground">
                    {search || statusFilter !== "All" ? "No jobs match your filter" : "No jobs yet"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <JobSheet open={sheetOpen} onOpenChange={setSheetOpen} editing={editing} />
    </div>
  );
}
