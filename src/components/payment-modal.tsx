// Shared "tender lines" editor (split payments across Cash/Card/Transfer)
// used by the POS checkout panel, plus the Collect Payment / Refund modal
// used from the Recent Invoices table for existing invoices.

import { useState } from "react";
import { toast } from "sonner";
import { X, Banknote, CreditCard, ArrowRightLeft, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { getAmountPaid, getAmountRefunded, type Invoice, type PaymentMethod } from "@/lib/db";
import { cn } from "@/lib/utils";

export interface TenderLine {
  key: number;
  method: PaymentMethod;
  amount: number;
  reference: string;
}

const METHOD_ICONS: Record<PaymentMethod, typeof Banknote> = {
  Cash: Banknote,
  Card: CreditCard,
  Transfer: ArrowRightLeft,
};

let tenderKeyCounter = 0;

export function TenderLineEditor({
  lines,
  onChange,
  remaining,
}: {
  lines: TenderLine[];
  onChange: (lines: TenderLine[]) => void;
  remaining: number;
}) {
  const tendered = lines.reduce((s, l) => s + l.amount, 0);
  const stillOwed = remaining - tendered;

  function addLine(method: PaymentMethod) {
    const amount = Math.max(0, stillOwed);
    onChange([...lines, { key: ++tenderKeyCounter, method, amount, reference: "" }]);
  }

  function updateLine(key: number, field: keyof Omit<TenderLine, "key">, value: string | number) {
    onChange(lines.map((l) => (l.key === key ? { ...l, [field]: value } : l)));
  }

  function removeLine(key: number) {
    onChange(lines.filter((l) => l.key !== key));
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {(["Cash", "Card", "Transfer"] as const).map((m) => {
          const Icon = METHOD_ICONS[m];
          return (
            <button
              key={m}
              type="button"
              onClick={() => addLine(m)}
              className="flex flex-col items-center gap-1 rounded-md border border-input py-2.5 text-xs font-medium hover:bg-accent transition-colors"
            >
              <Icon className="h-4 w-4" />+ {m}
            </button>
          );
        })}
      </div>

      {lines.length > 0 && (
        <div className="space-y-2 mb-3">
          {lines.map((l) => (
            <div key={l.key} className="flex items-center gap-2">
              <select
                value={l.method}
                onChange={(e) => updateLine(l.key, "method", e.target.value)}
                className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none"
              >
                <option value="Cash">Cash</option>
                <option value="Card">Card</option>
                <option value="Transfer">Transfer</option>
              </select>
              <input
                type="number"
                min={0}
                value={l.amount}
                onChange={(e) => updateLine(l.key, "amount", Number(e.target.value))}
                className="w-28 rounded-md border border-input bg-background px-2 py-1.5 text-right text-sm font-mono focus:outline-none"
              />
              <input
                type="text"
                placeholder="Ref (optional)"
                value={l.reference}
                onChange={(e) => updateLine(l.key, "reference", e.target.value)}
                className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none"
              />
              <button
                type="button"
                onClick={() => removeLine(l.key)}
                className="text-muted-foreground hover:text-primary"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        className={cn(
          "flex justify-between text-xs font-medium rounded-md px-3 py-2",
          stillOwed > 0 ? "bg-muted/50 text-muted-foreground" : "bg-success/10 text-success",
        )}
      >
        <span>Remaining to tender</span>
        <span className="font-mono">LKR {Math.max(0, stillOwed).toLocaleString()}</span>
      </div>
    </div>
  );
}

// ─── Collect Payment / Refund modal ────────────────────────────────────────

interface PaymentModalProps {
  invoice: Invoice;
  mode: "collect" | "refund";
  onClose: () => void;
}

export function PaymentModal({ invoice, mode, onClose }: PaymentModalProps) {
  const { openShift, recordInvoicePayment, refundInvoicePayment } = useStore();
  const { staff } = useAuth();

  const amountPaid = getAmountPaid(invoice);
  const amountRefunded = getAmountRefunded(invoice);
  const balanceDue = Math.max(0, invoice.total - amountPaid);
  const refundable = Math.max(0, amountPaid - amountRefunded);

  const [lines, setLines] = useState<TenderLine[]>([]);
  const [refundAmount, setRefundAmount] = useState(refundable);
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>("Cash");
  const [refundReason, setRefundReason] = useState("");
  const [saving, setSaving] = useState(false);

  function handleCollect() {
    if (!openShift) {
      toast.error("Open a shift first");
      return;
    }
    const tendered = lines.filter((l) => l.amount > 0);
    if (tendered.length === 0) {
      toast.error("Enter at least one payment amount");
      return;
    }
    setSaving(true);
    for (const l of tendered) {
      recordInvoicePayment(invoice.id, {
        method: l.method,
        amount: l.amount,
        reference: l.reference,
        sessionId: openShift.id,
        staffName: staff?.name ?? "",
        at: new Date().toISOString(),
      });
    }
    toast.success(`Payment recorded for ${invoice.id}`);
    setSaving(false);
    onClose();
  }

  function handleRefund() {
    if (!openShift) {
      toast.error("Open a shift first");
      return;
    }
    if (refundAmount <= 0 || refundAmount > refundable) {
      toast.error(`Refund amount must be between 1 and ${refundable.toLocaleString()}`);
      return;
    }
    if (!refundReason.trim()) {
      toast.error("A reason is required for refunds");
      return;
    }
    setSaving(true);
    refundInvoicePayment(invoice.id, {
      amount: refundAmount,
      method: refundMethod,
      reason: refundReason.trim(),
      sessionId: openShift.id,
      staffName: staff?.name ?? "",
      at: new Date().toISOString(),
    });
    toast.success(`LKR ${refundAmount.toLocaleString()} refunded on ${invoice.id}`);
    setSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-card border border-border shadow-elevated p-6 mx-4">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-lg font-bold">
            {mode === "collect" ? "Collect Payment" : "Refund"} — {invoice.id}
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 text-sm text-muted-foreground">
          {invoice.customerName} · Total LKR {invoice.total.toLocaleString()}
        </div>

        {!openShift && (
          <p className="mb-4 text-sm text-warning">
            No active shift — open a shift before collecting or refunding.
          </p>
        )}

        {mode === "collect" ? (
          <>
            <TenderLineEditor lines={lines} onChange={setLines} remaining={balanceDue} />
            <button
              onClick={handleCollect}
              disabled={saving || !openShift || lines.length === 0}
              className="mt-4 w-full rounded-md gradient-brand py-2.5 text-sm font-bold uppercase tracking-wider text-primary-foreground shadow-red hover:opacity-95 disabled:opacity-50"
            >
              Record Payment
            </button>
          </>
        ) : (
          <div className="space-y-4">
            <div className="text-xs text-muted-foreground">
              Refundable up to LKR {refundable.toLocaleString()}
            </div>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Refund Amount (LKR)
              </span>
              <input
                type="number"
                min={1}
                max={refundable}
                value={refundAmount}
                onChange={(e) => setRefundAmount(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Refund Method
              </span>
              <select
                value={refundMethod}
                onChange={(e) => setRefundMethod(e.target.value as PaymentMethod)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="Cash">Cash</option>
                <option value="Card">Card</option>
                <option value="Transfer">Transfer</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Reason (required)
              </span>
              <input
                type="text"
                required
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="e.g. customer unhappy with paint correction"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <button
              onClick={handleRefund}
              disabled={saving || !openShift}
              className="w-full rounded-md bg-primary py-2.5 text-sm font-bold uppercase tracking-wider text-primary-foreground hover:opacity-95 disabled:opacity-50"
            >
              Refund LKR {refundAmount.toLocaleString()}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
