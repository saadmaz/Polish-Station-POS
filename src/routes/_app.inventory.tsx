import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import { Plus, FileText, Pencil, Trash2, Minus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InventoryItem } from "@/lib/db";
import { newId } from "@/lib/db";

export const Route = createFileRoute("/_app/inventory")({
  head: () => ({ meta: [{ title: "Inventory — Polish Station OS" }] }),
  component: Inventory,
});

function stockStatus(stock: number, reorder: number) {
  if (stock === 0) return { label: "Out of Stock", variant: "danger" as const };
  if (stock <= reorder) return { label: "Low Stock", variant: "warning" as const };
  return { label: "In Stock", variant: "success" as const };
}

// ─── Item form ────────────────────────────────────────────────────────────────

const BLANK: Omit<InventoryItem, "id" | "lastUpdated"> = {
  name: "",
  sku: "",
  category: "",
  unit: "L",
  stock: 0,
  reorder: 5,
  cost: 0,
  supplier: "",
};

function ItemForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: InventoryItem | null;
  onSave: (item: InventoryItem) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<typeof BLANK>(
    initial ? { name: initial.name, sku: initial.sku, category: initial.category, unit: initial.unit, stock: initial.stock, reorder: initial.reorder, cost: initial.cost, supplier: initial.supplier }
    : BLANK,
  );

  function set<K extends keyof typeof BLANK>(k: K, v: (typeof BLANK)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      ...form,
      id: initial?.id ?? newId("inv"),
      lastUpdated: new Date().toISOString(),
    });
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="text-sm font-medium">Item Name *</label>
          <input required className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" value={form.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div>
          <label className="text-sm font-medium">SKU</label>
          <input className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring" value={form.sku} onChange={(e) => set("sku", e.target.value)} />
        </div>
        <div>
          <label className="text-sm font-medium">Category</label>
          <input className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" value={form.category} onChange={(e) => set("category", e.target.value)} />
        </div>
        <div>
          <label className="text-sm font-medium">Unit</label>
          <input className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" placeholder="L, kg, pc, kit…" value={form.unit} onChange={(e) => set("unit", e.target.value)} />
        </div>
        <div>
          <label className="text-sm font-medium">Supplier</label>
          <input className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" value={form.supplier} onChange={(e) => set("supplier", e.target.value)} />
        </div>
        <div>
          <label className="text-sm font-medium">Current Stock</label>
          <input type="number" min={0} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring" value={form.stock} onChange={(e) => set("stock", Number(e.target.value))} />
        </div>
        <div>
          <label className="text-sm font-medium">Reorder Point</label>
          <input type="number" min={0} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring" value={form.reorder} onChange={(e) => set("reorder", Number(e.target.value))} />
        </div>
        <div>
          <label className="text-sm font-medium">Unit Cost (LKR)</label>
          <input type="number" min={0} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring" value={form.cost} onChange={(e) => set("cost", Number(e.target.value))} />
        </div>
      </div>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onCancel} className="flex-1 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent">Cancel</button>
        <button type="submit" className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-red hover:bg-primary/90">
          {initial ? "Save Changes" : "Add Item"}
        </button>
      </div>
    </form>
  );
}

// ─── Adjustment inline widget ─────────────────────────────────────────────────

