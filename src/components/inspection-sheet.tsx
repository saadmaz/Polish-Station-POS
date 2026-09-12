// Guided intake + damage-diagram + sign-off stepper (Phases 2-4 of the
// inspection module — see the inspection spec), modeled on book.tsx's
// hand-rolled stepper (Step index + local state, no shared stepper
// component exists in this codebase) and job-sheet.tsx's Sheet/form
// conventions.
//
// Photo capture (the guided per-slot photos, damage-marker evidence photos,
// remote-ack screenshots) is temporarily disabled store-wide — see
// PHOTO_CAPTURE_ENABLED in inspection.ts for why and how to bring it back.
// This file only asks the non-photo questions: odometer/fuel/warning
// lights, the damage diagram (markers, no linked photos), and sign-off.
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { uploadSignaturePng } from "@/lib/inspection-photos";
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
  FUEL_LEVELS,
  INSPECTION_DISCLAIMER_TEXT,
  PENDING_ACKNOWLEDGMENT_THRESHOLD_MS,
  WARNING_LIGHTS,
  type DamageMarker,
  type FuelLevel,
  type Inspection,
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
import { Check, ShieldAlert, FileText } from "lucide-react";

type StepDef = { kind: "intake" } | { kind: "damage" } | { kind: "review" };

const STEPS: StepDef[] = [{ kind: "intake" }, { kind: "damage" }, { kind: "review" }];

