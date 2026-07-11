import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  ShoppingCart,
  Plus,
  ChevronDown,
  ChevronRight,
  FileDown,
  Send,
  PackageCheck,
  X,
  Trash2,
  Zap,
  CheckCircle2,
  Clock3,
  AlertTriangle,
} from "lucide-react";
import { useStore } from "@/lib/store";
import type { PurchaseOrder, POLine, POStatus } from "@/lib/db";
import { downloadPOPDF } from "@/lib/pdf";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/purchase-orders")({
  component: PurchaseOrdersPage,
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
function fmtLKR(n: number) {
  return `LKR ${n.toLocaleString()}`;
}
function poTotal(po: PurchaseOrder) {
  return po.lines.reduce((s, l) => s + l.unitCost * l.qtyOrdered, 0);
}

const STATUS_BADGE: Record<POStatus, string> = {
  Draft: "bg-muted text-muted-foreground",
  Sent: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
  Received: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
  "Partially Received": "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  Cancelled: "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400",
};

// ─── Create PO Form ──────────────────────────────────────────────────────────

function CreatePOForm({
  onSave,
  onCancel,
}: {
  onSave: (data: Omit<PurchaseOrder, "id" | "poNumber" | "createdAt">) => void;
  onCancel: () => void;
}) {
  const { inventory } = useStore();
  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");
  const [createdBy, setCreatedBy] = useState("");
  const [lines, setLines] = useState<POLine[]>([]);
  const [itemPick, setItemPick] = useState("");

  function addLine(itemId: string) {
    if (!itemId) return;
    if (lines.find((l) => l.inventoryItemId === itemId)) return;
    const item = inventory.find((i) => i.id === itemId);
    if (!item) return;
    setLines((ls) => [
      ...ls,
      {
        inventoryItemId: item.id,
        itemName: item.name,
        sku: item.sku,
        unit: item.unit,
        qtyOrdered: Math.max(1, item.reorder - item.stock),
        unitCost: item.cost,
        qtyReceived: 0,
      },
    ]);
    setItemPick("");
  }

  function updateLine(idx: number, k: "qtyOrdered" | "unitCost", v: number) {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, [k]: v } : l)));
  }

  function removeLine(idx: number) {
    setLines((ls) => ls.filter((_, i) => i !== idx));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supplier.trim() || lines.length === 0) return;
    onSave({ supplier, status: "Draft", lines, notes, createdBy, sentAt: null, receivedAt: null });
  }

  const inp =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
  const lbl = "block text-xs font-medium text-muted-foreground mb-1";
  const total = lines.reduce((s, l) => s + l.unitCost * l.qtyOrdered, 0);

  return (
    <form onSubmit={submit} className="rounded-lg border border-border bg-muted/30 p-5 space-y-4">
      <p className="font-semibold">Create Purchase Order</p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <label className={lbl}>Supplier *</label>
          <input
            className={inp}
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            placeholder="Supplier name"
            required
          />
        </div>
        <div>
          <label className={lbl}>Raised By</label>
          <input
            className={inp}
            value={createdBy}
            onChange={(e) => setCreatedBy(e.target.value)}
            placeholder="Your name"
          />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className={lbl}>Notes</label>
          <input
            className={inp}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes"
          />
        </div>
      </div>

      {/* Line item picker */}
      <div>
        <label className={lbl}>Add Inventory Item</label>
        <div className="flex gap-2">
          <select
            className={cn(inp, "flex-1")}
            value={itemPick}
            onChange={(e) => {
              setItemPick(e.target.value);
              addLine(e.target.value);
            }}
          >
            <option value="">— Select item to add —</option>
            {inventory
              .filter((i) => !lines.find((l) => l.inventoryItemId === i.id))
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.sku}) — Stock: {i.stock} {i.unit}
                </option>
              ))}
          </select>
        </div>
      </div>

      {/* Lines table */}
      {lines.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  Item / SKU
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">
                  Unit
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">
                  Qty
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                  Unit Cost (LKR)
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                  Line Total
                </th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => (
                <tr key={l.inventoryItemId} className="border-t border-border">
                  <td className="px-3 py-2">
                    <div className="font-medium">{l.itemName}</div>
                    <div className="text-xs text-muted-foreground">{l.sku}</div>
                  </td>
                  <td className="px-3 py-2 text-center text-muted-foreground">{l.unit}</td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={1}
                      className="w-20 rounded border border-input bg-background px-2 py-1 text-center text-sm"
                      value={l.qtyOrdered}
                      onChange={(e) => updateLine(idx, "qtyOrdered", parseInt(e.target.value) || 1)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      className="w-28 rounded border border-input bg-background px-2 py-1 text-right text-sm"
                      value={l.unitCost}
                      onChange={(e) => updateLine(idx, "unitCost", parseFloat(e.target.value) || 0)}
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    {fmtLKR(l.unitCost * l.qtyOrdered)}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => removeLine(idx)}
                      className="rounded p-1 text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/30">
                <td colSpan={4} className="px-3 py-2 text-right text-sm font-semibold">
                  Order Total
                </td>
                <td className="px-3 py-2 text-right text-sm font-bold">{fmtLKR(total)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={lines.length === 0}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Create PO
        </button>
      </div>
    </form>
  );
}

// ─── Receive Modal ────────────────────────────────────────────────────────────

function ReceivePanel({
  po,
  onConfirm,
  onCancel,
}: {
  po: PurchaseOrder;
  onConfirm: (lines: { inventoryItemId: string; qtyReceived: number }[]) => void;
  onCancel: () => void;
}) {
  const [received, setReceived] = useState<Record<string, number>>(
    Object.fromEntries(po.lines.map((l) => [l.inventoryItemId, l.qtyOrdered - l.qtyReceived])),
  );

  function setAll() {
    setReceived(
      Object.fromEntries(po.lines.map((l) => [l.inventoryItemId, l.qtyOrdered - l.qtyReceived])),
    );
  }

  function confirm() {
    const lines = po.lines.map((l) => ({
      inventoryItemId: l.inventoryItemId,
      qtyReceived: l.qtyReceived + (received[l.inventoryItemId] ?? 0),
    }));
    onConfirm(lines);
  }

  const inp = "w-20 rounded border border-input bg-background px-2 py-1 text-center text-sm";

  return (
    <div className="mt-3 rounded-lg border border-border bg-background p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold flex items-center gap-1.5">
          <PackageCheck className="h-4 w-4" /> Receive Stock
        </p>
        <button type="button" onClick={setAll} className="text-xs text-primary hover:underline">
          Set all to ordered qty
        </button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/50">
            <th className="px-3 py-1.5 text-left text-xs font-medium text-muted-foreground">
              Item
            </th>
            <th className="px-3 py-1.5 text-center text-xs font-medium text-muted-foreground">
              Ordered
            </th>
            <th className="px-3 py-1.5 text-center text-xs font-medium text-muted-foreground">
              Already Received
            </th>
            <th className="px-3 py-1.5 text-center text-xs font-medium text-muted-foreground">
              Receiving Now
            </th>
          </tr>
        </thead>
        <tbody>
          {po.lines.map((l) => {
            const remaining = l.qtyOrdered - l.qtyReceived;
            return (
              <tr key={l.inventoryItemId} className="border-t border-border">
                <td className="px-3 py-2">
                  <div className="font-medium">{l.itemName}</div>
                  <div className="text-xs text-muted-foreground">{l.sku}</div>
                </td>
                <td className="px-3 py-2 text-center">
                  {l.qtyOrdered} {l.unit}
                </td>
                <td className="px-3 py-2 text-center text-muted-foreground">{l.qtyReceived}</td>
                <td className="px-3 py-2 text-center">
                  <input
                    type="number"
                    min={0}
                    max={remaining}
                    className={inp}
                    value={received[l.inventoryItemId] ?? 0}
                    onChange={(e) =>
                      setReceived((r) => ({
                        ...r,
                        [l.inventoryItemId]: Math.min(remaining, parseInt(e.target.value) || 0),
                      }))
                    }
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={confirm}
          className="flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
        >
          <PackageCheck className="h-4 w-4" /> Confirm Receipt & Update Stock
        </button>
      </div>
    </div>
  );
}

// ─── PO Row ───────────────────────────────────────────────────────────────────

function PORow({ po }: { po: PurchaseOrder }) {
  const { updatePurchaseOrder, deletePurchaseOrder, receivePO } = useStore();
  const [open, setOpen] = useState(false);
  const [receiving, setReceiving] = useState(false);

  const total = poTotal(po);
  const canSend = po.status === "Draft";
  const canReceive = po.status === "Sent" || po.status === "Partially Received";
  const canCancel = po.status === "Draft" || po.status === "Sent";

  function markSent() {
    updatePurchaseOrder({ ...po, status: "Sent", sentAt: new Date().toISOString() });
  }

  function cancel() {
    if (confirm("Cancel this purchase order?")) {
      updatePurchaseOrder({ ...po, status: "Cancelled" });
    }
  }

  return (
    <>
      <tr
        className={cn(
          "border-t border-border transition-colors hover:bg-muted/30 cursor-pointer",
          open && "bg-muted/20",
        )}
        onClick={() => setOpen((o) => !o)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                open ? "bg-primary text-primary-foreground" : "bg-muted",
              )}
            >
              {open ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </span>
            <span className="text-sm font-mono font-semibold">{po.poNumber}</span>
          </div>
        </td>
        <td className="px-4 py-3 text-sm font-medium">{po.supplier}</td>
        <td className="px-4 py-3 text-sm text-muted-foreground">{fmtDate(po.createdAt)}</td>
        <td className="px-4 py-3 text-sm text-muted-foreground">
          {po.lines.length} item{po.lines.length !== 1 ? "s" : ""}
        </td>
        <td className="px-4 py-3 text-sm font-semibold">{fmtLKR(total)}</td>
        <td className="px-4 py-3">
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-medium",
              STATUS_BADGE[po.status],
            )}
          >
            {po.status}
          </span>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => downloadPOPDF(po)}
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Download PDF"
            >
              <FileDown className="h-4 w-4" />
            </button>
            {po.status === "Draft" && (
              <button
                onClick={() => {
                  if (confirm("Delete this draft PO?")) deletePurchaseOrder(po.id);
                }}
                className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                title="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </td>
      </tr>

      {open && (
        <tr className="border-t border-border">
          <td colSpan={7} className="bg-muted/10 px-6 py-4">
            {/* PO meta */}
            <div className="mb-3 grid grid-cols-2 gap-x-8 text-sm sm:grid-cols-4">
              {po.createdBy && (
                <div>
                  <span className="text-muted-foreground">Raised by: </span>
                  {po.createdBy}
                </div>
              )}
              {po.sentAt && (
                <div>
                  <span className="text-muted-foreground">Sent: </span>
                  {fmtDate(po.sentAt)}
                </div>
              )}
              {po.receivedAt && (
                <div>
                  <span className="text-muted-foreground">Received: </span>
                  {fmtDate(po.receivedAt)}
                </div>
              )}
              {po.notes && (
                <div className="col-span-2 sm:col-span-4 text-muted-foreground">{po.notes}</div>
              )}
            </div>

            {/* Lines table */}
            <div className="overflow-hidden rounded-lg border border-border mb-3">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                      Item / SKU
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">
                      Unit
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">
                      Ordered
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">
                      Received
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                      Unit Cost
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                      Line Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {po.lines.map((l) => (
                    <tr key={l.inventoryItemId} className="border-t border-border">
                      <td className="px-3 py-2">
                        <div className="font-medium">{l.itemName}</div>
                        <div className="text-xs text-muted-foreground">{l.sku}</div>
                      </td>
                      <td className="px-3 py-2 text-center text-muted-foreground">{l.unit}</td>
                      <td className="px-3 py-2 text-center">{l.qtyOrdered}</td>
                      <td className="px-3 py-2 text-center">
                        <span
                          className={cn(
                            "font-medium",
                            l.qtyReceived >= l.qtyOrdered
                              ? "text-green-600"
                              : l.qtyReceived > 0
                                ? "text-amber-600"
                                : "text-muted-foreground",
                          )}
                        >
                          {l.qtyReceived}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground">
                        {fmtLKR(l.unitCost)}
                      </td>
                      <td className="px-3 py-2 text-right font-medium">
                        {fmtLKR(l.unitCost * l.qtyOrdered)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/30">
                    <td colSpan={5} className="px-3 py-2 text-right text-sm font-semibold">
                      Order Total
                    </td>
                    <td className="px-3 py-2 text-right text-sm font-bold">{fmtLKR(total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Receive panel */}
            {receiving && (
              <ReceivePanel
                po={po}
                onConfirm={(lines) => {
                  receivePO(po.id, lines);
                  setReceiving(false);
                }}
                onCancel={() => setReceiving(false)}
              />
            )}

            {/* Actions */}
            {!receiving && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => downloadPOPDF(po)}
                  className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
                >
                  <FileDown className="h-4 w-4" /> Download PDF
                </button>
                {canSend && (
                  <button
                    onClick={markSent}
                    className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    <Send className="h-4 w-4" /> Mark as Sent
                  </button>
                )}
                {canReceive && (
                  <button
                    onClick={() => setReceiving(true)}
                    className="flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
                  >
                    <PackageCheck className="h-4 w-4" /> Receive Stock
                  </button>
                )}
                {canCancel && (
                  <button
                    onClick={cancel}
                    className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10"
                  >
                    <X className="h-4 w-4" /> Cancel PO
                  </button>
                )}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function PurchaseOrdersPage() {
  const { purchaseOrdersList, addPurchaseOrder, lowStockItems } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState<"All" | POStatus>("All");

  // Auto PO: group low-stock items by supplier, one PO per supplier
  function createAutoPOs() {
    const items = lowStockItems.filter((i) => i.supplier);
    if (items.length === 0) {
      alert("No low-stock items with a supplier set.");
      return;
    }

    const grouped = items.reduce<Record<string, typeof items>>((acc, item) => {
      const key = item.supplier;
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});

    const supplierCount = Object.keys(grouped).length;
    if (
      !confirm(
        `Create ${supplierCount} PO${supplierCount > 1 ? "s" : ""} for ${items.length} low-stock item${items.length > 1 ? "s" : ""}?`,
      )
    )
      return;

    for (const [supplier, supplierItems] of Object.entries(grouped)) {
      const lines: POLine[] = supplierItems.map((item) => ({
        inventoryItemId: item.id,
        itemName: item.name,
        sku: item.sku,
        unit: item.unit,
        qtyOrdered: Math.max(1, item.reorder * 2 - item.stock),
        unitCost: item.cost,
        qtyReceived: 0,
      }));
      addPurchaseOrder({
        supplier,
        status: "Draft",
        lines,
        notes: "Auto-generated from low stock alert",
        createdBy: "System",
        sentAt: null,
        receivedAt: null,
      });
    }
  }

  const filtered = purchaseOrdersList.filter(
    (po) => filterStatus === "All" || po.status === filterStatus,
  );

  const draft = purchaseOrdersList.filter((p) => p.status === "Draft").length;
  const sent = purchaseOrdersList.filter(
    (p) => p.status === "Sent" || p.status === "Partially Received",
  ).length;
  const received = purchaseOrdersList.filter((p) => p.status === "Received").length;
  const totalCommitted = purchaseOrdersList
    .filter((p) => p.status !== "Cancelled" && p.status !== "Received")
    .reduce((s, p) => s + poTotal(p), 0);

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <ShoppingCart className="h-6 w-6 text-primary" /> Purchase Orders
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Manage supplier purchase orders and receive stock directly to inventory
          </p>
        </div>
        <div className="flex gap-2">
          {lowStockItems.length > 0 && (
            <button
              onClick={createAutoPOs}
              className="flex items-center gap-2 rounded-lg border border-amber-500 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-400"
            >
              <Zap className="h-4 w-4" /> Auto PO ({lowStockItems.length} low stock)
            </button>
          )}
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> Create PO
          </button>
        </div>
      </div>

      {/* Create form */}
      {showForm && (
        <CreatePOForm
          onSave={(data) => {
            addPurchaseOrder(data);
            setShowForm(false);
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total POs", value: purchaseOrdersList.length, icon: ShoppingCart, cls: "" },
          { label: "Draft / Pending", value: draft, icon: Clock3, cls: "text-muted-foreground" },
          {
            label: "Sent / In Transit",
            value: sent,
            icon: AlertTriangle,
            cls: sent > 0 ? "text-amber-500" : "",
          },
          { label: "Received", value: received, icon: CheckCircle2, cls: "text-green-600" },
        ].map(({ label, value, icon: Icon, cls }) => (
          <div key={label} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <Icon className={cn("h-4 w-4 text-muted-foreground", cls)} />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
            <p className={cn("mt-1 text-2xl font-bold", cls)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Committed spend */}
      {totalCommitted > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800/40 dark:bg-blue-900/20">
          <ShoppingCart className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <p className="text-sm text-blue-700 dark:text-blue-300">
            <span className="font-semibold">{fmtLKR(totalCommitted)}</span> committed on open
            purchase orders
          </p>
        </div>
      )}

      {/* Filter */}
      <div className="flex flex-wrap gap-2">
        {(["All", "Draft", "Sent", "Partially Received", "Received", "Cancelled"] as const).map(
          (s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                filterStatus === s
                  ? "bg-primary text-primary-foreground"
                  : "border border-border hover:bg-muted",
              )}
            >
              {s}
            </button>
          ),
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                PO #
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Supplier
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Created
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Items
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Total
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Status
              </th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-16 text-center text-muted-foreground">
                  <ShoppingCart className="mx-auto mb-2 h-8 w-8 opacity-30" />
                  <p className="text-sm">No purchase orders</p>
                  {lowStockItems.length > 0 && (
                    <p className="mt-1 text-xs">
                      Use <strong>Auto PO</strong> to generate orders from low-stock items
                    </p>
                  )}
                </td>
              </tr>
            ) : (
              filtered
                .slice()
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .map((po) => <PORow key={po.id} po={po} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