function AdjustWidget({ item }: { item: InventoryItem }) {
  const { adjustStock } = useStore();
  const [delta, setDelta] = useState("");
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">
        Adjust
      </button>
    );
  }

  function apply(sign: 1 | -1) {
    const n = Number(delta);
    if (!n || isNaN(n)) return;
    adjustStock(item.id, sign * n);
    toast.success(`${item.name}: ${sign > 0 ? "+" : ""}${sign * n} ${item.unit}`);
    setDelta("");
    setOpen(false);
  }

  return (
    <div className="flex items-center gap-1">
      <button onClick={() => apply(-1)} className="rounded bg-primary/10 p-1 text-primary hover:bg-primary/20">
        <Minus className="h-3 w-3" />
      </button>
      <input
        autoFocus
        type="number"
        min={1}
        className="w-14 rounded border border-input bg-background px-1.5 py-1 text-xs font-mono text-center focus:outline-none focus:ring-1 focus:ring-ring"
        value={delta}
        onChange={(e) => setDelta(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") apply(1); if (e.key === "Escape") setOpen(false); }}
        placeholder="qty"
      />
      <button onClick={() => apply(1)} className="rounded bg-success/10 p-1 text-success hover:bg-success/20">
        <Plus className="h-3 w-3" />
      </button>
      <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function Inventory() {
  const { inventory, upsertInventoryItem, deleteInventoryItem } = useStore();
  const [formMode, setFormMode] = useState<null | "add" | InventoryItem>(null);
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");

  const categories = ["All", ...Array.from(new Set(inventory.map((i) => i.category))).sort()];

  const filtered = inventory.filter((i) => {
    const matchCat = categoryFilter === "All" || i.category === categoryFilter;
    const st = stockStatus(i.stock, i.reorder);
    const matchSt =
      statusFilter === "All" ||
      (statusFilter === "Low" && st.variant === "warning") ||
      (statusFilter === "Out" && st.variant === "danger") ||
      (statusFilter === "OK" && st.variant === "success");
    return matchCat && matchSt;
  });

  const totalValue = inventory.reduce((s, i) => s + i.stock * i.cost, 0);
  const lowCount = inventory.filter((i) => i.stock > 0 && i.stock <= i.reorder).length;
  const outCount = inventory.filter((i) => i.stock === 0).length;

  function handleSave(item: InventoryItem) {
    upsertInventoryItem(item);
    toast.success(formMode === "add" ? "Item added" : "Item updated");
    setFormMode(null);
  }

  function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"?`)) return;
    deleteInventoryItem(id);
    toast.error("Item removed");
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Inventory"
        subtitle={`${inventory.length} SKUs · LKR ${totalValue.toLocaleString()} on hand`}
        actions={
          <>
            <button
              onClick={() => setFormMode("add")}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-red hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" /> Add Item
            </button>
          </>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label: "Total SKUs", value: inventory.length, tone: "" },
          { label: "Low Stock", value: lowCount, tone: "text-warning" },
          { label: "Out of Stock", value: outCount, tone: "text-primary" },
          { label: "Stock Value", value: `LKR ${totalValue.toLocaleString()}`, tone: "" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4 shadow-card">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{s.label}</div>
            <div className={cn("mt-1.5 font-display text-xl font-bold", s.tone)}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Form */}
      {formMode && (
        <div className="mb-6 rounded-xl border border-border bg-card shadow-card p-5">
          <h2 className="font-display font-bold mb-4">
            {formMode === "add" ? "Add New Item" : `Edit — ${(formMode as InventoryItem).name}`}
          </h2>
          <ItemForm
            initial={formMode === "add" ? null : (formMode as InventoryItem)}
            onSave={handleSave}
            onCancel={() => setFormMode(null)}
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-3">
        <select className="rounded-md border border-input bg-background px-3 py-1.5 text-sm" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          {categories.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className="rounded-md border border-input bg-background px-3 py-1.5 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="All">All Statuses</option>
          <option value="OK">In Stock</option>
          <option value="Low">Low Stock</option>
          <option value="Out">Out of Stock</option>
        </select>
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
              <th className="px-3 py-2.5 w-36">Adjust</th>
              <th className="w-20 px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((i) => {
              const st = stockStatus(i.stock, i.reorder);
              return (
                <tr key={i.id} className="hover:bg-muted/40">
                  <td className="px-5 py-3 font-medium">{i.name}</td>
                  <td className="px-3 py-3 font-mono text-xs text-muted-foreground">{i.sku}</td>
                  <td className="px-3 py-3 text-muted-foreground">{i.category}</td>
                  <td className="px-3 py-3 text-right font-mono font-semibold">
                    {i.stock} <span className="text-muted-foreground">{i.unit}</span>
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-muted-foreground">{i.reorder}</td>
                  <td className="px-3 py-3 text-right font-mono">LKR {i.cost.toLocaleString()}</td>
                  <td className="px-3 py-3 text-muted-foreground">{i.supplier}</td>
                  <td className="px-3 py-3">
                    <StatusChip variant={st.variant}>{st.label}</StatusChip>
                  </td>
                  <td className="px-3 py-3">
                    <AdjustWidget item={i} />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setFormMode(i)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => handleDelete(i.id, i.name)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-primary" title="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="text-center py-10 text-muted-foreground">No items match your filter</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
