import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { isManagerOrAbove } from "@/lib/permissions";
import { formatCurrency } from "@/lib/currency";
import { formatDate } from "@/lib/date-format";
import { useConfirm } from "@/hooks/use-confirm";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import {
  Search,
  Plus,
  Download,
  X,
  Pencil,
  Trash2,
  Car,
  ChevronDown,
  ChevronUp,
  Gift,
  Ticket,
  Power,
  FileDown,
} from "lucide-react";
import type { Customer, Vehicle, Coupon, CouponType } from "@/lib/db";
import { calcTier, isCouponValid } from "@/lib/db";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/customers")({
  head: () => ({ meta: [{ title: "Customers · Polish Station OS" }] }),
  component: Customers,
});

const TIER_TONE = {
  Bronze: "neutral",
  Silver: "info",
  Gold: "warning",
  Platinum: "brand",
} as const;

// ─── Customer form (add / edit) ───────────────────────────────────────────────

const BLANK: Omit<
  Customer,
  "id" | "createdAt" | "visits" | "spend" | "tier" | "lastVisit" | "loyaltyPoints"
> = {
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
  onSave: (
    data:
      | Omit<
          Customer,
          "id" | "createdAt" | "visits" | "spend" | "tier" | "lastVisit" | "loyaltyPoints"
        >
      | Customer,
  ) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<typeof BLANK>(
    initial
      ? {
          name: initial.name,
          phone: initial.phone,
          email: initial.email,
          vehicles: initial.vehicles,
        }
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
          <input
            required
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-sm font-medium">Phone</label>
          <input
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="+94 77 000 0000"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-medium">Email</label>
          <input
            type="email"
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium">Vehicles</label>
          <button
            type="button"
            onClick={addVehicle}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Plus className="h-3 w-3" /> Add vehicle
          </button>
        </div>
        <div className="space-y-2">
          {form.vehicles.map((v, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 items-center sm:grid-cols-3">
              <input
                className="min-h-9 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm uppercase placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="PLATE"
                value={v.plate}
                onChange={(e) => setVehicle(i, "plate", e.target.value.toUpperCase())}
              />
              <input
                className="min-h-9 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Model"
                value={v.model}
                onChange={(e) => setVehicle(i, "model", e.target.value)}
              />
              <div className="flex gap-2">
                <input
                  className="min-h-9 flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Color"
                  value={v.color}
                  onChange={(e) => setVehicle(i, "color", e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => removeVehicle(i)}
                  aria-label="Remove vehicle"
                  className="shrink-0 rounded-md p-2 text-muted-foreground hover:text-primary"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
          {form.vehicles.length === 0 && (
            <p className="text-xs text-muted-foreground">No vehicles, add one above</p>
          )}
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-red hover:bg-primary/90"
        >
          {initial ? "Save Changes" : "Add Customer"}
        </button>
      </div>
    </form>
  );
}

// ─── Customer detail row (expanded) ──────────────────────────────────────────

// Shared by the desktop table row and the mobile card so the invoice/job
// lookup and the data-subject export aren't implemented twice.
function useCustomerHistory(customer: Customer) {
  const { invoices } = useStore();
  const customerInvoices = invoices.filter((i) => i.customerId === customer.id).reverse();
  const history = customerInvoices.slice(0, 5);

  // A data-subject export: everything this business holds on one customer
  // (profile, vehicles, loyalty balance, and full invoice history), not
  // just the 5-row preview shown in the expanded panel.
  function exportCustomerData() {
    const payload = {
      exportedAt: new Date().toISOString(),
      customer,
      invoices: customerInvoices,
    };
    const json = JSON.stringify(payload, null, 2);
    const a = document.createElement("a");
    a.href = "data:application/json;charset=utf-8," + encodeURIComponent(json);
    a.download = `customer-${customer.id}-data.json`;
    a.click();
  }

  return { history, exportCustomerData };
}

function CustomerDetailPanel({
  customer,
  history,
}: {
  customer: Customer;
  history: ReturnType<typeof useCustomerHistory>["history"];
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Loyalty */}
      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
          Loyalty
        </h4>
        <div className="flex items-center gap-1.5 text-sm">
          <Gift className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-mono font-semibold">
            {customer.loyaltyPoints.toLocaleString()} pts
          </span>
          <span className="text-xs text-muted-foreground">
            (≈ {formatCurrency(customer.loyaltyPoints)} redeemable)
          </span>
        </div>
      </div>
      {/* Vehicles */}
      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
          Vehicles
        </h4>
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
        ) : (
          <p className="text-xs text-muted-foreground">No vehicles on file</p>
        )}
      </div>
      {/* Recent invoices */}
      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
          Recent Invoices
        </h4>
        {history.length > 0 ? (
          <div className="space-y-1">
            {history.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between text-sm">
                <span className="font-mono text-xs text-muted-foreground">{inv.id}</span>
                <span className="font-mono font-semibold">{formatCurrency(inv.total)}</span>
                <span className="text-xs text-muted-foreground">{formatDate(inv.createdAt)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No invoices yet</p>
        )}
      </div>
    </div>
  );
}

function CustomerRow({
  customer,
  onEdit,
  onDelete,
}: {
  customer: Customer;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { history, exportCustomerData } = useCustomerHistory(customer);

  return (
    <>
      <tr className="hover:bg-muted/40 cursor-pointer" onClick={() => setExpanded((v) => !v)}>
        <td className="px-5 py-3">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
              {customer.name
                .split(" ")
                .map((p) => p[0])
                .slice(0, 2)
                .join("")}
            </div>
            <div>
              <div className="font-semibold">{customer.name}</div>
              <div className="text-[11px] text-muted-foreground">{customer.email}</div>
            </div>
          </div>
        </td>
        <td className="px-3 py-3 font-mono text-xs text-muted-foreground">{customer.phone}</td>
        <td className="px-3 py-3 text-right font-mono">{customer.visits}</td>
        <td className="px-3 py-3 text-right font-mono font-semibold">
          {formatCurrency(customer.spend)}
        </td>
        <td className="px-3 py-3 text-muted-foreground text-xs">
          {customer.lastVisit ? formatDate(customer.lastVisit) : "Never"}
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
              onClick={(e) => {
                e.stopPropagation();
                exportCustomerData();
              }}
              aria-label="Export customer data"
              className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Export this customer's data (profile, vehicles, invoices)"
            >
              <FileDown className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              aria-label="Edit customer"
              className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Edit"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              aria-label="Delete customer"
              className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-primary"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-muted/20">
          <td colSpan={8} className="px-5 py-4">
            <CustomerDetailPanel customer={customer} history={history} />
          </td>
        </tr>
      )}
    </>
  );
}

// Mobile equivalent of CustomerRow: a stacked card instead of a table row,
// sharing the same history lookup and expanded detail panel.
function CustomerCard({
  customer,
  onEdit,
  onDelete,
}: {
  customer: Customer;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { history, exportCustomerData } = useCustomerHistory(customer);

  return (
    <div className="p-4">
      <button
        className="flex w-full items-start gap-2.5 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
          {customer.name
            .split(" ")
            .map((p) => p[0])
            .slice(0, 2)
            .join("")}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold truncate">{customer.name}</span>
            <StatusChip variant={TIER_TONE[customer.tier]}>{customer.tier}</StatusChip>
          </div>
          <div className="text-[11px] text-muted-foreground truncate">
            {customer.phone || customer.email || "No contact on file"}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{customer.visits} visits</span>
            <span className="font-mono font-semibold text-foreground">
              {formatCurrency(customer.spend)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Car className="h-3 w-3" /> {customer.vehicles.length}
            </span>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          onClick={exportCustomerData}
          className="inline-flex items-center gap-1 rounded-md border border-input px-2.5 py-1.5 text-[11px] font-medium hover:bg-accent"
        >
          <FileDown className="h-3.5 w-3.5" /> Export
        </button>
        <button
          onClick={onEdit}
          className="inline-flex items-center gap-1 rounded-md border border-input px-2.5 py-1.5 text-[11px] font-medium hover:bg-accent"
        >
          <Pencil className="h-3.5 w-3.5" /> Edit
        </button>
        <button
          onClick={onDelete}
          className="inline-flex items-center gap-1 rounded-md border border-input px-2.5 py-1.5 text-[11px] font-medium hover:bg-accent hover:text-primary"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </button>
      </div>

      {expanded && (
        <div className="mt-3 border-t border-border pt-3">
          <CustomerDetailPanel customer={customer} history={history} />
        </div>
      )}
    </div>
  );
}

// ─── Coupon form (add / edit) ─────────────────────────────────────────────────

const BLANK_COUPON: Omit<Coupon, "id" | "createdAt" | "redeemedCount"> = {
  code: "",
  type: "percent",
  value: 10,
  active: true,
  expiresAt: null,
  maxRedemptions: null,
};

function CouponForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: Coupon | null;
  onSave: (data: Omit<Coupon, "id" | "createdAt" | "redeemedCount"> | Coupon) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<typeof BLANK_COUPON>(
    initial
      ? {
          code: initial.code,
          type: initial.type,
          value: initial.value,
          active: initial.active,
          expiresAt: initial.expiresAt,
          maxRedemptions: initial.maxRedemptions,
        }
      : BLANK_COUPON,
  );

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const code = form.code.trim().toUpperCase();
    if (!code || form.value <= 0) return;
    const data = { ...form, code };
    if (initial) onSave({ ...initial, ...data });
    else onSave(data);
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium">Code *</label>
          <input
            required
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-ring"
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
          />
        </div>
        <div>
          <label className="text-sm font-medium">Type</label>
          <select
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={form.type}
            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as CouponType }))}
          >
            <option value="percent">Percent off</option>
            <option value="fixed">Fixed amount off</option>
          </select>
        </div>
        <div>
          <label className="text-sm font-medium">
            Value {form.type === "percent" ? "(%)" : "(LKR)"} *
          </label>
          <input
            required
            type="number"
            min={0}
            max={form.type === "percent" ? 100 : undefined}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            value={form.value}
            onChange={(e) => setForm((f) => ({ ...f, value: Number(e.target.value) || 0 }))}
          />
        </div>
        <div>
          <label className="text-sm font-medium">Expires</label>
          <input
            type="date"
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            value={form.expiresAt ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value || null }))}
          />
        </div>
        <div>
          <label className="text-sm font-medium">Max redemptions</label>
          <input
            type="number"
            min={0}
            placeholder="Unlimited"
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            value={form.maxRedemptions ?? ""}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                maxRedemptions: e.target.value === "" ? null : Math.max(0, Number(e.target.value)),
              }))
            }
          />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
            />
            Active
          </label>
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-red hover:bg-primary/90"
        >
          {initial ? "Save Changes" : "Add Coupon"}
        </button>
      </div>
    </form>
  );
}

