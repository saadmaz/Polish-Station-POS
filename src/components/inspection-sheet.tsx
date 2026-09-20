// Guided intake + damage-diagram + sign-off stepper (Phases 2-4 of the
// inspection module — see the inspection spec), modeled on book.tsx's
// hand-rolled stepper (Step index + local state, no shared stepper
// component exists in this codebase) and job-sheet.tsx's Sheet/form
// conventions.
//
// Photo capture (the guided per-slot photos, damage-marker evidence photos)
// is temporarily disabled store-wide — see PHOTO_CAPTURE_ENABLED in
// inspection.ts for why and how to bring it back. This file only asks the
// non-photo questions: odometer/fuel/warning lights, the damage diagram
// (markers, no linked photos), and sign-off.
//
// Sign-off (operator-requested, 2026-09-18) no longer captures a customer or
// inspector signature, or waits on a WhatsApp acknowledgment reply — see
// inspection.ts's LEGAL_INSPECTION_TRANSITIONS comment. Completing an
// inspection is now one staff action that moves it straight to "signed".
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { formatDateTime } from "@/lib/date-format";
import { generateInspectionReportPDF } from "@/lib/pdf";
import { DamageDiagram } from "@/components/damage-diagram/damage-diagram";
import {
  FUEL_LEVELS,
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
import { Check, FileText } from "lucide-react";

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

export function InspectionSheet({ open, onOpenChange, job, inspection }: InspectionSheetProps) {
  const { updateInspection } = useStore();
  const [draft, setDraft] = useState(inspection);
  const [stepIndex, setStepIndex] = useState(0);

  // Sign-off
  const [completing, setCompleting] = useState(false);
  // Guards handleCompleteInspection against a second invocation racing the
  // first. `completing` state alone doesn't do this: the handler awaits at
  // least one promise (the report PDF) before its first setState call, so a
  // second click landing in that window fires the handler again before
  // React has re-rendered the button as disabled. Two concurrent completions
  // against the same draft then race each other's Firestore write — the
  // loser gets rejected (firestore.rules rejects a write to the same doc
  // once the other side has already moved it out of "draft"), surfacing as
  // an inexplicable "couldn't complete the inspection" even though the first
  // click actually went through. A plain ref (checked and set synchronously,
  // before any await) closes that window; `completing` React state remains
  // just for the button's own visual "…ing" label.
  const actionInFlightRef = useRef(false);

  useEffect(() => {
    if (open) setStepIndex(0);
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
  // content either way); the one place this can't run is stepIndex, which is
  // session-local UI state that a live update should never reset out from
  // under whatever the user is doing.
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

  // ── Sign-off ──────────────────────────────────────────────────────────────
  // One staff action, no customer or inspector signature and no WhatsApp
  // wait — moves "draft" straight to "signed". Firestore rules require
  // photoRequirementsMet before this transition is accepted — always true
  // while PHOTO_CAPTURE_ENABLED is off (see inspection.ts).
  async function handleCompleteInspection() {
    if (actionInFlightRef.current) return;
    actionInFlightRef.current = true;
    setCompleting(true);
    try {
      const next: Inspection = { ...draft, status: "signed" };
      // Builds the report PDF from `next` (an in-memory Inspection that
      // hasn't been persisted yet) and folds the result onto it — NOT a
      // second write after persisting `next` on its own: once a write sets
      // status to "signed", Firestore rules allow only the signed ->
      // superseded transition on any later write, so a follow-up "attach
      // the report" write would be rejected outright. Generating first and
      // persisting once, with documents.report already included, is the
      // only ordering that works. Failure here is swallowed (logged +
      // toasted) rather than thrown — a PDF that fails to render must never
      // block or revert completing the inspection itself.
      let withReport = next;
      try {
        const result = await generateInspectionReportPDF(next, job);
        withReport = {
          ...next,
          documents: {
            ...next.documents,
            report: { ...result, generatedAt: new Date().toISOString() },
          },
        };
      } catch (err) {
        console.error("[inspection] report PDF generation failed:", err);
        toast.error("Inspection completed, but the report PDF couldn't be generated");
      }
      persist(withReport);
      toast.success("Inspection completed");
    } catch {
      toast.error("Couldn't complete the inspection, please try again");
    } finally {
      setCompleting(false);
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
              Completed by {draft.updatedByName || "—"} on {formatDateTime(draft.updatedAt)}
            </div>
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
                No report PDF was generated for this inspection — it's usually built automatically
                right when sign-off completes, so this means that step failed at the time (a toast
                would have said so). Once signed, it can't be regenerated from here; a Manager can
                check the Storage/permissions setup.
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
            <form
              onSubmit={(e) => {
                e.preventDefault();
                // Same action as the "Next" button below, not
                // handleCompleteInspection — this step's own form has no
                // submit button of its own for Enter to target, and
                // "Complete Inspection" isn't even rendered until the
                // review step, so there's no risk of Enter here skipping
                // straight to finishing the inspection.
                setStepIndex((i) => Math.min(STEPS.length - 1, i + 1));
              }}
              className="space-y-3 rounded-md border border-border bg-card p-3"
            >
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
            </form>
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
                <p className="text-xs text-muted-foreground">
                  No customer or inspector signature is collected — completing the inspection
                  records it under your staff account and locks it.
                </p>
                <button
                  type="button"
                  disabled={completing}
                  onClick={() => void handleCompleteInspection()}
                  className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-red hover:bg-primary/90 disabled:opacity-60"
                >
                  {completing ? "Completing…" : "Complete Inspection"}
                </button>
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