interface InspectionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job;
  inspection: Inspection;
}

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

  // Sign-off (Phase 4)
  const [signerName, setSignerName] = useState("");
  const [replyText, setReplyText] = useState("");
  const [sendingAck, setSendingAck] = useState(false);
  const [signing, setSigning] = useState(false);
  const customerSigRef = useRef<SignaturePadHandle | null>(null);
  const inspectorSigRef = useRef<SignaturePadHandle | null>(null);
  // Guards handleSignPathA/handleAcknowledgeAndSign/handleSendForAcknowledgment
  // against a second invocation racing the first. `signing`/`sendingAck`
  // state alone doesn't do this: both handlers await at least one promise
  // (toBlob(), a Storage upload) before their first setState call, so a
  // second click landing in that window fires the handler again before
  // React has re-rendered the button as disabled. Two concurrent sign-off
  // attempts against the same draft then race each other's Storage upload
  // and Firestore write — the loser gets rejected (storage.rules/
  // firestore.rules both reject writes to the same doc once the other side
  // has already moved it out of "draft"), surfacing as an inexplicable
  // "couldn't complete sign-off" even though the visible signatures were
  // fine and the first click actually went through. A plain ref (checked
  // and set synchronously, before any await) closes that window; `signing`/
  // `sendingAck` React state remains just for the button's own visual
  // "…ing" label.
  const actionInFlightRef = useRef(false);

  useEffect(() => {
    if (open) {
      setSignerName(inspection.customerSignature?.signerName ?? inspection.customerSnapshot.name);
      setReplyText(inspection.remoteAck?.replyText ?? "");
      setStepIndex(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, inspection.id]);

  // Separate from the effect above on purpose: this one re-syncs `draft`
  // to the live `inspection` prop on *every* change to it while the sheet
  // stays open, not only when the sheet first opens or switches to a
  // different inspection.id. The parent now derives that prop fresh from
  // useStore()'s onSnapshot-backed array every render, so this is what
  // actually keeps `draft` from going stale — the bug this fixes was a
  // sheet still showing draft/pending_acknowledgment as editable, and
  // inviting another sign-off attempt, well after the real document had
  // already moved to signed/superseded some other way (a prior attempt
  // that actually succeeded, a supersession, anything) — every further
  // write then correctly got rejected by storage.rules/firestore.rules,
  // over and over, with no visible way out short of a manual reload.
  // Harmless when it's just this client's own write echoing back (same
  // content either way); the one place this can't run is stepIndex/
  // signerName/replyText, which are session-local UI state that a live
  // update should never reset out from under whatever the user is doing.
  useEffect(() => {
    if (open) setDraft(inspection);
    // Deliberately keyed on updatedAt, not the `inspection` object itself —
    // the parent derives a brand-new object reference every render, so
    // depending on the object would re-run (and re-setDraft) on every
    // render regardless of whether the document actually changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, inspection.id, inspection.updatedAt]);

  const currentStep = STEPS[stepIndex];
  const isIntakeStep = currentStep.kind === "intake";
  const isDamageStep = currentStep.kind === "damage";
  const isReviewStep = currentStep.kind === "review";

  function persist(next: Inspection) {
    setDraft(next);
    updateInspection(next);
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
  // always true while PHOTO_CAPTURE_ENABLED is off (see inspection.ts).
  async function handleSendForAcknowledgment() {
    if (actionInFlightRef.current) return;
    if (!draft.customerSnapshot.phone) {
      toast.error("No phone number on file for this customer");
      return;
    }
    actionInFlightRef.current = true;
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
      actionInFlightRef.current = false;
    }
  }

  // Path A: both signatures captured in one action, straight to "signed".
  async function handleSignPathA() {
    if (actionInFlightRef.current) return;
    actionInFlightRef.current = true;
    try {
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
    } finally {
      actionInFlightRef.current = false;
    }
  }

  // Path B, step 2: the customer's reply plus the inspector's own signature,
  // bundled into one action — this is the only point in Path B where
  // inspectorSignature gets set, since "signed" is never reached before it.
  async function handleAcknowledgeAndSign() {
    if (actionInFlightRef.current) return;
    actionInFlightRef.current = true;
    try {
      const inspectorBlob = await inspectorSigRef.current?.toBlob();
      if (!inspectorBlob || !staff) {
        toast.error("Inspector signature is required");
        return;
      }
      if (!replyText.trim()) {
        toast.error("Record the customer's reply text before signing");
        return;
      }
      setSigning(true);
      try {
        const now = new Date().toISOString();
        const inspectorPath = await uploadSignaturePng(job.id, draft.id, "inspector", inspectorBlob);
        const next: Inspection = {
          ...draft,
          remoteAck: draft.remoteAck
            ? { ...draft.remoteAck, replyText: replyText.trim(), replyReceivedAt: now }
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
    } finally {
      actionInFlightRef.current = false;
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
            {draft.documents?.report ? (
              <a
                href={draft.documents.report.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
              >
                <FileText className="h-3.5 w-3.5" />
                View Inspection Report (PDF)
              </a>
            ) : (
              <p className="text-xs text-muted-foreground">
                No report PDF was generated for this inspection — it's usually built
                automatically right when sign-off completes, so this means that step failed at
                the time (a toast would have said so). Once signed, it can't be regenerated from
                here; a Manager can check the Storage/permissions setup.
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
                : `Step ${stepIndex + 1} of ${STEPS.length - 1} — Vehicle condition`}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-4 py-4">
          {/* progress dots — same idea as book.tsx's ProgressBar, simplified to dots */}
          <div className="flex flex-wrap gap-1">
            {STEPS.filter((s) => s.kind !== "review").map((step, i) => {
              const done =
                step.kind === "intake"
                  ? draft.odometer > 0 || draft.warningLights.length > 0
                  : draft.damageMarkers.length > 0; // soft indicator only — zero damage is a valid outcome
              return (
                <div
                  key={step.kind}
                  className={`h-1.5 flex-1 rounded-full ${
                    i === stepIndex ? "bg-primary" : done ? "bg-success" : "bg-muted"
                  }`}
                />
              );
            })}
          </div>

          {isIntakeStep && (
            <div className="space-y-3 rounded-md border border-border bg-card p-3">
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

          {isDamageStep && (
            <DamageDiagram
              bodyType={draft.vehicleSnapshot.bodyType}
              markers={draft.damageMarkers}
              onMarkersChange={handleDamageMarkersChange}
            />
          )}

          {isReviewStep && (
            <div className="space-y-3">
              <div className="space-y-3 rounded-xl border border-border bg-card p-4">
                <h3 className="text-sm font-semibold">Sign-off</h3>

                {draft.status === "draft" && (
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

                {draft.status === "draft" && draft.inspectedWithCustomer && (
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

                {draft.status === "draft" && draft.inspectedWithCustomer === false && (
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
                className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-red hover:bg-primary/90"
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
