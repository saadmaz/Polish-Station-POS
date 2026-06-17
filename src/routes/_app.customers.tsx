import { createFileRoute } from "@tanstack/react-router";
import { CUSTOMERS } from "@/lib/mock-data";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import { Search, Plus, Download } from "lucide-react";

export const Route = createFileRoute("/_app/customers")({
  head: () => ({ meta: [{ title: "Customers — Polish Station OS" }] }),
  component: Customers,
});

const TIER_TONE = {
  Bronze: "neutral",
  Silver: "info",
  Gold: "warning",
  Platinum: "brand",
} as const;

function Customers() {
  return (
    <div className="p-6">
      <PageHeader
        title="Customers"
        subtitle={`${CUSTOMERS.length} customers · 64 vehicles on file`}
        actions={
          <>
            <button className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent">
              <Download className="h-4 w-4" /> Export
            </button>
            <button className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-red hover:bg-primary/90">
              <Plus className="h-4 w-4" /> New Customer
            </button>
          </>
        }
      />

      <div className="rounded-xl border border-border bg-card shadow-card">
        <div className="flex items-center gap-3 p-4 border-b border-border">
          <div className="flex flex-1 items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input className="flex-1 bg-transparent outline-none" placeholder="Search by name, phone, plate…" />
          </div>
          <select className="rounded-md border border-input bg-background px-3 py-1.5 text-sm">
            <option>All Tiers</option><option>Platinum</option><option>Gold</option><option>Silver</option><option>Bronze</option>
          </select>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-charcoal text-charcoal-foreground text-[11px] uppercase tracking-wider">
            <tr>
              <th className="text-left px-5 py-2.5">Customer</th>
              <th className="text-left px-3 py-2.5">Phone</th>
              <th className="text-right px-3 py-2.5">Visits</th>
              <th className="text-right px-3 py-2.5">Lifetime Spend</th>
              <th className="text-left px-3 py-2.5">Last Visit</th>
              <th className="text-right px-3 py-2.5">Vehicles</th>
              <th className="text-left px-3 py-2.5">Tier</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {CUSTOMERS.map((c) => (
              <tr key={c.id} className="hover:bg-muted/40 cursor-pointer">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {c.name.split(" ").map((p) => p[0]).slice(0,2).join("")}
                    </div>
                    <div>
                      <div className="font-semibold">{c.name}</div>
                      <div className="text-[11px] text-muted-foreground">{c.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 font-mono text-xs text-muted-foreground">{c.phone}</td>
                <td className="px-3 py-3 text-right font-mono">{c.visits}</td>
                <td className="px-3 py-3 text-right font-mono font-semibold">LKR {c.spend.toLocaleString()}</td>
                <td className="px-3 py-3 text-muted-foreground">{c.lastVisit}</td>
                <td className="px-3 py-3 text-right font-mono">{c.vehicles}</td>
                <td className="px-3 py-3"><StatusChip variant={TIER_TONE[c.tier]}>{c.tier}</StatusChip></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
