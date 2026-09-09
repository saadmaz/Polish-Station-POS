// Guided photo-capture + damage-diagram stepper (Phases 2 and 3 of the
// inspection module — see the inspection spec). Scope is deliberately
// narrow: the 14-slot capture sequence, the cluster-photo transcription
// fields (odometer/fuel/warning lights), and the damage diagram — nothing
// else from Inspection's schema yet. Modeled on book.tsx's hand-rolled
// stepper (Step index + local state, no shared stepper component exists in
// this codebase) and job-sheet.tsx's Sheet/form conventions.
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ref as storageRef, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import {
  captureInspectionPhoto,
  uploadSignaturePng,
  uploadRemoteAckScreenshot,
} from "@/lib/inspection-photos";
import { buildWALink } from "@/lib/notifications";
import { formatDateTime } from "@/lib/date-format";
import { generateInspectionReportPDF } from "@/lib/pdf";
import { DamageDiagram } from "@/components/damage-diagram/damage-diagram";
import {
  SignaturePad,
  SignaturePadClearButton,
  type SignaturePadHandle,
} from "@/components/signature-pad";
import {
  ALWAYS_REQUIRED_PHOTO_SLOTS,
  FUEL_LEVELS,
  INSPECTION_DISCLAIMER_TEXT,
  PENDING_ACKNOWLEDGMENT_THRESHOLD_MS,
  WARNING_LIGHTS,
  damageMarkerRequiresPhoto,
  missingRequiredPhotoSlots,
  type DamageMarker,
  type FuelLevel,
  type Inspection,
  type PhotoSlotKey,
  type WarningLight,
} from "@/lib/inspection";
import type { Job } from "@/lib/job";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Camera, RotateCcw, Loader2, Plus, Check, ShieldAlert } from "lucide-react";

type StepDef = { kind: "photo"; slot: PhotoSlotKey } | { kind: "damage" } | { kind: "review" };

const STEPS: StepDef[] = [
  ...ALWAYS_REQUIRED_PHOTO_SLOTS.map((slot) => ({ kind: "photo" as const, slot })),
  { kind: "damage" },
  { kind: "review" },
];

interface InspectionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job;
  inspection: Inspection;
}

const SLOT_LABELS: Record<PhotoSlotKey, string> = {
  cluster: "Instrument cluster (engine running)",
  front_left_34: "Front three-quarter — left",
  front_right_34: "Front three-quarter — right",
  rear_left_34: "Rear three-quarter — left",
  rear_right_34: "Rear three-quarter — right",
  roof: "Roof / top surface",
  cabin_front: "Driver seat + dash",
  cabin_rear: "Rear seats + floor",
  boot: "Boot (open)",
  wheel_fl: "Wheel — front left",
  wheel_fr: "Wheel — front right",
  wheel_rl: "Wheel — rear left",
  wheel_rr: "Wheel — rear right",
  engine_bay: "Engine bay",
};

const WARNING_LIGHT_LABELS: Record<WarningLight, string> = {
  none: "None lit",
  check_engine: "Check engine",
  abs: "ABS",
  airbag: "Airbag",
  battery: "Battery",
  oil: "Oil",
  tpms: "TPMS",
  brake: "Brake",
  other: "Other",
};

const FUEL_LEVEL_LABELS: Record<FuelLevel, string> = {
  E: "E",
  quarter: "¼",
  half: "½",
  three_quarter: "¾",
  F: "F",
};

