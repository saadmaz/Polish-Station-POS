import { useState } from "react";
import { X, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

interface ExpenseModalProps {
  open: boolean;
  onClose: () => void;
}

const EXPENSE_CATEGORIES = ["Supplies", "Fuel", "Utilities", "Maintenance", "Staff", "Other"];

export function ExpenseModal({ open, onClose }: ExpenseModalProps) {
  const { openShift, addExpense, expenses } = useStore();
  const [type, setType] = useState<"EXPENSE" | "DEPOSIT">("EXPENSE");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Supplies");
  const [paidTo, setPaidTo] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const shiftExpenses = openShift ? expenses.filter((e) => e.sessionId === openShift.id) : [];

  function reset() {
    setAmount("");
    setPaidTo("");
    setDescription("");
    setCategory("Supplies");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!openShift) return;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    setSaving(true);
    addExpense({
      sessionId: openShift.id,
      type,
      amount: amt,
      category: type === "DEPOSIT" ? "Deposit" : category,
      paidTo: paidTo.trim(),
      description: description.trim(),
    });
    reset();
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-card border border-border shadow-elevated p-6 mx-4">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-lg font-bold">Cash Out / Deposit</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!openShift && (
          <p className="text-sm text-muted-foreground text-center py-6">
            No shift is currently open.
          </p>
        )}

        {openShift && (
          <>
            {/* Type toggle */}
            <div className="flex rounded-lg border border-border p-1 mb-5 gap-1">
              <button
                type="button"
                onClick={() => setType("EXPENSE")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-colors",
                  type === "EXPENSE"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <ArrowUpRight className="h-4 w-4" /> Cash Out
              </button>
              <button
                type="button"
                onClick={() => setType("DEPOSIT")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-colors",
                  type === "DEPOSIT"
                    ? "bg-success text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <ArrowDownLeft className="h-4 w-4" /> Bank Deposit
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Amount (LKR)
                </span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </label>

              {type === "EXPENSE" && (
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Category
                  </span>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
              )}

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {type === "EXPENSE" ? "Paid To" : "Bank / Reference"}
                </span>
                <input
                  type="text"
                  value={paidTo}
                  onChange={(e) => setPaidTo(e.target.value)}
                  placeholder={type === "EXPENSE" ? "Vendor name" : "Account / ref no."}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Description
                </span>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional note"
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </label>

              <button
                type="submit"
                disabled={saving || !amount}
                className={cn(
                  "w-full rounded-md py-2.5 text-sm font-medium text-white transition-colors shadow-sm",
                  type === "EXPENSE"
                    ? "bg-primary hover:bg-primary/90"
                    : "bg-success hover:bg-success/90",
                  (!amount || saving) && "opacity-50 cursor-not-allowed",
                )}
              >
                {type === "EXPENSE" ? "Record Cash Out" : "Record Deposit"}
              </button>
            </form>

            {/* Session log */}
            {shiftExpenses.length > 0 && (
              <div className="mt-5 border-t border-border pt-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  This shift
                </p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {[...shiftExpenses].reverse().map((ex) => (
                    <div key={ex.id} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground truncate max-w-[200px]">
                        {ex.type === "DEPOSIT" ? "↓ Deposit" : `↑ ${ex.category}`}
                        {ex.paidTo ? ` · ${ex.paidTo}` : ""}
                      </span>
                      <span
                        className={cn(
                          "font-mono font-semibold",
                          ex.type === "DEPOSIT" ? "text-success" : "text-primary",
                        )}
                      >
                        {ex.type === "DEPOSIT" ? "+" : "-"}LKR {ex.amount.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
