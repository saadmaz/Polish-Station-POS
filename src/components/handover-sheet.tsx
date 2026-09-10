// Delivery handover (Phase 7 — closes the expectations loop opened by
// Inspection.customerPriority). Opens in place of an immediate "ready ->
// delivered" transition; confirming inside does both the handover write
// and the actual transition together. Modeled on inspection-sheet.tsx's
// Sheet/form conventions, but much smaller — one screen, no stepper, no
// draft state (see Job.handover's header comment: this either completes
// and the job delivers, or neither happens).
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import {
  captureHandoverPhoto,
  uploadHandoverAcceptancePng,
  type HandoverPhotoSlot,
} from "@/lib/job-handover-photos";
import {
  SignaturePad,
  SignaturePadClearButton,
  type SignaturePadHandle,
} from "@/components/signature-pad";
import { latestNonSupersededInspection } from "@/lib/inspection";
import type { Job } from "@/lib/job";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Camera, RotateCcw, AlertTriangle } from "lucide-react";

interface HandoverSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job;
}

const HANDOVER_SLOTS: HandoverPhotoSlot[] = [
  "front_left_34",
  "front_right_34",
  "rear_left_34",
  "rear_right_34",
];

const HANDOVER_SLOT_LABELS: Record<HandoverPhotoSlot, string> = {
  front_left_34: "Front — left",
  front_right_34: "Front — right",
  rear_left_34: "Rear — left",
  rear_right_34: "Rear — right",
};

export function HandoverSheet({ open, onOpenChange, job }: HandoverSheetProps) {
  const { staff } = useAuth();
  const { inspections, transitionJobStatus } = useStore();
  const [photos, setPhotos] = useState<
    Partial<Record<HandoverPhotoSlot, { storagePath: string; capturedAt: string }>>
  >({});
  const [previewUrls, setPreviewUrls] = useState<Partial<Record<HandoverPhotoSlot, string>>>({});
  const [signerName, setSignerName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const sigRef = useRef<SignaturePadHandle | null>(null);

  useEffect(() => {
    if (open) {
      setPhotos({});
      setPreviewUrls({});
      setSignerName(job.customerSnapshot?.name ?? job.customerName);
    }
  }, [open, job.id, job.customerSnapshot?.name, job.customerName]);

  // Local blob-URL previews only exist for this sheet's lifetime — revoke
  // them on close/unmount rather than leaking, unlike inspection-sheet.tsx's
  // photos, which always resolve to real Storage URLs and have nothing to
  // revoke.
  useEffect(() => {
    return () => {
      Object.values(previewUrls).forEach((url) => url && URL.revokeObjectURL(url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inspection = latestNonSupersededInspection(inspections, job.id);
  const signedInspection = inspection?.status === "signed" ? inspection : null;
  const faultySystems = signedInspection?.systemsCheck.filter((s) => s.state === "faulty") ?? [];
  const allPhotosCaptured = HANDOVER_SLOTS.every((slot) => photos[slot]);

  async function handleCapture(slotKey: HandoverPhotoSlot, file: File) {
    setUploading(true);
    try {
      const result = await captureHandoverPhoto(job.id, slotKey, file);
      setPhotos((prev) => ({ ...prev, [slotKey]: result }));
      setPreviewUrls((prev) => ({ ...prev, [slotKey]: URL.createObjectURL(file) }));
      toast.success("Photo captured");
    } catch {
      toast.error("Couldn't upload that photo, please try again");
    } finally {
      setUploading(false);
    }
  }

  async function handleConfirm() {
    const sigBlob = await sigRef.current?.toBlob();
    if (!allPhotosCaptured || !sigBlob || !signerName.trim() || !staff) {
      toast.error("All 4 photos and the customer's signature are required");
      return;
    }
    setConfirming(true);
    try {
      const signaturePath = await uploadHandoverAcceptancePng(job.id, sigBlob);
      const now = new Date().toISOString();
      // Passed as transitionJobStatus's extraFields, not a separate
      // updateJob() call before it — that raced: transitionJobStatus reads
      // `job` from the store's local cache, which wouldn't yet reflect an
      // updateJob() write still in flight, so its own batch.set() would
      // overwrite the handover field right back out.
      await transitionJobStatus(job.id, "delivered", {
        handover: {
          afterPhotos: HANDOVER_SLOTS.map((slot) => ({ slotKey: slot, ...photos[slot]! })),
          customerAcceptance: {
            storagePath: signaturePath,
            signerName: signerName.trim(),
            signedAt: now,
          },
          completedById: staff.id,
          completedByName: staff.name,
          completedAt: now,
        },
      });
      toast.success("Job delivered");
      onOpenChange(false);
    } catch {
      toast.error("Couldn't complete delivery, please try again");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Delivery Handover · {job.id}</SheetTitle>
          <SheetDescription>Review with the customer before marking delivered.</SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-4 py-4">
          {signedInspection ? (
            <>
              <div className="rounded-md border border-warning/40 bg-warning/10 p-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-warning-foreground">
                  Customer priority
                </h3>
                <p className="mt-1 text-sm text-foreground">{signedInspection.customerPriority}</p>
              </div>
              {signedInspection.scopeExclusions && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Scope exclusions
                  </h4>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {signedInspection.scopeExclusions}
                  </p>
                </div>
              )}
              {faultySystems.length > 0 && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                  <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Faulty at intake — point these out before the customer does
                  </h4>
                  <ul className="mt-1.5 list-disc pl-4 text-sm text-foreground">
                    {faultySystems.map((s) => (
                      <li key={s.key}>
                        {s.key.replace(/_/g, " ")}
                        {s.note ? ` — ${s.note}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <p className="rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
              No inspection on file for this job.
            </p>
          )}

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">After photos *</h3>
            <div className="grid grid-cols-2 gap-2">
              {HANDOVER_SLOTS.map((slot) => (
                <div key={slot} className="space-y-1">
                  <div className="relative aspect-square overflow-hidden rounded-md border border-dashed border-border bg-muted/40">
                    {previewUrls[slot] ? (
                      <img
                        src={previewUrls[slot]}
                        alt={HANDOVER_SLOT_LABELS[slot]}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center px-2 text-center text-[11px] text-muted-foreground">
                        {HANDOVER_SLOT_LABELS[slot]}
                      </div>
                    )}
                  </div>
                  <label className="flex cursor-pointer items-center justify-center gap-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs font-medium hover:bg-accent">
                    {photos[slot] ? (
                      <RotateCcw className="h-3 w-3" />
                    ) : (
                      <Camera className="h-3 w-3" />
                    )}
                    {photos[slot] ? "Retake" : "Capture"}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      disabled={uploading}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void handleCapture(slot, file);
                      }}
                    />
                  </label>
                </div>
              ))}
            </div>
          </div>

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
              <label className="text-sm font-medium">Customer acceptance signature *</label>
              <SignaturePadClearButton onClick={() => sigRef.current?.clear()} />
            </div>
            <SignaturePad onHandleReady={(h) => (sigRef.current = h)} />
          </div>

          <button
            type="button"
            disabled={confirming || !allPhotosCaptured}
            onClick={() => void handleConfirm()}
            className="mt-auto w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-red hover:bg-primary/90 disabled:opacity-60"
          >
            {confirming ? "Completing…" : "Confirm Delivery"}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
