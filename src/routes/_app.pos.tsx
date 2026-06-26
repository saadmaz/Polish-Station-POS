import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { StatusChip, statusVariant } from "@/components/status-chip";
import { Plus, Trash2, Banknote, CreditCard, ArrowRightLeft, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PaymentMethod, InvoiceLine } from "@/lib/db";

export const Route = createFileRoute("/_app/pos")({
  head: () => ({ meta: [{ title: "POS / Checkout — Polish Station OS" }] }),
  component: POS,
});

function POS() {
  const { services, customers, jobs, invoices, openShift, addInvoice, moveJob } = useStore();

  // Customer / job selection
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [manualCustomer, setManualCustomer] = useState("");

  // Line items
  const [lines, setLines] = useState<(InvoiceLine & { key: number })[]>([]);
  const [lineCounter, setLineCounter] = useState(0);

  // Payment
  const [tip, setTip] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>("Card");
  const [charging, setCharging] = useState(false);

  const selectedJob = jobs.find((j) => j.id === selectedJobId);
  const customerName = selectedJob?.customerName ?? manualCustomer;
  const customerId = selectedJob?.customerId ?? customers.find((c) => c.name.toLowerCase() === customerName.toLowerCase())?.id ?? null;
  const customerRecord = customers.find((c) => c.id === customerId);

  // Auto-populate line items when a job is selected
  function selectJob(jobId: string) {
    const j = jobs.find((x) => x.id === jobId);
    if (!j) return;
    setSelectedJobId(jobId);
    const key = lineCounter + 1;
    setLineCounter(key);
    setLines([{ key, name: j.serviceName, qty: 1, unitPrice: j.price, discount: 0 }]);
    setCustomerSearch("");
  }

  function addLine(serviceId?: string) {
    const svc = services.find((s) => s.id === serviceId);
    const key = lineCounter + 1;
    setLineCounter(key);
    setLines((ls) => [...ls, { key, name: svc?.name ?? "Custom item", qty: 1, unitPrice: svc?.price ?? 0, discount: 0 }]);
  }

  function updateLine(key: number, field: keyof InvoiceLine, value: string | number) {
    setLines((ls) => ls.map((l) => l.key === key ? { ...l, [field]: value } : l));
  }

  function removeLine(key: number) {
    setLines((ls) => ls.filter((l) => l.key !== key));
  }

  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.qty - l.discount, 0);
  const tax = Math.round(subtotal * 0.18);
  const total = subtotal + tax + tip;

  function handleCharge() {
    if (lines.length === 0) { toast.error("Add at least one line item"); return; }
    if (total <= 0) { toast.error("Total must be greater than 0"); return; }
    setCharging(true);

    const inv = addInvoice({
      jobId: selectedJobId,
      customerId,
      customerName: customerName || "Guest",
      lines: lines.map(({ key: _k, ...l }) => l),
      subtotal,
      tax,
      tip,
      total,
      method,
      status: "Paid",
      sessionId: openShift?.id ?? null,
    });

    // Mark the job Done Today
    if (selectedJobId) {
      moveJob(selectedJobId, "Done Today");
    }

    toast.success(`Payment received`, {
      description: `${inv.id} · LKR ${total.toLocaleString()} · ${method}`,
    });

    // Reset
    setLines([]);
    setSelectedJobId(null);
    setManualCustomer("");
    setCustomerSearch("");
    setTip(0);
    setMethod("Card");
    setCharging(false);
  }

  const readyJobs = jobs.filter((j) => j.status === "Ready" || j.status === "Awaiting QC" || j.status === "Done Today");
  const filteredJobs = customerSearch
    ? readyJobs.filter(
        (j) =>
          j.customerName.toLowerCase().includes(customerSearch.toLowerCase()) ||
          j.plate.toLowerCase().includes(customerSearch.toLowerCase()),
      )
    : readyJobs.slice(0, 8);

  return (
    <div className="p-6 grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6 h-full">
      <div className="space-y-6">
        <PageHeader title="POS / Checkout" subtitle={openShift ? `Shift active · ${openShift.staffName}` : "No active shift"} />

        {/* Job selector */}
        <div className="rounded-xl border border-border bg-card shadow-card p-4">
          <h2 className="font-display font-bold mb-3">Select Job / Customer</h2>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Search by name or plate…"
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {filteredJobs.map((j) => (
              <button
                key={j.id}
                onClick={() => selectJob(j.id)}
                className={cn(
                  "w-full flex items-center gap-3 rounded-lg border px-3 py-2 text-sm text-left transition-colors",
                  selectedJobId === j.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/40",
                )}
              >
                <span className="font-mono text-[11px] text-muted-foreground w-16">{j.id}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{j.customerName}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{j.plate} · {j.serviceName}</div>
                </div>
                <span className="font-mono text-xs">LKR {j.price.toLocaleString()}</span>
                <StatusChip variant={statusVariant(j.status)}>{j.status}</StatusChip>
              </button>
            ))}
            {filteredJobs.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-4">
                No jobs found — enter customer name below for manual billing
              </div>
            )}
          </div>
          {!selectedJobId && (
            <div className="mt-3">
              <input
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Or type customer name for manual billing…"
                value={manualCustomer}
                onChange={(e) => setManualCustomer(e.target.value)}
              />
            </div>
          )}
          {selectedJob && (
            <div className="mt-3 flex items-center justify-between text-sm rounded-md bg-primary/5 border border-primary/20 px-3 py-2">
              <span><strong>{selectedJob.customerName}</strong> · {selectedJob.plate}</span>
              <button onClick={() => { setSelectedJobId(null); setLines([]); }} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* Line items */}
        <div className="rounded-xl border border-border bg-card shadow-card">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="font-display font-bold">Line Items</h2>
            <div className="flex gap-2">
              <select
                className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none"
                value=""
                onChange={(e) => { if (e.target.value) addLine(e.target.value); }}
              >
                <option value="">+ Add service…</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} — LKR {s.price.toLocaleString()}</option>
                ))}
              </select>
              <button
                onClick={() => addLine()}
                className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-xs hover:bg-accent"
              >
                <Plus className="h-3.5 w-3.5" /> Custom
              </button>
            </div>
          </div>
          {lines.length > 0 ? (
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2">Item</th>
                  <th className="text-right px-3 py-2 w-16">Qty</th>
                  <th className="text-right px-3 py-2 w-28">Unit</th>
                  <th className="text-right px-3 py-2 w-28">Disc.</th>
                  <th className="text-right px-3 py-2 w-32">Total</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lines.map((l) => (
                  <tr key={l.key}>
                    <td className="px-4 py-2">
                      <input
                        className="w-full bg-transparent text-sm font-medium focus:outline-none"
                        value={l.name}
                        onChange={(e) => updateLine(l.key, "name", e.target.value)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={1}
                        className="w-14 rounded bg-muted px-2 py-1 text-right text-sm font-mono focus:outline-none"
                        value={l.qty}
                        onChange={(e) => updateLine(l.key, "qty", Number(e.target.value))}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        className="w-24 rounded bg-muted px-2 py-1 text-right text-sm font-mono focus:outline-none"
                        value={l.unitPrice}
                        onChange={(e) => updateLine(l.key, "unitPrice", Number(e.target.value))}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        className="w-24 rounded bg-muted px-2 py-1 text-right text-sm font-mono text-primary focus:outline-none"
                        value={l.discount}
                        onChange={(e) => updateLine(l.key, "discount", Number(e.target.value))}
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-semibold">
                      {(l.unitPrice * l.qty - l.discount).toLocaleString()}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button onClick={() => removeLine(l.key)} className="text-muted-foreground hover:text-primary">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center text-sm text-muted-foreground py-10">
              Select a job above or add line items manually
            </div>
          )}
        </div>

        {/* Recent invoices */}
        <div>
          <h3 className="font-display text-sm font-bold mb-3 uppercase tracking-wider text-muted-foreground">
            Recent Invoices
          </h3>
          <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-charcoal text-charcoal-foreground text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-2.5">Invoice</th>
                  <th className="text-left px-3 py-2.5">Customer</th>
                  <th className="text-left px-3 py-2.5">Date</th>
                  <th className="text-right px-3 py-2.5">Total</th>
                  <th className="text-left px-3 py-2.5">Method</th>
                  <th className="text-left px-3 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[...invoices].reverse().slice(0, 10).map((i) => (
                  <tr key={i.id} className="hover:bg-muted/40">
                    <td className="px-4 py-2.5 font-mono text-xs">{i.id}</td>
                    <td className="px-3 py-2.5 font-medium">{i.customerName}</td>
                    <td className="px-3 py-2.5 text-muted-foreground text-xs">
                      {new Date(i.createdAt).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold">
                      LKR {i.total.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{i.method}</td>
                    <td className="px-3 py-2.5">
                      <StatusChip variant={statusVariant(i.status)}>{i.status}</StatusChip>
                    </td>
                  </tr>
                ))}
                {invoices.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-6 text-muted-foreground text-sm">No invoices yet today</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Payment panel */}
      <aside className="rounded-xl border border-border bg-card shadow-card p-5 h-fit sticky top-4">
        {customerRecord && (
          <div className="mb-3 rounded-md bg-muted/40 px-3 py-2">
            <div className="text-xs text-muted-foreground">Customer</div>
            <div className="font-display font-bold">{customerRecord.name}</div>
            <div className="text-xs text-muted-foreground">{customerRecord.tier} · {customerRecord.visits} visits · LKR {customerRecord.spend.toLocaleString()} lifetime</div>
          </div>
        )}
        {!customerRecord && (customerName) && (
          <div className="mb-3 text-sm font-semibold">{customerName}</div>
        )}

        <div className="space-y-2 text-sm border-y border-border py-4">
          <Row label="Subtotal" value={`LKR ${subtotal.toLocaleString()}`} />
          <Row label="VAT 18%" value={`LKR ${tax.toLocaleString()}`} />
          <Row label="Tip" value={`LKR ${tip.toLocaleString()}`} />
        </div>
        <div className="flex items-baseline justify-between py-4">
          <span className="text-sm font-semibold uppercase tracking-wider">Total</span>
          <span className="font-display text-2xl font-extrabold text-primary">
            LKR {total.toLocaleString()}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          {[150, 300, 500].map((amt) => (
            <button
              key={amt}
              onClick={() => setTip(tip === amt ? 0 : amt)}
              className={cn(
                "rounded-md border py-2 text-xs font-medium transition-colors",
                tip === amt ? "border-primary bg-primary/10 text-primary" : "border-input hover:bg-accent",
              )}
            >
              Tip LKR {amt}
            </button>
          ))}
        </div>

        <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
          Payment Method
        </div>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {(
            [
              { v: "Cash" as const, icon: Banknote },
              { v: "Card" as const, icon: CreditCard },
              { v: "Transfer" as const, icon: ArrowRightLeft },
            ]
          ).map(({ v, icon: Icon }) => (
            <button
              key={v}
              onClick={() => setMethod(v)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-md border py-2.5 text-xs font-medium transition-colors",
                method === v
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-input hover:bg-accent",
              )}
            >
              <Icon className="h-4 w-4" />
              {v}
            </button>
          ))}
        </div>

        <button
          onClick={handleCharge}
          disabled={charging || lines.length === 0}
          className="w-full rounded-md gradient-brand py-3 text-sm font-bold uppercase tracking-wider text-primary-foreground shadow-red hover:opacity-95 disabled:opacity-50"
        >
          {charging ? "Processing…" : `Charge LKR ${total.toLocaleString()}`}
        </button>

        {!openShift && (
          <p className="mt-2 text-center text-[11px] text-warning">No active shift — open a shift first</p>
        )}
      </aside>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium">{value}</span>
    </div>
  );
}

function X({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
