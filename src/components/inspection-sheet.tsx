// Guided photo-capture stepper (Phase 2 of the inspection module — see the
// inspection spec). Scope is deliberately narrow: the 14-slot capture
// sequence plus the cluster-photo transcription fields (odometer/fuel/
// warning lights), nothing else from Inspection's schema yet. Modeled on
// book.tsx's hand-rolled stepper (Step index + local state, no shared
// stepper component exists in this codebase) and job-sheet.tsx's Sheet/form
// conventions.
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ref as storageRef, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";
import { useStore } from "@/lib/store";
import { captureInspectionPhoto } from "@/lib/inspection-photos";
import {
  ALWAYS_REQUIRED_PHOTO_SLOTS,
  FUEL_LEVELS,
  WARNING_LIGHTS,
  missingRequiredPhotoSlots,
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
import { Camera, RotateCcw, Loader2, Plus, Check } from "lucide-react";

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

export function InspectionSheet({ open, onOpenChange, job, inspection }: InspectionSheetProps) {
  const { updateInspection } = useStore();
  const [draft, setDraft] = useState(inspection);
  const [stepIndex, setStepIndex] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const extraFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setDraft(inspection);
      setStepIndex(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, inspection.id]);

  const steps = ALWAYS_REQUIRED_PHOTO_SLOTS;
  const isReviewStep = stepIndex === steps.length;
  const currentSlot = isReviewStep ? null : steps[stepIndex];
  const currentPhoto = currentSlot
    ? draft.photos.find((p) => p.slotKey === currentSlot)
    : undefined;
  const extraPhotos = draft.photos.filter((p) => p.slotKey === null);
  const missingSlots = missingRequiredPhotoSlots(draft.photos, false);

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
    } catch {
      toast.error("Couldn't upload that photo, please try again");
    } finally {
      setUploading(false);
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Inspection · {job.id}</SheetTitle>
          <SheetDescription>
            {isReviewStep
              ? "Review"
              : `Step ${stepIndex + 1} of ${steps.length} — ${SLOT_LABELS[currentSlot!]}`}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-4 py-4">
          {/* progress dots — same idea as book.tsx's ProgressBar, simplified to dots since there are 13 steps, not 5 */}
          <div className="flex flex-wrap gap-1">
            {steps.map((slot, i) => {
              const done = draft.photos.some((p) => p.slotKey === slot);
              return (
                <div
                  key={slot}
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
                onClick={() => setStepIndex((i) => Math.min(steps.length, i + 1))}
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
