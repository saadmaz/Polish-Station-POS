import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import {
  Clock,
  ChevronRight,
  X,
  Check,
  ArrowRight,
  Trash2,
  FileText,
  Camera,
  ClipboardCheck,
  Info,
  ZoomIn,
  MessageCircle,
} from "lucide-react";
import type { Job, JobStatus, JobPhoto, QCItem } from "@/lib/db";
import { downloadQuotationPDF } from "@/lib/pdf";
import { newId } from "@/lib/db";
import { buildWALink, fillTemplate } from "@/lib/notifications";

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

// ─── Image compression ────────────────────────────────────────────────────────

async function compressImage(file: File, maxWidth = 1200, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("canvas ctx")); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// ─── Photos tab ───────────────────────────────────────────────────────────────

const STAGES: { key: JobPhoto["stage"]; label: string }[] = [
  { key: "before",  label: "Before"  },
  { key: "during",  label: "During"  },
  { key: "after",   label: "After"   },
];

function PhotosTab({ job }: { job: Job }) {
  const { addJobPhoto, removeJobPhoto } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<JobPhoto["stage"]>("before");
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const photos = job.photos ?? [];

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await compressImage(file);
      addJobPhoto(job.id, { stage, url, takenAt: new Date().toISOString(), note: "" });
      toast.success("Photo added");
    } catch {
      toast.error("Failed to process image");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <>
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20">
            <X className="h-5 w-5 text-white" />
          </button>
          <img src={lightbox} alt="Job photo" className="max-h-full max-w-full object-contain rounded-lg" />
        </div>
      )}

      <div className="space-y-4">
        {/* Stage selector + add */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border overflow-hidden text-xs">
            {STAGES.map((s) => (
              <button
                key={s.key}
                onClick={() => setStage(s.key)}
                className={cn(
                  "px-3 py-1.5 font-medium transition-colors",
                  stage === s.key
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted text-muted-foreground",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="ml-auto flex items-center gap-1.5 rounded-md bg-primary/10 text-primary px-3 py-1.5 text-xs font-semibold hover:bg-primary/20 disabled:opacity-50"
          >
            <Camera className="h-3.5 w-3.5" />
            {uploading ? "Processing…" : "Add Photo"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFile}
          />
        </div>

        {/* Photos grouped by stage */}
        {STAGES.map(({ key, label }) => {
          const stagePhotos = photos.filter((p) => p.stage === key);
          if (!stagePhotos.length) return null;
          return (
            <div key={key}>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                {label} ({stagePhotos.length})
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {stagePhotos.map((photo) => (
                  <div key={photo.id} className="relative group">
                    <img
                      src={photo.url}
                      alt={`${label} photo`}
                      className="w-full aspect-square object-cover rounded-md border border-border cursor-pointer"
                      onClick={() => setLightbox(photo.url)}
                    />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity gap-1">
                      <button
                        onClick={() => setLightbox(photo.url)}
                        className="p-1.5 rounded-full bg-black/60 text-white"
                      >
                        <ZoomIn className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm("Remove this photo?")) removeJobPhoto(job.id, photo.id);
                        }}
                        className="p-1.5 rounded-full bg-black/60 text-white"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 text-center">
                      {new Date(photo.takenAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {photos.length === 0 && (
          <div className="text-center py-10 text-sm text-muted-foreground border-2 border-dashed border-border rounded-lg">
            <Camera className="h-8 w-8 mx-auto mb-2 opacity-30" />
            No photos yet.
            <br />
            <span className="text-xs">Add before &amp; after photos to document this job.</span>
          </div>
        )}

        {photos.length > 0 && (
          <div className="text-[11px] text-muted-foreground text-center">
            {photos.length} photo{photos.length !== 1 ? "s" : ""} stored
          </div>
        )}
      </div>
    </>
  );
}

// ─── QC Checklist tab ─────────────────────────────────────────────────────────

function QCTab({ job }: { job: Job }) {
  const { updateQCItems } = useStore();
  const { staff } = useAuth();

  const items = job.qcItems ?? [];
  const checkedCount = items.filter((i) => i.checked).length;
  const allChecked = items.length > 0 && checkedCount === items.length;

  function toggle(itemId: string) {
    updateQCItems(
      job.id,
      items.map((i) => (i.id === itemId ? { ...i, checked: !i.checked } : i)),
    );
  }

  function checkAll() {
    updateQCItems(job.id, items.map((i) => ({ ...i, checked: true })));
  }

  if (!["Awaiting QC", "Ready", "Done Today"].includes(job.status) && items.length === 0) {
    return (
      <div className="text-center py-10 text-sm text-muted-foreground border-2 border-dashed border-border rounded-lg">
        <ClipboardCheck className="h-8 w-8 mx-auto mb-2 opacity-30" />
        QC checklist activates when job reaches <strong>Awaiting QC</strong>.
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-10 text-sm text-muted-foreground border-2 border-dashed border-border rounded-lg">
        <ClipboardCheck className="h-8 w-8 mx-auto mb-2 opacity-30" />
        No QC items. Send job to <strong>Awaiting QC</strong> to generate checklist.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Progress bar */}
      <div className="rounded-lg bg-muted/40 border border-border p-3 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold">QC Progress</span>
          <span className={cn("font-mono font-bold", allChecked ? "text-success" : "text-muted-foreground")}>
            {checkedCount} / {items.length}
          </span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", allChecked ? "bg-success" : "bg-primary")}
            style={{ width: `${items.length ? (checkedCount / items.length) * 100 : 0}%` }}
          />
        </div>
        {allChecked && (
          <div className="text-[11px] text-success font-semibold flex items-center gap-1">
            <Check className="h-3 w-3" /> All checks passed
            {job.qcCompletedBy && <span className="text-muted-foreground font-normal"> · by {job.qcCompletedBy}</span>}
          </div>
        )}
      </div>

      {/* Items */}
      <div className="space-y-1.5">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => toggle(item.id)}
            className={cn(
              "w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
              item.checked
                ? "border-success/30 bg-success/5 text-foreground"
                : "border-border bg-background hover:bg-muted/40",
            )}
          >
            <div
              className={cn(
                "shrink-0 h-5 w-5 rounded border-2 flex items-center justify-center transition-colors",
                item.checked ? "bg-success border-success" : "border-muted-foreground/40",
              )}
            >
              {item.checked && <Check className="h-3 w-3 text-white" />}
            </div>
            <span className={cn(item.checked && "line-through text-muted-foreground")}>
              {item.label}
            </span>
          </button>
        ))}
      </div>

      {!allChecked && (
        <button
          onClick={checkAll}
          className="w-full rounded-md border border-success/40 bg-success/5 text-success py-2 text-xs font-semibold hover:bg-success/10"
        >
          Mark All Complete
        </button>
      )}

      {!allChecked && job.status === "Awaiting QC" && (
        <div className="flex items-start gap-2 rounded-lg bg-warning/10 border border-warning/30 px-3 py-2.5 text-xs text-warning">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          Complete all items before approving. Staff: {staff?.name ?? "—"}
        </div>
      )}
    </div>
  );
}

// ─── Details tab ──────────────────────────────────────────────────────────────

function DetailsTab({
  job,
  tech,
  setTech,
  bay,
  setBay,
  openShift,
}: {
  job: Job;
  tech: string;
  setTech: (v: string) => void;
  bay: string;
  setBay: (v: string) => void;
  openShift: unknown;
}) {
  const overdue = job.elapsedMin > job.estimateMin;
  return (
    <div className="space-y-5">
      <div className="rounded-lg bg-muted/40 border border-border p-3 space-y-1">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Vehicle</div>
        <div className="font-semibold">{job.vehicleModel || "—"}</div>
        <div className="font-mono text-sm">{job.plate}</div>
        {job.vehicleColor && <div className="text-sm text-muted-foreground">{job.vehicleColor}</div>}
      </div>

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

      <div className="text-xs text-muted-foreground space-y-0.5">
        <div>Created: {new Date(job.createdAt).toLocaleString()}</div>
        {job.startedAt && <div>Started: {new Date(job.startedAt).toLocaleString()}</div>}
        {job.completedAt && <div>Completed: {new Date(job.completedAt).toLocaleString()}</div>}
        {!openShift && (
          <div className="text-warning mt-1">No active shift — job won't be linked to revenue</div>
        )}
      </div>
    </div>
  );
}

// ─── Job detail side panel ────────────────────────────────────────────────────

type DetailTab = "details" | "photos" | "qc";

function JobDetail({ job, onClose }: { job: Job; onClose: () => void }) {
  const { moveJob, deleteJob, openShift, notificationSettingsData, recordNotification } = useStore();
  const [tech, setTech] = useState(job.tech);
  const [bay, setBay] = useState(job.bay);
  const [tab, setTab] = useState<DetailTab>("details");

  const col = COLUMNS.find((c) => c.status === job.status);
  const photoCount = job.photos?.length ?? 0;
  const qcItems = job.qcItems ?? [];
  const qcDone = qcItems.length > 0 && qcItems.every((i) => i.checked);
  const qcPending = job.status === "Awaiting QC" && !qcDone;

  function advance() {
    if (!col?.nextStatus) return;
    if (col.nextStatus === "Ready" && !qcDone && qcItems.length > 0) {
      const ok = confirm(
        `QC checklist is not complete (${qcItems.filter((i) => i.checked).length}/${qcItems.length} checked).\n\nApprove anyway?`,
      );
      if (!ok) return;
    }
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

  const TABS: { id: DetailTab; label: string; badge?: string | number }[] = [
    { id: "details", label: "Details" },
    { id: "photos",  label: "Photos",  badge: photoCount || undefined },
    { id: "qc",      label: "QC",      badge: qcPending ? "!" : qcDone ? "✓" : undefined },
  ];

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-sm bg-background border-l border-border shadow-elevated flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <div>
          <div className="font-mono text-xs text-muted-foreground">{job.id}</div>
          <h2 className="font-display text-base font-bold">{job.customerName}</h2>
          <div className="text-xs text-muted-foreground">{job.vehicleModel} · {job.plate}</div>
        </div>
        <button onClick={onClose} className="rounded-md p-1.5 hover:bg-muted">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border shrink-0">
        {TABS.map(({ id, label, badge }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors relative",
              tab === id
                ? "text-primary border-b-2 border-primary -mb-px"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
            {badge !== undefined && (
              <span
                className={cn(
                  "inline-flex items-center justify-center rounded-full text-[10px] font-bold px-1.5 min-w-4.5 h-4.5",
                  badge === "!" ? "bg-warning text-white" :
                  badge === "✓" ? "bg-success text-white" :
                  "bg-primary/15 text-primary",
                )}
              >
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-5">
        {tab === "details" && (
          <DetailsTab job={job} tech={tech} setTech={setTech} bay={bay} setBay={setBay} openShift={openShift} />
        )}
        {tab === "photos" && <PhotosTab job={job} />}
        {tab === "qc"     && <QCTab job={job} />}
      </div>

      {/* Footer actions */}
      <div className="p-5 border-t border-border space-y-2 shrink-0">
        {col?.nextStatus && (
          <button
            onClick={advance}
            className={cn(
              "w-full flex items-center justify-center gap-2 rounded-md py-2.5 text-sm font-semibold shadow-red",
              qcPending
                ? "bg-warning text-white hover:bg-warning/90"
                : "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            <ArrowRight className="h-4 w-4" />
            {col.nextLabel ?? `Move to ${col.nextStatus}`}
            {qcPending && " (QC incomplete)"}
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
        {(job.status === "Ready" || job.status === "Done Today") && job.phone && (
          <a
            href={buildWALink(
              job.phone,
              fillTemplate(notificationSettingsData.jobReadyTemplate, {
                customerName: job.customerName.split(" ")[0],
                vehicle: job.vehicleModel,
                plate: job.plate,
                serviceName: job.serviceName,
                daysSinceVisit: "",
                reviewLink: notificationSettingsData.googleReviewLink,
              }),
            )}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => recordNotification({ type: "job_ready", customerId: job.customerId, jobId: job.id, customerName: job.customerName, phone: job.phone })}
            className="w-full flex items-center justify-center gap-2 rounded-md bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-700"
          >
            <MessageCircle className="h-4 w-4" /> Notify Customer — Car Ready
          </a>
        )}
        <button
          onClick={() => {
            downloadQuotationPDF({
              id: newId("QUO"),
              customerName: job.customerName,
              phone: job.phone,
              plate: job.plate,
              vehicleModel: job.vehicleModel,
              lines: [{ name: job.serviceName, qty: 1, unitPrice: job.price, discount: 0 }],
              notes: job.notes || undefined,
            });
            toast.success("Quotation PDF downloaded");
          }}
          className="w-full flex items-center justify-center gap-2 rounded-md border border-border py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <FileText className="h-3.5 w-3.5" /> Download Quotation PDF
        </button>
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
                  const hasPhotos = (j.photos?.length ?? 0) > 0;
                  const qcPending = j.status === "Awaiting QC" && (j.qcItems ?? []).some((i) => !i.checked);
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
                        <div className="flex items-center gap-1 shrink-0">
                          {hasPhotos && <Camera className="h-3 w-3 text-muted-foreground" />}
                          {qcPending && <ClipboardCheck className="h-3 w-3 text-warning" />}
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      </div>
                      <div className="mt-2 text-[11px] line-clamp-2">{j.serviceName}</div>
                      <div className="mt-2 flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground truncate">{j.tech} · {j.bay}</span>
                        <span className={cn("inline-flex items-center gap-1 font-mono font-semibold shrink-0", overdue ? "text-primary" : "text-muted-foreground")}>
                          <Clock className="h-3 w-3" />
                          {j.elapsedMin}m
                        </span>
                      </div>
                      {col.nextStatus && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            moveJob(j.id, col.nextStatus!);
                            toast.success(`${j.customerName} → ${col.nextStatus}`);
                          }}
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
          <div className="fixed inset-0 z-30 bg-black/20" onClick={() => setSelected(null)} />
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
