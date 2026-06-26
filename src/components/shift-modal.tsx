// Shift open / close / reconciliation modal.
// Open-shift: staff selector, denomination counter → opening balance.
// Close-shift: closing denomination count, variance calculation, verifier sign-off.

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Lock, Unlock, CheckCircle2, XCircle, DollarSign, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStore } from "@/lib/store";
import { useAuth, STAFF } from "@/lib/auth";
import { cn } from "@/lib/utils";
import type { Shift } from "@/lib/db";

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
        <div key={d.key} className="flex items-center gap-3">
          <span className="w-36 text-sm text-muted-foreground shrink-0">{d.label}</span>
          <input
            type="number"
            min={0}
            className="w-24 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-ring"
            value={denoms[d.key] ?? ""}
            placeholder="0"
            onChange={(e) => onChange(d.key, Number(e.target.value) || 0)}
          />
          <span className="text-xs text-muted-foreground font-mono w-28 text-right">
            = LKR {((denoms[d.key] ?? 0) * d.value).toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Open Shift panel ─────────────────────────────────────────────────────────

function OpenShiftPanel({ onClose }: { onClose: () => void }) {
  const { openShiftFn } = useStore();
  const { staff: activeStaff } = useAuth();
  const [staffId, setStaffId] = useState(activeStaff?.id ?? "");
  const [denoms, setDenoms] = useState<Record<DenomKey, number>>({} as Record<DenomKey, number>);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const balance = calcBalance(denoms);
  const selectedStaff = STAFF.find((s) => s.id === staffId);

  function handleDenom(k: string, v: number) {
    setDenoms((d) => ({ ...d, [k]: v }));
  }

  function handleOpen() {
    if (!staffId) { toast.error("Select the opening staff member"); return; }
    setBusy(true);
    openShiftFn({
      staffId,
      staffName: selectedStaff?.name ?? staffId,
      openingBalance: balance,
      openingDenominations: { ...denoms },
      notes,
    });
    toast.success("Shift opened", { description: `Opening balance: LKR ${balance.toLocaleString()}` });
    setBusy(false);
    onClose();
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
          {STAFF.filter((s) => s.role === "Admin" || s.role === "Manager" || s.role === "Advisor").map((s) => (
            <option key={s.id} value={s.id}>{s.name} — {s.role}</option>
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
          LKR {balance.toLocaleString()}
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
  const [denoms, setDenoms] = useState<Record<DenomKey, number>>({} as Record<DenomKey, number>);
  const [notes, setNotes] = useState(shift.notes ?? "");
  const [verifiedBy, setVerifiedBy] = useState("");
  const [busy, setBusy] = useState(false);

  const closingBalance = calcBalance(denoms);

  // Recompute live totals from store
  const sessionExpenses = expensesList.filter((e) => e.sessionId === shift.id && e.type === "EXPENSE");
  const sessionDeposits = expensesList.filter((e) => e.sessionId === shift.id && e.type === "DEPOSIT");
  const sessionInvoices = invoicesList.filter((i) => i.sessionId === shift.id);

  const cashSales = sessionInvoices.filter((i) => i.method === "Cash").reduce((s, i) => s + i.total, 0);
  const cardSales = sessionInvoices.filter((i) => i.method !== "Cash").reduce((s, i) => s + i.total, 0);
  const totalExp = sessionExpenses.reduce((s, e) => s + e.amount, 0);
  const totalDep = sessionDeposits.reduce((s, e) => s + e.amount, 0);

  const expectedCash = shift.openingBalance + cashSales - totalExp - totalDep;
  const variance = closingBalance - expectedCash;
  const absVariance = Math.abs(variance);
  const needsNote = absVariance > 500 && !notes.trim();

  function handleDenom(k: string, v: number) {
    setDenoms((d) => ({ ...d, [k]: v }));
  }

  function handleClose() {
    if (!verifiedBy) { toast.error("Select verifying manager"); return; }
    if (needsNote) { toast.error(`Variance is LKR ${absVariance.toLocaleString()} — please add an explanation`); return; }
    setBusy(true);
    closeShiftFn({ closingBalance, closingDenominations: { ...denoms }, notes, verifiedBy, variance });
    toast.success("Shift closed", { description: `Variance: LKR ${variance >= 0 ? "+" : ""}${variance.toLocaleString()}` });
    setBusy(false);
    onClose();
  }

  return (
    <div className="space-y-5">
      {/* Summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Opening", value: shift.openingBalance, color: "" },
          { label: "Cash Sales", value: cashSales, color: "text-success" },
          { label: "Card Sales", value: cardSales, color: "text-info" },
          { label: "Expenses", value: totalExp + totalDep, color: "text-primary" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg bg-muted/40 border border-border p-3 text-center">
            <div className="text-[11px] text-muted-foreground uppercase tracking-wider">{s.label}</div>
            <div className={cn("font-display text-base font-bold mt-1", s.color)}>
              LKR {s.value.toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      <div>
        <h3 className="text-sm font-medium mb-3">Closing Cash Drawer Count</h3>
        <DenomCounter denoms={denoms} onChange={handleDenom} />
      </div>

      {/* Expected vs physical */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-muted/40 border border-border p-3">
          <div className="text-[11px] text-muted-foreground uppercase tracking-wider">Expected Cash</div>
          <div className="font-display text-lg font-bold mt-1">LKR {expectedCash.toLocaleString()}</div>
        </div>
        <div className={cn("rounded-lg border p-3", variance === 0 ? "bg-muted/40 border-border" : variance < 0 ? "bg-primary/10 border-primary/40" : "bg-success/10 border-success/40")}>
          <div className="text-[11px] text-muted-foreground uppercase tracking-wider">Variance</div>
          <div className={cn("font-display text-lg font-bold mt-1", variance < 0 ? "text-primary" : variance > 0 ? "text-success" : "")}>
            LKR {variance >= 0 ? "+" : ""}{variance.toLocaleString()}
          </div>
        </div>
      </div>

      {absVariance > 500 && (
        <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Variance exceeds LKR 500 — explanation required below.
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
          {STAFF.filter((s) => s.role === "Admin" || s.role === "Manager").map((s) => (
            <option key={s.id} value={s.name}>{s.name} — {s.role}</option>
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
                  {new Date(openShift.openedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <div className="text-[11px] text-muted-foreground">Cash Sales</div>
                    <div className="font-mono font-semibold">LKR {openShift.cashSales.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted-foreground">Card Sales</div>
                    <div className="font-mono font-semibold">LKR {openShift.cardSales.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted-foreground">Expenses</div>
                    <div className="font-mono font-semibold">LKR {openShift.totalExpenses.toLocaleString()}</div>
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
                    Last shift closed at {new Date(recentClosed.closedAt!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} — by {recentClosed.staffName}
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
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Recent Shifts</h3>
                <div className="space-y-1">
                  {[...shifts].reverse().slice(0, 4).map((s) => (
                    <div key={s.id} className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm">
                      <div>
                        <span className="font-medium">{s.staffName}</span>
                        <span className="text-muted-foreground ml-2">
                          {new Date(s.openedAt).toLocaleDateString([], { day: "numeric", month: "short" })}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs">LKR {(s.cashSales + s.cardSales).toLocaleString()}</span>
                        <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", s.status === "OPEN" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>
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
            <button onClick={() => setView("status")} className="text-sm text-muted-foreground hover:text-foreground mb-4">← Back</button>
            <OpenShiftPanel onClose={() => onOpenChange(false)} />
          </div>
        )}

        {view === "close" && openShift && (
          <div>
            <button onClick={() => setView("status")} className="text-sm text-muted-foreground hover:text-foreground mb-4">← Back</button>
            <CloseShiftPanel shift={openShift} onClose={() => onOpenChange(false)} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
