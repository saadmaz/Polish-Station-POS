import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { INVOICES, SERVICES } from "@/lib/mock-data";
import { PageHeader } from "@/components/page-header";
import { StatusChip, statusVariant } from "@/components/status-chip";
import { Plus, Trash2, Banknote, CreditCard, ArrowRightLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/pos")({
  head: () => ({ meta: [{ title: "POS / Checkout — Polish Station OS" }] }),
  component: POS,
});

function POS() {
  const [lines, setLines] = useState(
    SERVICES.slice(0, 2).map((s) => ({ ...s, qty: 1, discount: 0 })),
  );
  const [tip, setTip] = useState(0);
  const [method, setMethod] = useState<"Cash" | "Card" | "Transfer">("Card");

  const subtotal = lines.reduce((s, l) => s + l.price * l.qty - l.discount, 0);
  const tax = Math.round(subtotal * 0.18);
  const total = subtotal + tax + tip;

  return (
    <div className="p-6 grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6 h-full">
      <div>
        <PageHeader
          title="Checkout · INV-2091"
          subtitle="Hasini Wijesuriya · Toyota Aqua · CAR-4521"
        />
        <div className="rounded-xl border border-border bg-card shadow-card">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="font-display font-bold">Line Items</h2>
            <button className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent">
              <Plus className="h-4 w-4" /> Add Item
            </button>
          </div>
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr className="border-b border-border">
                <th className="text-left px-4 py-2">Service</th>
                <th className="text-right px-3 py-2 w-16">Qty</th>
                <th className="text-right px-3 py-2 w-28">Unit</th>
                <th className="text-right px-3 py-2 w-28">Disc.</th>
                <th className="text-right px-3 py-2 w-32">Total</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lines.map((l, idx) => (
                <tr key={l.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{l.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {l.category} · {l.durationMin}m
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right font-mono">{l.qty}</td>
                  <td className="px-3 py-3 text-right font-mono">{l.price.toLocaleString()}</td>
                  <td className="px-3 py-3 text-right font-mono text-primary">
                    -{l.discount.toLocaleString()}
                  </td>
                  <td className="px-3 py-3 text-right font-mono font-semibold">
                    {(l.price * l.qty - l.discount).toLocaleString()}
                  </td>
                  <td className="px-2 py-3 text-right">
                    <button
                      onClick={() => setLines((ls) => ls.filter((_, i) => i !== idx))}
                      className="text-muted-foreground hover:text-primary"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6">
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
                {INVOICES.map((i) => (
                  <tr key={i.id} className="hover:bg-muted/40">
                    <td className="px-4 py-2.5 font-mono text-xs">{i.id}</td>
                    <td className="px-3 py-2.5 font-medium">{i.customer}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{i.date}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold">
                      LKR {i.total.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{i.method}</td>
                    <td className="px-3 py-2.5">
                      <StatusChip variant={statusVariant(i.status)}>{i.status}</StatusChip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Payment panel */}
      <aside className="rounded-xl border border-border bg-card shadow-card p-5 h-fit sticky top-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
          Customer
        </div>
        <div className="font-display font-bold text-lg">Hasini Wijesuriya</div>
        <div className="text-xs text-muted-foreground mb-4">Platinum · 5% loyalty applied</div>

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
          {[15, 30, 50].map((amt) => (
            <button
              key={amt}
              onClick={() => setTip(amt * 10)}
              className="rounded-md border border-input py-2 text-xs font-medium hover:bg-accent"
            >
              Tip LKR {amt * 10}
            </button>
          ))}
        </div>

        <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
          Payment Method
        </div>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {(
            [
              { v: "Cash", icon: Banknote },
              { v: "Card", icon: CreditCard },
              { v: "Transfer", icon: ArrowRightLeft },
            ] as const
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

        <button className="w-full rounded-md gradient-brand py-3 text-sm font-bold uppercase tracking-wider text-primary-foreground shadow-red hover:opacity-95">
          Charge LKR {total.toLocaleString()}
        </button>
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
