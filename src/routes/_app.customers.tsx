import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import { Search, Plus, Download, X, Pencil, Trash2, Car, ChevronDown, ChevronUp } from "lucide-react";
import type { Customer, Vehicle } from "@/lib/db";
import { calcTier } from "@/lib/db";

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

// ─── Customer form (add / edit) ───────────────────────────────────────────────

const BLANK: Omit<Customer, "id" | "createdAt" | "visits" | "spend" | "tier" | "lastVisit"> = {
  name: "",
  phone: "",
  email: "",
  vehicles: [],
};

function CustomerForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: Customer | null;
  onSave: (data: Omit<Customer, "id" | "createdAt" | "visits" | "spend" | "tier" | "lastVisit"> | Customer) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<typeof BLANK>(
    initial
      ? { name: initial.name, phone: initial.phone, email: initial.email, vehicles: initial.vehicles }
      : BLANK,
  );

  function addVehicle() {
    setForm((f) => ({ ...f, vehicles: [...f.vehicles, { plate: "", model: "", color: "" }] }));
  }

  function setVehicle(i: number, field: keyof Vehicle, value: string) {
    setForm((f) => {
      const vs = [...f.vehicles];
      vs[i] = { ...vs[i], [field]: value };
      return { ...f, vehicles: vs };
    });
  }

  function removeVehicle(i: number) {
    setForm((f) => ({ ...f, vehicles: f.vehicles.filter((_, idx) => idx !== i) }));
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (initial) {
      onSave({ ...initial, ...form });
    } else {
      onSave(form);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium">Name *</label>
          <input required className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <div>
          <label className="text-sm font-medium">Phone</label>
          <input className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" placeholder="+94 77 000 0000" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-medium">Email</label>
          <input type="email" className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium">Vehicles</label>
          <button type="button" onClick={addVehicle} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
            <Plus className="h-3 w-3" /> Add vehicle
          </button>
        </div>
        <div className="space-y-2">
          {form.vehicles.map((v, i) => (
            <div key={i} className="grid grid-cols-3 gap-2 items-center">
              <input
                className="rounded-md border border-input bg-background px-2.5 py-1.5 text-sm uppercase placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="PLATE"
                value={v.plate}
                onChange={(e) => setVehicle(i, "plate", e.target.value.toUpperCase())}
              />
              <input
                className="rounded-md border border-input bg-background px-2.5 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Model"
                value={v.model}
                onChange={(e) => setVehicle(i, "model", e.target.value)}
              />
              <div className="flex gap-2">
                <input
                  className="flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Color"
                  value={v.color}
                  onChange={(e) => setVehicle(i, "color", e.target.value)}
                />
                <button type="button" onClick={() => removeVehicle(i)} className="text-muted-foreground hover:text-primary">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
          {form.vehicles.length === 0 && (
            <p className="text-xs text-muted-foreground">No vehicles — add one above</p>
          )}
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onCancel} className="flex-1 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent">Cancel</button>
        <button type="submit" className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-red hover:bg-primary/90">
          {initial ? "Save Changes" : "Add Customer"}
        </button>
      </div>
    </form>
  );
}

// ─── Customer detail row (expanded) ──────────────────────────────────────────

function CustomerRow({ customer, onEdit, onDelete }: { customer: Customer; onEdit: () => void; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const { invoices } = useStore();
  const history = invoices.filter((i) => i.customerId === customer.id).reverse().slice(0, 5);

  return (
    <>
      <tr
        className="hover:bg-muted/40 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="px-5 py-3">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
              {customer.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
            </div>
            <div>
              <div className="font-semibold">{customer.name}</div>
              <div className="text-[11px] text-muted-foreground">{customer.email}</div>
            </div>
          </div>
        </td>
        <td className="px-3 py-3 font-mono text-xs text-muted-foreground">{customer.phone}</td>
        <td className="px-3 py-3 text-right font-mono">{customer.visits}</td>
        <td className="px-3 py-3 text-right font-mono font-semibold">LKR {customer.spend.toLocaleString()}</td>
        <td className="px-3 py-3 text-muted-foreground text-xs">
          {customer.lastVisit
            ? new Date(customer.lastVisit).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })
            : "Never"}
        </td>
        <td className="px-3 py-3 text-right">
          <div className="inline-flex items-center gap-1 text-muted-foreground">
            <Car className="h-3.5 w-3.5" />
            <span className="font-mono">{customer.vehicles.length}</span>
          </div>
        </td>
        <td className="px-3 py-3">
          <StatusChip variant={TIER_TONE[customer.tier]}>{customer.tier}</StatusChip>
        </td>
        <td className="px-3 py-3">
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Edit"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-primary"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-muted/20">
          <td colSpan={8} className="px-5 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Vehicles */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Vehicles</h4>
                {customer.vehicles.length > 0 ? (
                  <div className="space-y-1">
                    {customer.vehicles.map((v, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <Car className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-mono">{v.plate}</span>
                        <span className="text-muted-foreground">{v.model}</span>
                        {v.color && <span className="text-muted-foreground">· {v.color}</span>}
                      </div>
                    ))}
                  </div>
                ) : <p className="text-xs text-muted-foreground">No vehicles on file</p>}
              </div>
              {/* Recent invoices */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Recent Invoices</h4>
                {history.length > 0 ? (
                  <div className="space-y-1">
                    {history.map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between text-sm">
                        <span className="font-mono text-xs text-muted-foreground">{inv.id}</span>
                        <span className="font-mono font-semibold">LKR {inv.total.toLocaleString()}</span>
                        <span className="text-xs text-muted-foreground">{new Date(inv.createdAt).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-xs text-muted-foreground">No invoices yet</p>}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function Customers() {
  const { customers, addCustomer, updateCustomer, deleteCustomer } = useStore();
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("All");
  const [formMode, setFormMode] = useState<null | "add" | Customer>(null);

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      c.name.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.vehicles.some((v) => v.plate.toLowerCase().includes(q));
    const matchesTier = tierFilter === "All" || c.tier === tierFilter;
    return matchesSearch && matchesTier;
  });

  const totalVehicles = customers.reduce((s, c) => s + c.vehicles.length, 0);

  function handleSave(data: Parameters<typeof addCustomer>[0] | Customer) {
    if ("id" in data) {
      updateCustomer({ ...data, tier: calcTier(data.spend) });
      toast.success("Customer updated");
    } else {
      addCustomer(data);
      toast.success("Customer added");
    }
    setFormMode(null);
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this customer? This cannot be undone.")) return;
    deleteCustomer(id);
    toast.error("Customer deleted");
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Customers"
        subtitle={`${customers.length} customers · ${totalVehicles} vehicles on file`}
        actions={
          <>
            <button
              onClick={() => {
                const csv = [
                  ["Name", "Phone", "Email", "Tier", "Visits", "Spend", "Vehicles"].join(","),
                  ...customers.map((c) =>
                    [c.name, c.phone, c.email, c.tier, c.visits, c.spend, c.vehicles.map((v) => v.plate).join(";")].join(","),
                  ),
                ].join("\n");
                const a = document.createElement("a");
                a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
                a.download = "customers.csv";
                a.click();
              }}
              className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent"
            >
              <Download className="h-4 w-4" /> Export
            </button>
            <button
              onClick={() => setFormMode("add")}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-red hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" /> New Customer
            </button>
          </>
        }
      />

      {/* Add/Edit form panel */}
      {formMode && (
        <div className="mb-6 rounded-xl border border-border bg-card shadow-card p-5">
          <h2 className="font-display font-bold mb-4">
            {formMode === "add" ? "Add New Customer" : `Edit — ${(formMode as Customer).name}`}
          </h2>
          <CustomerForm
            initial={formMode === "add" ? null : (formMode as Customer)}
            onSave={handleSave}
            onCancel={() => setFormMode(null)}
          />
        </div>
      )}

      <div className="rounded-xl border border-border bg-card shadow-card">
        <div className="flex items-center gap-3 p-4 border-b border-border">
          <div className="flex flex-1 items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              className="flex-1 bg-transparent outline-none"
              placeholder="Search by name, phone, plate…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
          >
            <option>All</option>
            <option>Platinum</option>
            <option>Gold</option>
            <option>Silver</option>
            <option>Bronze</option>
          </select>
        </div>

        <div className="overflow-x-auto">
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
                <th className="w-24 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((c) => (
                <CustomerRow
                  key={c.id}
                  customer={c}
                  onEdit={() => setFormMode(c)}
                  onDelete={() => handleDelete(c.id)}
                />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-muted-foreground">
                    {search || tierFilter !== "All" ? "No customers match your filter" : "No customers yet"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
