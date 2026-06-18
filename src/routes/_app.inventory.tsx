import { createFileRoute } from "@tanstack/react-router";
import { INVENTORY } from "@/lib/mock-data";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import { Plus, FileText } from "lucide-react";

export const Route = createFileRoute("/_app/inventory")({
  head: () => ({ meta: [{ title: "Inventory — Polish Station OS" }] }),
  component: Inventory,
});

function status(stock: number, reorder: number) {
  if (stock === 0) return { label: "Out of Stock", variant: "danger" as const };
  if (stock <= reorder) return { label: "Low Stock", variant: "warning" as const };
  return { label: "In Stock", variant: "success" as const };
}

function Inventory() {
  const totalValue = INVENTORY.reduce((sum, i) => sum + i.stock * i.cost, 0);
  return (
    <div className="p-6">
      <PageHeader
        title="Inventory"
        subtitle={`${INVENTORY.length} SKUs · LKR ${totalValue.toLocaleString()} on hand`}
        actions={
          <>
            <button className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent">
              <FileText className="h-4 w-4" /> New PO
            </button>
            <button className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-red hover:bg-primary/90">
              <Plus className="h-4 w-4" /> Add Item
            </button>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label: "Total SKUs", value: INVENTORY.length },
          {
            label: "Low Stock",
            value: INVENTORY.filter((i) => i.stock > 0 && i.stock <= i.reorder).length,
            tone: "text-warning-foreground",
          },
          {
            label: "Out of Stock",
            value: INVENTORY.filter((i) => i.stock === 0).length,
            tone: "text-primary",
          },
          { label: "Stock Value", value: `LKR ${totalValue.toLocaleString()}` },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4 shadow-card">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
              {s.label}
            </div>
            <div className={"mt-1.5 font-display text-xl font-bold " + (s.tone ?? "")}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-charcoal text-charcoal-foreground text-[11px] uppercase tracking-wider">
            <tr>
              <th className="text-left px-5 py-2.5">Item</th>
              <th className="text-left px-3 py-2.5">SKU</th>
              <th className="text-left px-3 py-2.5">Category</th>
              <th className="text-right px-3 py-2.5">Stock</th>
              <th className="text-right px-3 py-2.5">Reorder</th>
              <th className="text-right px-3 py-2.5">Unit Cost</th>
              <th className="text-left px-3 py-2.5">Supplier</th>
              <th className="text-left px-3 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {INVENTORY.map((i) => {
              const st = status(i.stock, i.reorder);
              return (
                <tr key={i.id} className="hover:bg-muted/40">
                  <td className="px-5 py-3 font-medium">{i.name}</td>
                  <td className="px-3 py-3 font-mono text-xs text-muted-foreground">{i.sku}</td>
                  <td className="px-3 py-3 text-muted-foreground">{i.category}</td>
                  <td className="px-3 py-3 text-right font-mono font-semibold">
                    {i.stock} {i.unit}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-muted-foreground">
                    {i.reorder}
                  </td>
                  <td className="px-3 py-3 text-right font-mono">LKR {i.cost.toLocaleString()}</td>
                  <td className="px-3 py-3 text-muted-foreground">{i.supplier}</td>
                  <td className="px-3 py-3">
                    <StatusChip variant={st.variant}>{st.label}</StatusChip>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
