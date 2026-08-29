// Shift open / close / reconciliation modal.
// Open-shift: staff selector, denomination counter → opening balance.
// Close-shift: closing denomination count, variance calculation, verifier sign-off.

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Lock, Unlock, CheckCircle2, XCircle, DollarSign, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { isManagerOrAbove } from "@/lib/permissions";
import { useStaffList } from "@/lib/use-staff-list";
import { cn } from "@/lib/utils";
import { sumShiftPaymentsByMethod } from "@/lib/db";
import type { Shift } from "@/lib/db";
import { formatCurrency } from "@/lib/currency";
import { formatTime, formatShortDate } from "@/lib/date-format";

// ─── Denomination definitions ─────────────────────────────────────────────────

const DENOMS = [
  { label: "LKR 5,000", value: 5000, key: "5000" },
  { label: "LKR 1,000", value: 1000, key: "1000" },
  { label: "LKR 500", value: 500, key: "500" },
  { label: "LKR 100", value: 100, key: "100" },
  { label: "LKR 50", value: 50, key: "50" },
  { label: "LKR 20", value: 20, key: "20" },
  { label: "Coins (total value)", value: 1, key: "coins" },
] as const;

type DenomKey = (typeof DENOMS)[number]["key"];

function calcBalance(denoms: Record<string, number>): number {
  return DENOMS.reduce((sum, d) => sum + (denoms[d.key] ?? 0) * d.value, 0);
}