// ─── Coupons panel ─────────────────────────────────────────────────────────────
// Reads are open to anyone on this page (matches firestore.rules); creating,
// editing and deleting coupon terms is a Manager+ action, the same gating
// convention used for refunds and other business-sensitive POS actions.

function CouponsPanel() {
  const { coupons, addCoupon, updateCoupon, deleteCoupon } = useStore();
  const { staff } = useAuth();
  const canManage = isManagerOrAbove(staff?.role);
  const [formMode, setFormMode] = useState<null | "add" | Coupon>(null);
  const { confirm, ConfirmDialog } = useConfirm();

  function handleSave(data: Omit<Coupon, "id" | "createdAt" | "redeemedCount"> | Coupon) {
    if ("id" in data) {
      updateCoupon(data);
      toast.success("Coupon updated");
    } else {
      addCoupon(data);
      toast.success("Coupon added");
    }
    setFormMode(null);
  }

  async function handleDelete(id: string) {
    if (!(await confirm({ title: "Delete this coupon? This cannot be undone." }))) return;
    deleteCoupon(id);
    toast.error("Coupon deleted");
  }

  return (
    <div className="mt-6 rounded-xl border border-border bg-card shadow-card">
      {ConfirmDialog}
      <div className="flex flex-col gap-3 p-4 border-b border-border sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display font-bold flex items-center gap-2">
            <Ticket className="h-4 w-4" /> Coupons
          </h2>
          <p className="text-xs text-muted-foreground">Codes customers can redeem at checkout</p>
        </div>
        {canManage && (
          <button
            onClick={() => setFormMode("add")}
            className="inline-flex min-h-9 items-center gap-1 self-start rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-red hover:bg-primary/90 sm:self-auto"
          >
            <Plus className="h-4 w-4" /> New Coupon
          </button>
        )}
      </div>

      {formMode && canManage && (
        <div className="p-5 border-b border-border">
          <h3 className="font-display font-bold mb-4">
            {formMode === "add" ? "Add New Coupon" : `Edit · ${(formMode as Coupon).code}`}
          </h3>
          <CouponForm
            initial={formMode === "add" ? null : (formMode as Coupon)}
            onSave={handleSave}
            onCancel={() => setFormMode(null)}
          />
        </div>
      )}

      {/* Mobile: stacked cards */}
      <div className="divide-y divide-border md:hidden">
        {coupons.map((c) => {
          const valid = isCouponValid(c);
          return (
            <div key={c.id} className="p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-semibold">{c.code}</span>
                <StatusChip variant={valid ? "success" : "neutral"}>
                  {c.active ? (valid ? "Active" : "Expired/Full") : "Disabled"}
                </StatusChip>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{c.type === "percent" ? `${c.value}%` : formatCurrency(c.value)} off</span>
                <span>Expires {c.expiresAt ? formatDate(c.expiresAt) : "Never"}</span>
                <span className="font-mono">
                  {c.redeemedCount}
                  {c.maxRedemptions != null ? ` / ${c.maxRedemptions}` : ""} redeemed
                </span>
              </div>
              {canManage && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    onClick={() => updateCoupon({ ...c, active: !c.active })}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md border border-input px-2.5 py-1.5 text-[11px] font-medium hover:bg-accent",
                      c.active ? "text-muted-foreground" : "text-success",
                    )}
                  >
                    <Power className="h-3.5 w-3.5" /> {c.active ? "Disable" : "Enable"}
                  </button>
                  <button
                    onClick={() => setFormMode(c)}
                    className="inline-flex items-center gap-1 rounded-md border border-input px-2.5 py-1.5 text-[11px] font-medium hover:bg-accent"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button
                    onClick={() => handleDelete(c.id)}
                    className="inline-flex items-center gap-1 rounded-md border border-input px-2.5 py-1.5 text-[11px] font-medium hover:bg-accent hover:text-primary"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {coupons.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">No coupons yet</div>
        )}
      </div>

      {/* Tablet/desktop: table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="bg-charcoal text-charcoal-foreground text-[11px] uppercase tracking-wider">
            <tr>
              <th className="text-left px-5 py-2.5">Code</th>
              <th className="text-left px-3 py-2.5">Discount</th>
              <th className="text-left px-3 py-2.5">Expires</th>
              <th className="text-right px-3 py-2.5">Redemptions</th>
              <th className="text-left px-3 py-2.5">Status</th>
              {canManage && <th className="w-24 px-3 py-2.5" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {coupons.map((c) => {
              const valid = isCouponValid(c);
              return (
                <tr key={c.id} className="hover:bg-muted/40">
                  <td className="px-5 py-2.5 font-mono font-semibold">{c.code}</td>
                  <td className="px-3 py-2.5">
                    {c.type === "percent" ? `${c.value}%` : formatCurrency(c.value)} off
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground text-xs">
                    {c.expiresAt ? formatDate(c.expiresAt) : "Never"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">
                    {c.redeemedCount}
                    {c.maxRedemptions != null ? ` / ${c.maxRedemptions}` : ""}
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusChip variant={valid ? "success" : "neutral"}>
                      {c.active ? (valid ? "Active" : "Expired/Full") : "Disabled"}
                    </StatusChip>
                  </td>
                  {canManage && (
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => updateCoupon({ ...c, active: !c.active })}
                          aria-label={c.active ? "Disable coupon" : "Enable coupon"}
                          className={cn(
                            "rounded p-2 hover:bg-muted",
                            c.active
                              ? "text-muted-foreground hover:text-foreground"
                              : "text-success",
                          )}
                          title={c.active ? "Disable" : "Enable"}
                        >
                          <Power className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setFormMode(c)}
                          aria-label="Edit coupon"
                          className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(c.id)}
                          aria-label="Delete coupon"
                          className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-primary"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
            {coupons.length === 0 && (
              <tr>
                <td colSpan={canManage ? 6 : 5} className="text-center py-8 text-muted-foreground">
                  No coupons yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function Customers() {
  const { customers, addCustomer, updateCustomer, deleteCustomer } = useStore();
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("All");
  const [formMode, setFormMode] = useState<null | "add" | Customer>(null);
  const { confirm, ConfirmDialog } = useConfirm();

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

  async function handleDelete(id: string) {
    if (!(await confirm({ title: "Delete this customer? This cannot be undone." }))) return;
    deleteCustomer(id);
    toast.error("Customer deleted");
  }

  return (
    <div className="p-4 sm:p-6">
      {ConfirmDialog}
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
                    [
                      c.name,
                      c.phone,
                      c.email,
                      c.tier,
                      c.visits,
                      c.spend,
                      c.vehicles.map((v) => v.plate).join(";"),
                    ].join(","),
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
            {formMode === "add" ? "Add New Customer" : `Edit · ${(formMode as Customer).name}`}
          </h2>
          <CustomerForm
            initial={formMode === "add" ? null : (formMode as Customer)}
            onSave={handleSave}
            onCancel={() => setFormMode(null)}
          />
        </div>
      )}

      <div className="rounded-xl border border-border bg-card shadow-card">
        <div className="flex flex-col gap-3 p-4 border-b border-border sm:flex-row sm:items-center">
          <div className="flex flex-1 items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              className="flex-1 bg-transparent outline-none"
              placeholder="Search by name, phone, plate…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="min-h-9 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
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

        {/* Mobile: stacked cards */}
        <div className="divide-y divide-border md:hidden">
          {filtered.map((c) => (
            <CustomerCard
              key={c.id}
              customer={c}
              onEdit={() => setFormMode(c)}
              onDelete={() => handleDelete(c.id)}
            />
          ))}
          {filtered.length === 0 && (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {search || tierFilter !== "All"
                ? "No customers match your filter"
                : "No customers yet"}
            </div>
          )}
        </div>

        {/* Tablet/desktop: table */}
        <div className="hidden overflow-x-auto md:block">
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
                    {search || tierFilter !== "All"
                      ? "No customers match your filter"
                      : "No customers yet"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <CouponsPanel />
    </div>
  );
}