// A faint, generic viewfinder guide — not a per-body-type traced outline
// (that's the licensed damage-diagram artwork in a later phase). Just enough
// to hint "frame the whole vehicle inside this box" for the always-required
// exterior slots.
function FrameGuide() {
  return (
    <svg
      viewBox="0 0 100 100"
      className="absolute inset-0 h-full w-full text-muted-foreground/25"
      aria-hidden="true"
    >
      <path
        d="M10 4 H4 V10 M90 4 H96 V10 M10 96 H4 V90 M90 96 H96 V90"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Disclaimer() {
  return (
    <div className="space-y-1 rounded-md border border-warning/40 bg-warning/10 px-3 py-2">
      <p className="flex items-center gap-1 text-[11px] font-semibold text-warning-foreground">
        <ShieldAlert className="h-3 w-3" />
        Unreviewed placeholder — confirm wording with someone qualified before relying on it.
      </p>
      <p className="text-[11px] text-muted-foreground">{INSPECTION_DISCLAIMER_TEXT}</p>
    </div>
  );
}

export function InspectionSheet({ open, onOpenChange, job, inspection }: InspectionSheetProps) {
  const { staff } = useAuth();
  const { updateInspection } = useStore();
  const [draft, setDraft] = useState(inspection);
  const [stepIndex, setStepIndex] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const extraFileInputRef = useRef<HTMLInputElement>(null);

  // Sign-off (Phase 4)
  const [signerName, setSignerName] = useState("");
  const [replyText, setReplyText] = useState("");
  const [pendingAckScreenshotFile, setPendingAckScreenshotFile] = useState<File | null>(null);
  const [sendingAck, setSendingAck] = useState(false);
  const [signing, setSigning] = useState(false);
  const customerSigRef = useRef<SignaturePadHandle | null>(null);
  const inspectorSigRef = useRef<SignaturePadHandle | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(inspection);
      setSignerName(inspection.customerSignature?.signerName ?? inspection.customerSnapshot.name);
      setReplyText(inspection.remoteAck?.replyText ?? "");
      // Resume where the last session left off, not step 1 every time —
      // the first slot still missing a photo, or the Review step if every
      // required slot is already covered.
      const uploadedSlots = new Set(
        inspection.photos.filter((p) => p.uploadedAt != null && p.slotKey).map((p) => p.slotKey),
      );
      const firstIncomplete = ALWAYS_REQUIRED_PHOTO_SLOTS.findIndex(
        (slot) => !uploadedSlots.has(slot),
      );
      // firstIncomplete === -1 (every photo slot done) lands on the damage
      // step next — its index in STEPS is exactly
      // ALWAYS_REQUIRED_PHOTO_SLOTS.length, since damage immediately
      // follows the photo slots.
      setStepIndex(firstIncomplete === -1 ? ALWAYS_REQUIRED_PHOTO_SLOTS.length : firstIncomplete);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, inspection.id]);

  const currentStep = STEPS[stepIndex];
  const isDamageStep = currentStep.kind === "damage";
  const isReviewStep = currentStep.kind === "review";
  const currentSlot = currentStep.kind === "photo" ? currentStep.slot : null;
  const currentPhoto = currentSlot
    ? draft.photos.find((p) => p.slotKey === currentSlot)
    : undefined;
  const extraPhotos = draft.photos.filter((p) => p.slotKey === null);
  const missingSlots = missingRequiredPhotoSlots(draft.photos, false);
  const markersNeedingPhotos = draft.damageMarkers.filter(
    (m) => damageMarkerRequiresPhoto(m.severity) && m.photoIds.length === 0,
  );
  const readyToSign = missingSlots.length === 0 && markersNeedingPhotos.length === 0;

  useEffect(() => {
    const toResolve = draft.photos.filter((p) => !urls[p.id]);
    if (toResolve.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        toResolve.map(async (p) => {
          try {
            const url = await getDownloadURL(storageRef(storage, p.thumbnailStoragePath));
            return [p.id, url] as const;
          } catch {
            return null;
          }
        }),
      );
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const e of entries) if (e) next[e[0]] = e[1];
      if (Object.keys(next).length > 0) setUrls((prev) => ({ ...prev, ...next }));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.photos]);

  function persist(next: Inspection) {
    setDraft(next);
    updateInspection(next);
  }

  async function handleCapture(slotKey: PhotoSlotKey | null, file: File) {
    setUploading(true);
    try {
      const photo = await captureInspectionPhoto(job.id, draft.id, slotKey, file);
      const photos =
        slotKey === null
          ? [...draft.photos, photo]
          : [...draft.photos.filter((p) => p.slotKey !== slotKey), photo];
      let next: Inspection = { ...draft, photos };
      if (slotKey === "cluster") {
        next = { ...next, odometerPhotoId: photo.id };
      }
      persist(next);
      toast.success(slotKey ? "Photo captured" : "Extra photo added");
    } catch (err) {
      console.error("[inspection] photo capture/upload failed:", err);
      toast.error("Couldn't upload that photo, please try again");
    } finally {
      setUploading(false);
    }
  }

  // Damage diagram (Phase 3) — DamageDiagram doesn't know about Storage or
  // Inspection.photos itself; these two callbacks are the only bridge. A
  // damage-marker photo is a free-form (slotKey: null) capture merged into
  // the same Inspection.photos array the guided steps use, so it shares
  // their Storage path convention, offline-queue future, and the urls[]
  // resolution effect above — no separate photo pipeline for damage photos.
  async function uploadDamagePhoto(file: File): Promise<string> {
    const photo = await captureInspectionPhoto(job.id, draft.id, null, file);
    persist({ ...draft, photos: [...draft.photos, photo] });
    return photo.id;
  }

  function handleDamageMarkersChange(markers: DamageMarker[]) {
    persist({ ...draft, damageMarkers: markers });
  }

  // ── Sign-off (Phase 4) ────────────────────────────────────────────────────

  function setInspectedWithCustomer(value: boolean) {
    persist({ ...draft, inspectedWithCustomer: value });
  }

  // Builds the report PDF from `next` (an in-memory Inspection that hasn't
  // been persisted yet) and folds the result onto it — NOT a second write
  // after persisting `next` on its own: once a write sets status to
  // "signed", Firestore rules allow only the signed -> superseded
  // transition on any later write, so a follow-up "attach the report"
  // write would be rejected outright. Generating first and persisting once,
  // with documents.report already included, is the only ordering that
  // works for the two sign actions. Failure here is swallowed (logged +
  // toasted) rather than thrown — a PDF that fails to render must never
  // block or revert the sign-off/acknowledgment-request itself.
  async function withGeneratedReport(next: Inspection): Promise<Inspection> {
    try {
      const result = await generateInspectionReportPDF(next);
      return {
        ...next,
        documents: {
          ...next.documents,
          report: { ...result, generatedAt: new Date().toISOString() },
        },
      };
    } catch (err) {
      console.error("[inspection] report PDF generation failed:", err);
      toast.error("Sign-off saved, but the report PDF couldn't be generated");
      return next;
    }
  }

  // Path B, step 1: hands off to the customer via WhatsApp. Firestore rules
  // require photoRequirementsMet before this transition is even accepted —
  // same gate as reaching "signed" directly.
  async function handleSendForAcknowledgment() {
    if (!draft.customerSnapshot.phone) {
      toast.error("No phone number on file for this customer");
      return;
    }
    setSendingAck(true);
    try {
      const sentAt = new Date().toISOString();
      const next: Inspection = {
        ...draft,
        status: "pending_acknowledgment",
        remoteAck: {
          sentAt,
          channel: "whatsapp",
          replyText: null,
          replyReceivedAt: null,
          screenshotPath: null,
        },
      };
      const withReport = await withGeneratedReport(next);
      persist(withReport);
      const reportUrl = withReport.documents?.report?.url;
      const message = reportUrl
        ? `Hi ${draft.customerSnapshot.name}, please review your vehicle inspection for job ${job.id} here: ${reportUrl}\n\nReply to this message to confirm you've seen it.`
        : `Hi ${draft.customerSnapshot.name}, please review your vehicle inspection for job ${job.id} and reply to this message to confirm you've seen it.`;
      window.open(buildWALink(draft.customerSnapshot.phone, message), "_blank");
    } finally {
      setSendingAck(false);
    }
  }

  // Path A: both signatures captured in one action, straight to "signed".
  async function handleSignPathA() {
    const customerBlob = await customerSigRef.current?.toBlob();
    const inspectorBlob = await inspectorSigRef.current?.toBlob();
    if (!customerBlob || !inspectorBlob || !signerName.trim() || !staff) {
      toast.error("Both signatures and the customer's name are required");
      return;
    }
    setSigning(true);
    try {
      const now = new Date().toISOString();
      const [customerPath, inspectorPath] = await Promise.all([
        uploadSignaturePng(job.id, draft.id, "customer", customerBlob),
        uploadSignaturePng(job.id, draft.id, "inspector", inspectorBlob),
      ]);
      const next: Inspection = {
        ...draft,
        inspectedWithCustomer: true,
        customerSignature: {
          storagePath: customerPath,
          signerName: signerName.trim(),
          signedAt: now,
        },
        inspectorSignature: {
          storagePath: inspectorPath,
          staffId: staff.id,
          staffName: staff.name,
          signedAt: now,
        },
        status: "signed",
      };
      const withReport = await withGeneratedReport(next);
      persist(withReport);
      toast.success("Inspection signed");
    } catch {
      toast.error("Couldn't complete sign-off, please try again");
    } finally {
      setSigning(false);
    }
  }

  // Path B, step 2: the customer's reply plus the inspector's own signature,
  // bundled into one action — this is the only point in Path B where
  // inspectorSignature gets set, since "signed" is never reached before it.
  async function handleAcknowledgeAndSign() {
    const inspectorBlob = await inspectorSigRef.current?.toBlob();
    if (!inspectorBlob || !staff) {
      toast.error("Inspector signature is required");
      return;
    }
    if (!replyText.trim() && !pendingAckScreenshotFile) {
      toast.error("Record the customer's reply text or a screenshot before signing");
      return;
    }
    setSigning(true);
    try {
      const now = new Date().toISOString();
      const [inspectorPath, screenshotPath] = await Promise.all([
        uploadSignaturePng(job.id, draft.id, "inspector", inspectorBlob),
        pendingAckScreenshotFile
          ? uploadRemoteAckScreenshot(job.id, draft.id, pendingAckScreenshotFile)
          : Promise.resolve(draft.remoteAck?.screenshotPath ?? null),
      ]);
      const next: Inspection = {
        ...draft,
        remoteAck: draft.remoteAck
          ? {
              ...draft.remoteAck,
              replyText: replyText.trim() || null,
              replyReceivedAt: now,
              screenshotPath,
            }
          : draft.remoteAck,
        inspectorSignature: {
          storagePath: inspectorPath,
          staffId: staff.id,
          staffName: staff.name,
          signedAt: now,
        },
        status: "signed",
      };
      const withReport = await withGeneratedReport(next);
      persist(withReport);
      toast.success("Inspection signed");
    } catch {
      toast.error("Couldn't complete sign-off, please try again");
    } finally {
      setSigning(false);
    }
  }

  function toggleWarningLight(light: WarningLight) {
    const current = draft.warningLights;
    let next: WarningLight[];
    if (light === "none") {
      next = current.includes("none") ? [] : ["none"];
    } else {
      const withoutNone = current.filter((l) => l !== "none");
      next = withoutNone.includes(light)
        ? withoutNone.filter((l) => l !== light)
        : [...withoutNone, light];
    }
    persist({ ...draft, warningLights: next });
  }

  const canGoNext = !currentSlot || !!currentPhoto;

  // Once signed (or superseded), the document is immutable — Firestore
  // rules already reject any further write, but the UI shouldn't offer
  // editable controls that would just fail silently against those rules.
  // A simple read-only summary replaces the whole stepper instead.
  if (draft.status === "signed" || draft.status === "superseded") {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-lg flex flex-col overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Inspection · {job.id}</SheetTitle>
            <SheetDescription>
              {draft.status === "signed" ? "Signed — locked" : "Superseded by a later inspection"}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-3 py-4 text-sm">
            <div className="flex items-center gap-2 rounded-md bg-success/10 border border-success/30 px-3 py-2 text-success">
              <Check className="h-4 w-4" />
              Signed by {draft.inspectorSignature?.staffName ?? "—"} on{" "}
              {draft.inspectorSignature ? formatDateTime(draft.inspectorSignature.signedAt) : "—"}
            </div>
            {draft.customerSignature && (
              <p className="text-muted-foreground">
                Customer signature: {draft.customerSignature.signerName} ·{" "}
                {formatDateTime(draft.customerSignature.signedAt)}
              </p>
            )}
            {draft.remoteAck?.replyReceivedAt && (
              <p className="text-muted-foreground">
                Remote acknowledgment received {formatDateTime(draft.remoteAck.replyReceivedAt)}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="mt-auto rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Close
          </button>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Inspection · {job.id}</SheetTitle>
          <SheetDescription>
            {isReviewStep
              ? "Review"
              : isDamageStep
                ? `Step ${stepIndex + 1} of ${STEPS.length - 1} — Damage diagram`
                : `Step ${stepIndex + 1} of ${STEPS.length - 1} — ${SLOT_LABELS[currentSlot!]}`}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-4 py-4">
          {/* progress dots — same idea as book.tsx's ProgressBar, simplified to dots since there are 14 steps (13 photo slots + damage), not 5 */}
          <div className="flex flex-wrap gap-1">
            {STEPS.filter((s) => s.kind !== "review").map((step, i) => {
              const done =
                step.kind === "photo"
                  ? draft.photos.some((p) => p.slotKey === step.slot)
                  : draft.damageMarkers.length > 0; // soft indicator only — zero damage is a valid outcome
              return (
                <div
                  key={step.kind === "photo" ? step.slot : "damage"}
                  className={`h-1.5 flex-1 rounded-full ${
                    i === stepIndex ? "bg-primary" : done ? "bg-success" : "bg-muted"
                  }`}
                />
              );
            })}
          </div>

          {!isReviewStep && currentSlot && (
            <>
              <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-dashed border-border bg-muted/40">
                <FrameGuide />
                {currentPhoto && urls[currentPhoto.id] ? (
                  <img
                    src={urls[currentPhoto.id]}
                    alt={SLOT_LABELS[currentSlot]}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                    {uploading ? <Loader2 className="h-6 w-6 animate-spin" /> : "No photo yet"}
                  </div>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void handleCapture(currentSlot, file);
                }}
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2.5 text-sm font-medium hover:bg-accent disabled:opacity-60"
              >
                {currentPhoto ? <RotateCcw className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
                {currentPhoto ? "Retake" : "Take Photo"}
              </button>

              {currentSlot === "cluster" && (
                <div className="space-y-3 rounded-md border border-border bg-card p-3">
                  <p className="text-xs text-muted-foreground">
                    Read off the cluster photo above — these are a transcription of that one shot,
                    not a separate claim.
                  </p>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Odometer (km)</label>
                    <input
                      type="number"
                      min={0}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                      value={draft.odometer || ""}
                      onChange={(e) => persist({ ...draft, odometer: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Fuel level</label>
                    <div className="flex gap-1.5">
                      {FUEL_LEVELS.map((lvl) => (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => persist({ ...draft, fuelLevel: lvl })}
                          className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-semibold ${
                            draft.fuelLevel === lvl
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-input bg-background hover:bg-accent"
                          }`}
                        >
                          {FUEL_LEVEL_LABELS[lvl]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Warning lights</label>
                    <div className="flex flex-wrap gap-1.5">
                      {WARNING_LIGHTS.map((light) => (
                        <button
                          key={light}
                          type="button"
                          onClick={() => toggleWarningLight(light)}
                          className={`rounded-md border px-2 py-1 text-xs ${
                            draft.warningLights.includes(light)
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-input bg-background hover:bg-accent"
                          }`}
                        >
                          {WARNING_LIGHT_LABELS[light]}
                        </button>
                      ))}
                    </div>
                    {draft.warningLights.length === 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        Select at least one — "None lit" if nothing is on.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {isDamageStep && (
            <DamageDiagram
              bodyType={draft.vehicleSnapshot.bodyType}
              markers={draft.damageMarkers}
              onMarkersChange={handleDamageMarkersChange}
              uploadPhoto={uploadDamagePhoto}
              getPhotoUrl={(id) => urls[id]}
            />
          )}

          {isReviewStep && (
            <div className="space-y-3">
              {missingSlots.length === 0 ? (
                <div className="flex items-center gap-2 rounded-md bg-success/10 border border-success/30 px-3 py-2 text-sm text-success">
                  <Check className="h-4 w-4" />
                  All required photos captured.
                </div>
              ) : (
                <div className="rounded-md bg-muted border border-border px-3 py-2 text-xs text-muted-foreground">
                  Still missing: {missingSlots.map((s) => SLOT_LABELS[s]).join(", ")}
                </div>
              )}
              {markersNeedingPhotos.length === 0 ? (
                <div className="flex items-center gap-2 rounded-md bg-success/10 border border-success/30 px-3 py-2 text-sm text-success">
                  <Check className="h-4 w-4" />
                  Every moderate/severe damage marker has a linked photo.
                </div>
              ) : (
                <div className="rounded-md bg-muted border border-border px-3 py-2 text-xs text-muted-foreground">
                  Markers still needing a photo: #
                  {markersNeedingPhotos.map((m) => m.seq).join(", #")}
                </div>
              )}

              <div className="space-y-3 rounded-xl border border-border bg-card p-4">
                <h3 className="text-sm font-semibold">Sign-off</h3>
                {!readyToSign && (
                  <p className="text-xs text-muted-foreground">
                    Finish the items above before signing.
                  </p>
                )}

                {readyToSign && draft.status === "draft" && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">
                      Was the customer present for this inspection?
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setInspectedWithCustomer(true)}
                        className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-semibold ${
                          draft.inspectedWithCustomer
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-input bg-background hover:bg-accent"
                        }`}
                      >
                        Yes, present
                      </button>
                      <button
                        type="button"
                        onClick={() => setInspectedWithCustomer(false)}
                        className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-semibold ${
                          !draft.inspectedWithCustomer
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-input bg-background hover:bg-accent"
                        }`}
                      >
                        No, remote
                      </button>
                    </div>
                  </div>
                )}

                {readyToSign && draft.status === "draft" && draft.inspectedWithCustomer && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Customer name *</label>
                      <input
                        value={signerName}
                        onChange={(e) => setSignerName(e.target.value)}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">Customer signature</label>
                        <SignaturePadClearButton onClick={() => customerSigRef.current?.clear()} />
                      </div>
                      <SignaturePad onHandleReady={(h) => (customerSigRef.current = h)} />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">Inspector signature</label>
                        <SignaturePadClearButton onClick={() => inspectorSigRef.current?.clear()} />
                      </div>
                      <SignaturePad onHandleReady={(h) => (inspectorSigRef.current = h)} />
                    </div>
                    <Disclaimer />
                    <button
                      type="button"
                      disabled={signing}
                      onClick={() => void handleSignPathA()}
                      className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-red hover:bg-primary/90 disabled:opacity-60"
                    >
                      {signing ? "Signing…" : "Complete & Sign"}
                    </button>
                  </div>
                )}

                {readyToSign &&
                  draft.status === "draft" &&
                  draft.inspectedWithCustomer === false && (
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">
                        Sends a WhatsApp message asking the customer to confirm they've reviewed the
                        inspection. Work on this job can't start while this sits unanswered past{" "}
                        {PENDING_ACKNOWLEDGMENT_THRESHOLD_MS / 3600000} hours.
                      </p>
                      <Disclaimer />
                      <button
                        type="button"
                        disabled={sendingAck}
                        onClick={() => void handleSendForAcknowledgment()}
                        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-red hover:bg-primary/90 disabled:opacity-60"
                      >
                        {sendingAck ? "Sending…" : "Send for Acknowledgment"}
                      </button>
                    </div>
                  )}

                {draft.status === "pending_acknowledgment" && (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Awaiting customer reply since{" "}
                      {draft.remoteAck ? formatDateTime(draft.remoteAck.sentAt) : "—"}.
                    </p>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Customer's reply</label>
                      <textarea
                        rows={2}
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder="Paste or describe their reply…"
                        className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Or a screenshot of the reply</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setPendingAckScreenshotFile(e.target.files?.[0] ?? null)}
                        className="w-full text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">Inspector signature</label>
                        <SignaturePadClearButton onClick={() => inspectorSigRef.current?.clear()} />
                      </div>
                      <SignaturePad onHandleReady={(h) => (inspectorSigRef.current = h)} />
                    </div>
                    <button
                      type="button"
                      disabled={signing}
                      onClick={() => void handleAcknowledgeAndSign()}
                      className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-red hover:bg-primary/90 disabled:opacity-60"
                    >
                      {signing ? "Signing…" : "Mark Acknowledged & Sign"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Free-form extra photos — available at any step, per spec. */}
          <div className="mt-auto space-y-2 border-t border-border pt-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Extra photos</label>
              <input
                ref={extraFileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void handleCapture(null, file);
                }}
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => extraFileInputRef.current?.click()}
                className="flex items-center gap-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-60"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </button>
            </div>
            {extraPhotos.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {extraPhotos.map((p) => (
                  <div
                    key={p.id}
                    className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-border"
                  >
                    {urls[p.id] && (
                      <img src={urls[p.id]} alt="" className="h-full w-full object-cover" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
              disabled={stepIndex === 0}
              className="flex-1 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-40"
            >
              Back
            </button>
            {isReviewStep ? (
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-red hover:bg-primary/90"
              >
                Close
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStepIndex((i) => Math.min(STEPS.length - 1, i + 1))}
                disabled={!canGoNext}
                className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-red hover:bg-primary/90 disabled:opacity-40"
              >
                Next
              </button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