function DenomCounter({
  denoms,
  onChange,
}: {
  denoms: Record<string, number>;
  onChange: (k: string, v: number) => void;
}) {
  return (
    <div className="space-y-2">
      {DENOMS.map((d) => (
        <div key={d.key} className="flex items-center justify-between gap-2">
          <span className="w-24 text-sm text-muted-foreground shrink-0 sm:w-36">{d.label}</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              className="min-h-9 w-20 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-ring sm:w-24"
              value={denoms[d.key] ?? ""}
              placeholder="0"
              onChange={(e) => onChange(d.key, Number(e.target.value) || 0)}
            />
            <span className="hidden text-xs text-muted-foreground font-mono w-28 text-right sm:inline">
              = {formatCurrency((denoms[d.key] ?? 0) * d.value)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Open Shift panel ─────────────────────────────────────────────────────────

function OpenShiftPanel({ onClose }: { onClose: () => void }) {
  const { openShiftFn } = useStore();
  const { staff: activeStaff } = useAuth();
  const { staffList } = useStaffList();
  const [staffId, setStaffId] = useState(activeStaff?.id ?? "");
  const [denoms, setDenoms] = useState<Record<DenomKey, number>>({} as Record<DenomKey, number>);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const balance = calcBalance(denoms);
  const selectedStaff = staffList.find((s) => s.id === staffId);

  function handleDenom(k: string, v: number) {
    setDenoms((d) => ({ ...d, [k]: v }));
  }

  async function handleOpen() {
    if (!staffId) {
      toast.error("Select the opening staff member");
      return;
    }
    setBusy(true);
    try {
      await openShiftFn({
        staffId,
        staffName: selectedStaff?.name ?? staffId,
        openingBalance: balance,
        openingDenominations: { ...denoms },
        notes,
      });
      toast.success("Shift opened", {
        description: `Opening balance: ${formatCurrency(balance)}`,
      });
      onClose();
    } catch {
      toast.error("Couldn't open shift, please try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="text-sm font-medium">Opening Staff</label>
        <select
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          value={staffId}
          onChange={(e) => setStaffId(e.target.value)}
        >
          <option value="">Select…</option>
          {staffList
            .filter((s) => isManagerOrAbove(s.role) || s.role === "Advisor")
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.role}
              </option>
            ))}
        </select>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-3">Opening Cash Drawer Count</h3>
        <DenomCounter denoms={denoms} onChange={handleDenom} />
      </div>

      <div className="rounded-lg bg-muted/50 border border-border px-4 py-3 flex items-center justify-between">
        <span className="text-sm font-semibold">Total Opening Cash</span>
        <span className="font-display text-xl font-extrabold text-success">
          {formatCurrency(balance)}
        </span>
      </div>

      <div>
        <label className="text-sm font-medium">Carryover Notes (optional)</label>
        <textarea
          rows={2}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          placeholder="Any notes from previous shift…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <button
        onClick={handleOpen}
        disabled={busy || !staffId}
        className="w-full rounded-md gradient-brand py-3 text-sm font-bold uppercase tracking-wider text-primary-foreground shadow-red hover:opacity-90 disabled:opacity-50"
      >
        <Unlock className="inline h-4 w-4 mr-2" />
        Open Shift
      </button>
    </div>
  );
}

// ─── Close Shift panel ────────────────────────────────────────────────────────

function CloseShiftPanel({ shift, onClose }: { shift: Shift; onClose: () => void }) {
  const { closeShiftFn, expenses: expensesList, invoices: invoicesList } = useStore();
  const { staffList } = useStaffList();
  const [denoms, setDenoms] = useState<Record<DenomKey, number>>({} as Record<DenomKey, number>);
  const [notes, setNotes] = useState(shift.notes ?? "");
  const [verifiedBy, setVerifiedBy] = useState("");
  const [busy, setBusy] = useState(false);

  const closingBalance = calcBalance(denoms);

  // Recompute live totals from store
  const sessionExpenses = expensesList.filter(
    (e) => e.sessionId === shift.id && e.type === "EXPENSE",
  );
  const sessionDeposits = expensesList.filter(
    (e) => e.sessionId === shift.id && e.type === "DEPOSIT",
  );

  // Mirrors recalcShift in store.tsx (shared via sumShiftPaymentsByMethod):
  // sum payments/refunds tagged with THIS shift's sessionId across all
  // invoices, not just invoices opened during this shift -- a balance
  // collected or refunded during this shift affects this drawer regardless
  // of which shift the original sale happened in.
  const {
    cash: cashSales,
    card: cardSales,
    transfer: transferSales,
  } = sumShiftPaymentsByMethod(invoicesList, shift.id);
  const totalExp = sessionExpenses.reduce((s, e) => s + e.amount, 0);
  const totalDep = sessionDeposits.reduce((s, e) => s + e.amount, 0);

  const expectedCash = shift.openingBalance + cashSales - totalExp - totalDep;
  const variance = closingBalance - expectedCash;
  const absVariance = Math.abs(variance);
  const needsNote = absVariance > 500 && !notes.trim();

  function handleDenom(k: string, v: number) {
    setDenoms((d) => ({ ...d, [k]: v }));
  }

  async function handleClose() {
    if (!verifiedBy) {
      toast.error("Select verifying manager");
      return;
    }
    if (needsNote) {
      toast.error(`Variance is ${formatCurrency(absVariance)}, please add an explanation`);
      return;
    }
    setBusy(true);
    try {
      await closeShiftFn({
        closingBalance,
        closingDenominations: { ...denoms },
        notes,
        verifiedBy,
        variance,
      });
      toast.success("Shift closed", {
        description: `Variance: ${variance >= 0 ? "+" : ""}${formatCurrency(variance)}`,
      });
      onClose();
    } catch {
      toast.error("Couldn't close shift, please try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Opening", value: shift.openingBalance, color: "" },
          { label: "Cash Sales", value: cashSales, color: "text-success" },
          { label: "Card Sales", value: cardSales, color: "text-info" },
          { label: "Transfer Sales", value: transferSales, color: "text-warning" },
          { label: "Expenses", value: totalExp + totalDep, color: "text-primary" },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-lg bg-muted/40 border border-border p-3 text-center"
          >
            <div className="text-[11px] text-muted-foreground uppercase tracking-wider">
              {s.label}
            </div>
            <div className={cn("font-display text-base font-bold mt-1", s.color)}>
              {formatCurrency(s.value)}
            </div>
          </div>
        ))}
      </div>

      <div>
        <h3 className="text-sm font-medium mb-3">Closing Cash Drawer Count</h3>
        <DenomCounter denoms={denoms} onChange={handleDenom} />
      </div>

      {/* Expected vs physical */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-muted/40 border border-border p-3">
          <div className="text-[11px] text-muted-foreground uppercase tracking-wider">
            Expected Cash
          </div>
          <div className="font-display text-lg font-bold mt-1">{formatCurrency(expectedCash)}</div>
        </div>
        <div
          className={cn(
            "rounded-lg border p-3",
            variance === 0
              ? "bg-muted/40 border-border"
              : variance < 0
                ? "bg-primary/10 border-primary/40"
                : "bg-success/10 border-success/40",
          )}
        >
          <div className="text-[11px] text-muted-foreground uppercase tracking-wider">Variance</div>
          <div
            className={cn(
              "font-display text-lg font-bold mt-1",
              variance < 0 ? "text-primary" : variance > 0 ? "text-success" : "",
            )}
          >
            {variance >= 0 ? "+" : ""}
            {formatCurrency(variance)}
          </div>
        </div>
      </div>

      {absVariance > 500 && (
        <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Variance exceeds LKR 500. Explanation required below.
        </div>
      )}

      <div>
        <label className="text-sm font-medium">
          Closing Notes {absVariance > 500 && <span className="text-primary">*</span>}
        </label>
        <textarea
          rows={2}
          className={cn(
            "mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none",
            needsNote ? "border-primary focus:ring-primary" : "border-input",
          )}
          placeholder="Notes or variance explanation…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div>
        <label className="text-sm font-medium">Verified By (Incoming Manager)</label>
        <select
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          value={verifiedBy}
          onChange={(e) => setVerifiedBy(e.target.value)}
        >
          <option value="">Select manager…</option>
          {staffList
            .filter((s) => isManagerOrAbove(s.role))
            .map((s) => (
              <option key={s.id} value={s.name}>
                {s.name} · {s.role}
              </option>
            ))}
        </select>
      </div>

      <button
        onClick={handleClose}
        disabled={busy || !verifiedBy || needsNote}
        className="w-full rounded-md bg-charcoal text-charcoal-foreground py-3 text-sm font-bold uppercase tracking-wider hover:bg-charcoal/90 disabled:opacity-50"
      >
        <Lock className="inline h-4 w-4 mr-2" />
        Close Shift & Sign Off
      </button>
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

interface ShiftModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShiftModal({ open, onOpenChange }: ShiftModalProps) {
  const { openShift, shifts } = useStore();
  const [view, setView] = useState<"status" | "open" | "close">("status");

  useEffect(() => {
    if (open) setView("status");
  }, [open]);

  const recentClosed = shifts.filter((s) => s.status === "CLOSED").slice(-1)[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Shift Management
          </DialogTitle>
        </DialogHeader>

        {view === "status" && (
          <div className="space-y-4">
            {/* Current shift status */}
            {openShift ? (
              <div className="rounded-xl border border-success/40 bg-success/5 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                  <span className="font-semibold text-success">Shift Active</span>
                </div>
                <div className="text-sm text-muted-foreground">
                  Opened by <strong>{openShift.staffName}</strong> at{" "}
                  {formatTime(openShift.openedAt)}
                </div>
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                  <div>
                    <div className="text-[11px] text-muted-foreground">Cash Sales</div>
                    <div className="font-mono font-semibold">
                      {formatCurrency(openShift.cashSales)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted-foreground">Card Sales</div>
                    <div className="font-mono font-semibold">
                      {formatCurrency(openShift.cardSales)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted-foreground">Transfer Sales</div>
                    <div className="font-mono font-semibold">
                      {formatCurrency(openShift.transferSales)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted-foreground">Expenses</div>
                    <div className="font-mono font-semibold">
                      {formatCurrency(openShift.totalExpenses)}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setView("close")}
                  className="mt-4 w-full rounded-md bg-primary/10 border border-primary/30 text-primary py-2 text-sm font-semibold hover:bg-primary/20"
                >
                  Close This Shift →
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <XCircle className="h-5 w-5 text-muted-foreground" />
                  <span className="font-semibold text-muted-foreground">No Active Shift</span>
                </div>
                {recentClosed && (
                  <div className="text-sm text-muted-foreground">
                    Last shift closed at {formatTime(recentClosed.closedAt!)} by{" "}
                    {recentClosed.staffName}
                  </div>
                )}
                <button
                  onClick={() => setView("open")}
                  className="mt-4 w-full rounded-md gradient-brand text-primary-foreground py-2 text-sm font-semibold hover:opacity-90 shadow-red"
                >
                  Open New Shift →
                </button>
              </div>
            )}

            {/* Recent shifts */}
            {shifts.length > 0 && (
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  Recent Shifts
                </h3>
                <div className="space-y-1">
                  {[...shifts]
                    .reverse()
                    .slice(0, 4)
                    .map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm"
                      >
                        <div>
                          <span className="font-medium">{s.staffName}</span>
                          <span className="text-muted-foreground ml-2">
                            {formatShortDate(s.openedAt)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs">
                            {formatCurrency(s.cashSales + s.cardSales + s.transferSales)}
                          </span>
                          <span
                            className={cn(
                              "text-xs font-semibold px-2 py-0.5 rounded-full",
                              s.status === "OPEN"
                                ? "bg-success/15 text-success"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            {s.status}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {view === "open" && (
          <div>
            <button
              onClick={() => setView("status")}
              className="text-sm text-muted-foreground hover:text-foreground mb-4"
            >
              ← Back
            </button>
            <OpenShiftPanel onClose={() => onOpenChange(false)} />
          </div>
        )}

        {view === "close" && openShift && (
          <div>
            <button
              onClick={() => setView("status")}
              className="text-sm text-muted-foreground hover:text-foreground mb-4"
            >
              ← Back
            </button>
            <CloseShiftPanel shift={openShift} onClose={() => onOpenChange(false)} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
