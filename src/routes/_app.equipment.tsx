import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Hammer,
  Plus,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Pencil,
  Trash2,
  X,
  Wrench,
  ClipboardList,
  HelpCircle,
} from "lucide-react";
import { useStore } from "@/lib/store";
import type { Equipment, MaintenanceLog, MaintenanceType, EquipmentStatus } from "@/lib/db";
import * as db from "@/lib/db";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/equipment")({
  component: EquipmentPage,
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function daysUntilService(eq: Equipment): number | null {
  if (!eq.lastServiceDate) return null;
  const next = new Date(eq.lastServiceDate).getTime() + eq.serviceIntervalDays * 86400000;
  return Math.floor((next - Date.now()) / 86400000);
}

function serviceStatus(days: number | null) {
  if (days === null) return { label: "No service record", icon: HelpCircle, cls: "text-muted-foreground" };
  if (days < 0) return { label: `Overdue by ${Math.abs(days)}d`, icon: AlertTriangle, cls: "text-destructive" };
  if (days <= 14) return { label: `Due in ${days}d`, icon: Clock3, cls: "text-amber-500" };
  return { label: `${days}d remaining`, icon: CheckCircle2, cls: "text-green-600" };
}

const EQ_TYPES = ["Polishing Machine", "Steam Cleaner", "Pressure Washer", "Air Compressor", "Extractor Vacuum", "Detail Light", "Water Fed Pole", "Other"];
const MAINT_TYPES: MaintenanceType[] = ["Service", "Repair", "Inspection", "Replacement"];
const STATUS_OPTIONS: EquipmentStatus[] = ["Active", "In Maintenance", "Retired"];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtCost(n: number) {
  return `LKR ${n.toLocaleString()}`;
}

// ─── Equipment Form ──────────────────────────────────────────────────────────

const BLANK_EQ: Omit<Equipment, "id" | "createdAt"> = {
  name: "", type: "Polishing Machine", make: "", model: "", serial: "",
  purchasedAt: null, status: "Active", serviceIntervalDays: 90, lastServiceDate: null, notes: "",
};

function EquipmentForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Equipment;
  onSave: (eq: Equipment) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<Omit<Equipment, "id" | "createdAt">>(
    initial ? { name: initial.name, type: initial.type, make: initial.make, model: initial.model, serial: initial.serial, purchasedAt: initial.purchasedAt, status: initial.status, serviceIntervalDays: initial.serviceIntervalDays, lastServiceDate: initial.lastServiceDate, notes: initial.notes } : BLANK_EQ,
  );
  const set = (k: keyof typeof form, v: string | number | null) => setForm((f) => ({ ...f, [k]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const eq: Equipment = {
      ...form,
      id: initial?.id ?? db.equipment.nextId(),
      createdAt: initial?.createdAt ?? new Date().toISOString(),
    };
    onSave(eq);
  }

  const inp = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
  const lbl = "block text-xs font-medium text-muted-foreground mb-1";

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-border bg-muted/30 p-5">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="col-span-2 sm:col-span-3">
          <label className={lbl}>Equipment Name *</label>
          <input className={inp} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. RUPES LHR21 Mark III" required />
        </div>
        <div>
          <label className={lbl}>Type</label>
          <select className={inp} value={form.type} onChange={(e) => set("type", e.target.value)}>
            {EQ_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Make</label>
          <input className={inp} value={form.make} onChange={(e) => set("make", e.target.value)} placeholder="Brand" />
        </div>
        <div>
          <label className={lbl}>Model</label>
          <input className={inp} value={form.model} onChange={(e) => set("model", e.target.value)} placeholder="Model number" />
        </div>
        <div>
          <label className={lbl}>Serial Number</label>
          <input className={inp} value={form.serial} onChange={(e) => set("serial", e.target.value)} placeholder="S/N" />
        </div>
        <div>
          <label className={lbl}>Purchase Date</label>
          <input type="date" className={inp} value={form.purchasedAt ?? ""} onChange={(e) => set("purchasedAt", e.target.value || null)} />
        </div>
        <div>
          <label className={lbl}>Status</label>
          <select className={inp} value={form.status} onChange={(e) => set("status", e.target.value as EquipmentStatus)}>
            {STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Service Interval (days)</label>
          <input type="number" min={1} className={inp} value={form.serviceIntervalDays} onChange={(e) => set("serviceIntervalDays", parseInt(e.target.value) || 90)} />
        </div>
        <div>
          <label className={lbl}>Last Service Date</label>
          <input type="date" className={inp} value={form.lastServiceDate ?? ""} onChange={(e) => set("lastServiceDate", e.target.value || null)} />
        </div>
        <div className="col-span-2 sm:col-span-3">
          <label className={lbl}>Notes</label>
          <textarea rows={2} className={inp} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Optional notes" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted">Cancel</button>
        <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          {initial ? "Save Changes" : "Add Equipment"}
        </button>
      </div>
    </form>
  );
}

// ─── Maintenance Log Form ─────────────────────────────────────────────────────

function MaintenanceLogForm({
  equipmentId,
  onSave,
  onCancel,
}: {
  equipmentId: string;
  onSave: (log: Omit<MaintenanceLog, "id" | "createdAt">) => void;
  onCancel: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    type: "Service" as MaintenanceType,
    description: "",
    performedBy: "",
    cost: 0,
    date: today,
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.description.trim()) return;
    onSave({ equipmentId, ...form });
  }

  const inp = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
  const lbl = "block text-xs font-medium text-muted-foreground mb-1";

  return (
    <form onSubmit={submit} className="mt-3 space-y-3 rounded-lg border border-border bg-background p-4">
      <p className="text-sm font-semibold">Log Maintenance Entry</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className={lbl}>Type</label>
          <select className={inp} value={form.type} onChange={(e) => set("type", e.target.value as MaintenanceType)}>
            {MAINT_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Date</label>
          <input type="date" className={inp} value={form.date} max={today} onChange={(e) => set("date", e.target.value)} required />
        </div>
        <div>
          <label className={lbl}>Performed By</label>
          <input className={inp} value={form.performedBy} onChange={(e) => set("performedBy", e.target.value)} placeholder="Technician / vendor" />
        </div>
        <div>
          <label className={lbl}>Cost (LKR)</label>
          <input type="number" min={0} className={inp} value={form.cost} onChange={(e) => set("cost", parseFloat(e.target.value) || 0)} />
        </div>
        <div className="col-span-2 sm:col-span-4">
          <label className={lbl}>Description *</label>
          <textarea rows={2} className={inp} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="What was done?" required />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">Cancel</button>
        <button type="submit" className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">Log Entry</button>
      </div>
    </form>
  );
}

// ─── Equipment Row ────────────────────────────────────────────────────────────

function EquipmentRow({ eq }: { eq: Equipment }) {
  const { maintenanceLogsList, upsertEquipment, deleteEquipment, addMaintenanceLog, deleteMaintenanceLog } = useStore();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [logging, setLogging] = useState(false);

  const logs = maintenanceLogsList.filter((m) => m.equipmentId === eq.id).sort((a, b) => b.date.localeCompare(a.date));
  const days = daysUntilService(eq);
  const svc = serviceStatus(days);
  const SvcIcon = svc.icon;

  const statusBadge = {
    Active: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
    "In Maintenance": "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
    Retired: "bg-muted text-muted-foreground",
  }[eq.status];

  if (editing) {
    return (
      <tr>
        <td colSpan={6} className="px-4 py-3">
          <EquipmentForm initial={eq} onSave={(updated) => { upsertEquipment(updated); setEditing(false); }} onCancel={() => setEditing(false)} />
        </td>
      </tr>
    );
  }

  return (
    <>
      <tr
        className={cn("border-t border-border transition-colors hover:bg-muted/30 cursor-pointer", open && "bg-muted/20")}
        onClick={() => setOpen((o) => !o)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold", open ? "bg-primary text-primary-foreground" : "bg-muted")}>
              {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </span>
            <div>
              <div className="text-sm font-medium">{eq.name}</div>
              <div className="text-xs text-muted-foreground">{eq.type}</div>
            </div>
          </div>
        </td>
        <td className="px-4 py-3">
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", statusBadge)}>{eq.status}</span>
        </td>
        <td className="px-4 py-3 text-sm text-muted-foreground">
          {eq.lastServiceDate ? fmtDate(eq.lastServiceDate) : <span className="italic">None</span>}
        </td>
        <td className="px-4 py-3">
          <div className={cn("flex items-center gap-1.5 text-sm font-medium", svc.cls)}>
            <SvcIcon className="h-4 w-4 shrink-0" />
            {svc.label}
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-muted-foreground">Every {eq.serviceIntervalDays}d</td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setEditing(true)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Edit">
              <Pencil className="h-4 w-4" />
            </button>
            <button onClick={() => { if (confirm("Delete this equipment record?")) deleteEquipment(eq.id); }} className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Delete">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </td>
      </tr>

      {open && (
        <tr className="border-t border-border">
          <td colSpan={6} className="bg-muted/10 px-6 py-4">
            {/* Equipment details */}
            <div className="mb-4 grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:grid-cols-4">
              {eq.make && <div><span className="text-muted-foreground">Make: </span>{eq.make}</div>}
              {eq.model && <div><span className="text-muted-foreground">Model: </span>{eq.model}</div>}
              {eq.serial && <div><span className="text-muted-foreground">Serial: </span>{eq.serial}</div>}
              {eq.purchasedAt && <div><span className="text-muted-foreground">Purchased: </span>{fmtDate(eq.purchasedAt)}</div>}
              {eq.notes && <div className="col-span-2 sm:col-span-4 text-muted-foreground">{eq.notes}</div>}
            </div>

            {/* Maintenance history */}
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold flex items-center gap-1.5"><ClipboardList className="h-4 w-4" /> Maintenance History ({logs.length})</p>
              {!logging && (
                <button onClick={() => setLogging(true)} className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                  <Plus className="h-3.5 w-3.5" /> Log Maintenance
                </button>
              )}
            </div>

            {logging && (
              <MaintenanceLogForm
                equipmentId={eq.id}
                onSave={(log) => { addMaintenanceLog(log); setLogging(false); }}
                onCancel={() => setLogging(false)}
              />
            )}

            {logs.length === 0 && !logging ? (
              <p className="py-4 text-center text-sm text-muted-foreground italic">No maintenance records yet.</p>
            ) : (
              <div className="mt-2 overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Date</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Type</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Description</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Performed By</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Cost</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => {
                      const typeBadge = {
                        Service: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
                        Repair: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
                        Inspection: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400",
                        Replacement: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400",
                      }[log.type];
                      return (
                        <tr key={log.id} className="border-t border-border">
                          <td className="px-3 py-2 text-sm whitespace-nowrap">{fmtDate(log.date)}</td>
                          <td className="px-3 py-2">
                            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", typeBadge)}>{log.type}</span>
                          </td>
                          <td className="px-3 py-2 text-sm">{log.description}</td>
                          <td className="px-3 py-2 text-sm text-muted-foreground">{log.performedBy || "—"}</td>
                          <td className="px-3 py-2 text-right text-sm font-medium">{log.cost > 0 ? fmtCost(log.cost) : "—"}</td>
                          <td className="px-3 py-2">
                            <button onClick={() => { if (confirm("Delete this log entry?")) deleteMaintenanceLog(log.id); }} className="rounded p-1 text-muted-foreground hover:text-destructive" title="Delete">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function EquipmentPage() {
  const { equipmentList, overdueEquipment, upsertEquipment } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"All" | EquipmentStatus>("All");

  const active = equipmentList.filter((e) => e.status === "Active").length;
  const inMaint = equipmentList.filter((e) => e.status === "In Maintenance").length;

  const filtered = equipmentList.filter((e) => {
    if (filterStatus !== "All" && e.status !== filterStatus) return false;
    if (search && !e.name.toLowerCase().includes(search.toLowerCase()) && !e.type.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Hammer className="h-6 w-6 text-primary" /> Equipment Maintenance Log
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Track service intervals and maintenance history for all detailing equipment</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Add Equipment
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <EquipmentForm
          onSave={(eq) => { upsertEquipment(eq); setShowForm(false); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total Equipment", value: equipmentList.length, icon: Wrench, cls: "" },
          { label: "Active", value: active, icon: CheckCircle2, cls: "text-green-600" },
          { label: "In Maintenance", value: inMaint, icon: Clock3, cls: "text-amber-500" },
          { label: "Overdue Service", value: overdueEquipment.length, icon: AlertTriangle, cls: overdueEquipment.length > 0 ? "text-destructive" : "" },
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

      {/* Overdue banner */}
      {overdueEquipment.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p className="text-sm font-semibold text-destructive">Service overdue</p>
            <p className="mt-0.5 text-sm text-destructive/80">
              {overdueEquipment.map((e) => e.name).join(", ")} — schedule maintenance immediately.
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="Search equipment..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex gap-2">
          {(["All", "Active", "In Maintenance", "Retired"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={cn("rounded-md px-3 py-2 text-sm font-medium transition-colors", filterStatus === s ? "bg-primary text-primary-foreground" : "border border-border hover:bg-muted")}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Equipment</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Last Service</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Next Service</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Interval</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-16 text-center text-muted-foreground">
                  <Hammer className="mx-auto mb-2 h-8 w-8 opacity-30" />
                  <p className="text-sm">No equipment found</p>
                </td>
              </tr>
            ) : (
              filtered.map((eq) => <EquipmentRow key={eq.id} eq={eq} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
