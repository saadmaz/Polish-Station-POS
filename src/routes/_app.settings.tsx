import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import { AccessPanel } from "@/components/access-panel";
import { useStore } from "@/lib/store";
import * as db from "@/lib/db";
import type { BusinessInfo, Service, ServiceCategory } from "@/lib/db";
import { formatCurrency } from "@/lib/currency";
import { formatDateTime } from "@/lib/date-format";
import { useConfirm } from "@/hooks/use-confirm";
import {
  Building2,
  Tag,
  ParkingMeter,
  Calendar,
  ShieldCheck,
  Bell,
  Link2,
  ScrollText,
  Check,
  X,
  Download,
  Plus,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Settings · Polish Station OS" }] }),
  // Lets a link from elsewhere (e.g. /staff's "Manage" link) open straight
  // on a given section instead of always landing on Business.
  validateSearch: (search: Record<string, unknown>): { tab?: SectionId } => ({
    tab: SECTIONS.some((s) => s.id === search.tab) ? (search.tab as SectionId) : undefined,
  }),
  component: Settings,
});

const SECTIONS = [
  {
    id: "business",
    icon: Building2,
    name: "Business",
    desc: "Name, logo, hours, receipt header",
  },
  {
    id: "catalog",
    icon: Tag,
    name: "Services Catalog",
    desc: "Services, add-ons, bundles, pricing tiers",
  },
  {
    id: "bays",
    icon: ParkingMeter,
    name: "Bays & Capacity",
    desc: "Add, rename, or remove service bays",
  },
  {
    id: "booking",
    icon: Calendar,
    name: "Booking Rules",
    desc: "Lead time, deposits, cancellation policy",
  },
  {
    id: "access",
    icon: ShieldCheck,
    name: "Staff & Access",
    desc: "Roles, PIN length, timeout, lockout",
  },
  { id: "notify", icon: Bell, name: "Notifications", desc: "SMS, Email, WhatsApp templates" },
  {
    id: "integrations",
    icon: Link2,
    name: "Integrations",
    desc: "Payment terminal, QuickBooks, Google Calendar",
  },
  {
    id: "audit",
    icon: ScrollText,
    name: "Audit Log",
    desc: "All admin/manager actions, exportable",
  },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

function Settings() {
  const { tab } = Route.useSearch();
  const [active, setActive] = useState<SectionId>(tab ?? "business");
  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="Settings" subtitle="Admin-only · sales and records audited" />
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-5">
        <nav className="rounded-xl border border-border bg-card shadow-card p-2 h-fit">
          {SECTIONS.map(({ id, icon: Icon, name }) => (
            <button
              key={id}
              onClick={() => setActive(id)}
              className={cn(
                "w-full flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-left transition-colors",
                active === id
                  ? "bg-primary/10 text-primary font-semibold"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {name}
            </button>
          ))}
        </nav>

        <div className="rounded-xl border border-border bg-card shadow-card p-4 sm:p-6 min-h-105">
          {active === "business" && <BusinessPanel />}
          {active === "catalog" && <CatalogPanel />}
          {active === "bays" && <BaysPanel />}
          {active === "booking" && <BookingRulesPanel />}
          {active === "access" && <AccessPanel />}
          {active === "notify" && <NotifyPanel />}
          {active === "integrations" && <IntegrationsPanel />}
          {active === "audit" && <AuditPanel />}
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="mb-5 border-b border-border pb-4">
      <h2 className="font-display text-lg font-bold">{title}</h2>
      <p className="text-sm text-muted-foreground mt-0.5">{desc}</p>
    </div>
  );
}

// Stored in the settings/business Firestore doc (shared by every till and
// consumed by the PDF letterheads), not per-device localStorage.
function BusinessPanel() {
  const { businessInfo, saveBusinessInfo } = useStore();
  const [form, setForm] = useState<BusinessInfo>(businessInfo);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  // Follow remote updates (another till saving) until this form is touched.
  useEffect(() => {
    if (!dirty) setForm(businessInfo);
  }, [businessInfo, dirty]);

  function set(k: keyof BusinessInfo, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
    setSaved(false);
  }
  function save() {
    saveBusinessInfo(form);
    setDirty(false);
    setSaved(true);
  }
  function reset() {
    setForm(businessInfo);
    setDirty(false);
    setSaved(false);
  }

  return (
    <>
      <SectionTitle title="Business" desc="Shared across all devices, used on invoices and PDFs." />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(
          [
            ["Business Name", "name"],
            ["Trading Name", "trading"],
            ["Phone", "phone"],
            ["Email", "email"],
            ["Address", "address"],
            ["Opening Hours", "hours"],
          ] as [string, keyof BusinessInfo][]
        ).map(([label, key]) => (
          <label key={key} className={cn("block", key === "address" && "md:col-span-2")}>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {label}
            </span>
            {/* This prints on every invoice/PO -- a single-column-width input
                truncated it with no way to read the full value (audit ST5). */}
            <input
              value={form[key]}
              onChange={(e) => set(key, e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
        ))}
      </div>
      <div className="mt-6 flex items-center gap-2 justify-end">
        {saved && <span className="text-xs text-success font-medium">Saved ✓</span>}
        {dirty && <span className="text-xs text-warning font-medium">Unsaved changes</span>}
        <button onClick={reset} className="rounded-md border border-input px-4 py-2 text-sm">
          Reset
        </button>
        <button
          onClick={save}
          disabled={!dirty}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-red disabled:opacity-50"
        >
          Save Changes
        </button>
      </div>
    </>
  );
}

const BLANK_SERVICE: Omit<Service, "id"> = {
  name: "",
  category: "Exterior",
  durationMin: 60,
  price: 0,
};
const CATEGORIES: ServiceCategory[] = [
  "Exterior",
  "Interior",
  "Full Detail",
  "Paint Protection",
  "Coating",
];

function CatalogPanel() {
  const { services, upsertService, deleteService } = useStore();
  const [editing, setEditing] = useState<Service | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<Omit<Service, "id">>(BLANK_SERVICE);
  const { confirm, ConfirmDialog } = useConfirm();

  function openAdd() {
    setForm(BLANK_SERVICE);
    setAdding(true);
    setEditing(null);
  }
  function openEdit(s: Service) {
    setForm({ name: s.name, category: s.category, durationMin: s.durationMin, price: s.price });
    setEditing(s);
    setAdding(false);
  }
  function closeForm() {
    setAdding(false);
    setEditing(null);
  }

  function saveForm() {
    if (!form.name.trim()) return;
    if (editing) {
      upsertService({ ...editing, ...form });
    } else {
      upsertService({ id: db.newId("svc"), ...form });
    }
    closeForm();
  }

  return (
    <>
      {ConfirmDialog}
      <SectionTitle title="Services Catalog" desc="Add, edit and price the services on offer." />

      {(adding || editing) && (
        <div className="mb-5 rounded-lg border border-border bg-muted/30 p-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Service Name
            </span>
            <input
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Category
            </span>
            <select
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.category}
              onChange={(e) =>
                setForm((f) => ({ ...f, category: e.target.value as ServiceCategory }))
              }
            >
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Duration (min)
            </span>
            <input
              type="number"
              min={5}
              step={5}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.durationMin}
              onChange={(e) => setForm((f) => ({ ...f, durationMin: Number(e.target.value) }))}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Price (LKR)
            </span>
            <input
              type="number"
              min={0}
              step={100}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) }))}
            />
          </label>
          <div className="sm:col-span-2 flex gap-2 justify-end">
            <button
              onClick={closeForm}
              className="rounded-md border border-input px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              onClick={saveForm}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-red"
            >
              {editing ? "Save Changes" : "Add Service"}
            </button>
          </div>
        </div>
      )}

      {/* Mobile: stacked cards */}
      <div className="divide-y divide-border md:hidden">
        {services.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <div className="font-medium truncate">{s.name}</div>
              <div className="text-xs text-muted-foreground">
                {s.category} · {s.durationMin}m
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="font-mono font-semibold">{formatCurrency(s.price)}</span>
              <button
                onClick={() => openEdit(s)}
                className="rounded-md p-2 text-xs text-primary hover:bg-accent"
                aria-label={`Edit ${s.name}`}
              >
                Edit
              </button>
              <button
                onClick={async () => {
                  if (await confirm({ title: `Delete "${s.name}"?` })) deleteService(s.id);
                }}
                className="rounded-md p-2 text-xs text-destructive hover:bg-accent"
                aria-label={`Delete ${s.name}`}
              >
                Del
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Tablet/desktop: table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
            <tr>
              <th className="text-left py-2">Service</th>
              <th className="text-left py-2">Category</th>
              <th className="text-right py-2">Duration</th>
              <th className="text-right py-2">Price</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {services.map((s) => (
              <tr key={s.id}>
                <td className="py-3 font-medium">{s.name}</td>
                <td className="py-3 text-muted-foreground">{s.category}</td>
                <td className="py-3 text-right font-mono">{s.durationMin}m</td>
                <td className="py-3 text-right font-mono font-semibold">
                  {formatCurrency(s.price)}
                </td>
                <td className="py-3 text-right flex gap-2 justify-end">
                  <button
                    onClick={() => openEdit(s)}
                    className="text-xs text-primary hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    onClick={async () => {
                      if (await confirm({ title: `Delete "${s.name}"?` })) deleteService(s.id);
                    }}
                    className="text-xs text-destructive hover:underline"
                  >
                    Del
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex justify-end">
        <button
          onClick={openAdd}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-red"
        >
          + Add Service
        </button>
      </div>
    </>
  );
}

function BaysPanel() {
  const { bays, saveBays } = useStore();
  const [form, setForm] = useState<string[]>(bays);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  // Follow remote updates (another till saving) until this form is touched.
  useEffect(() => {
    if (!dirty) setForm(bays);
  }, [bays, dirty]);

  function rename(i: number, value: string) {
    setForm((f) => f.map((b, idx) => (idx === i ? value : b)));
    setDirty(true);
    setSaved(false);
  }
  function addBay() {
    setForm((f) => [...f, `Bay ${f.length + 1}`]);
    setDirty(true);
    setSaved(false);
  }
  function removeBay(i: number) {
    setForm((f) => f.filter((_, idx) => idx !== i));
    setDirty(true);
    setSaved(false);
  }
  function save() {
    const cleaned = form.map((b) => b.trim()).filter(Boolean);
    if (cleaned.length === 0) {
      toast.error("Keep at least one bay");
      return;
    }
    saveBays(cleaned);
    setDirty(false);
    setSaved(true);
  }
  function reset() {
    setForm(bays);
    setDirty(false);
    setSaved(false);
  }

  return (
    <>
      <SectionTitle
        title="Bays & Capacity"
        desc="The physical service bays bookings get assigned to. Currently just the one. Add a row here the day a second bay opens, and it shows up everywhere (Bookings, Settings) immediately."
      />
      <div className="space-y-2">
        {form.map((b, i) => (
          <div key={i} className="flex items-center gap-2 rounded-lg border border-border p-3">
            <div className="font-display font-bold text-muted-foreground text-sm w-6">{i + 1}</div>
            <input
              value={b}
              onChange={(e) => rename(i, e.target.value)}
              className="flex-1 min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <button
              onClick={() => removeBay(i)}
              disabled={form.length <= 1}
              aria-label={`Remove ${b || "bay"}`}
              title={form.length <= 1 ? "At least one bay is required" : "Remove bay"}
              className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30 disabled:pointer-events-none"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={addBay}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-dashed border-input px-3 py-2 text-sm text-muted-foreground hover:border-primary hover:text-primary"
      >
        <Plus className="h-4 w-4" /> Add Bay
      </button>
      <div className="mt-6 flex items-center gap-2 justify-end">
        {saved && <span className="text-xs text-success font-medium">Saved ✓</span>}
        {dirty && <span className="text-xs text-warning font-medium">Unsaved changes</span>}
        <button onClick={reset} className="rounded-md border border-input px-4 py-2 text-sm">
          Reset
        </button>
        <button
          onClick={save}
          disabled={!dirty}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-red disabled:opacity-50"
        >
          Save Changes
        </button>
      </div>
    </>
  );
}

const BR_KEY = "ps_booking_rules";
const BR_DEFAULTS = {
  leadTime: "30 minutes",
  maxAdvance: "60 days",
  depositThreshold: "LKR 25,000",
  depositPct: "20%",
  cancelWindow: "24 hours",
  noShowPenalty: "LKR 1,500",
  autoConfirm: "Yes",
};
type BookingRules = typeof BR_DEFAULTS;

function loadBR(): BookingRules {
  try {
    return { ...BR_DEFAULTS, ...JSON.parse(localStorage.getItem(BR_KEY) ?? "{}") };
  } catch {
    return BR_DEFAULTS;
  }
}

const BR_LABELS: [keyof BookingRules, string][] = [
  ["leadTime", "Minimum lead time"],
  ["maxAdvance", "Maximum advance booking"],
  ["depositThreshold", "Deposit required above"],
  ["depositPct", "Deposit percentage"],
  ["cancelWindow", "Cancellation window"],
  ["noShowPenalty", "No-show penalty"],
  ["autoConfirm", "Auto-confirm walk-ins"],
];

function BookingRulesPanel() {
  const [rules, setRules] = useState<BookingRules>(loadBR);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  function set(k: keyof BookingRules, v: string) {
    setRules((r) => ({ ...r, [k]: v }));
    setSaved(false);
    setDirty(true);
  }
  function save() {
    localStorage.setItem(BR_KEY, JSON.stringify(rules));
    setSaved(true);
    setDirty(false);
  }

  return (
    <>
      <SectionTitle
        title="Booking Rules"
        desc="Policies enforced at the point of booking and cancellation."
      />
      <div className="divide-y divide-border">
        {BR_LABELS.map(([key, label]) => (
          <div key={key} className="flex items-center justify-between py-3 gap-4">
            <span className="text-sm flex-1">{label}</span>
            <input
              value={rules[key]}
              onChange={(e) => set(key, e.target.value)}
              className="w-36 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm font-mono text-right focus:outline-none focus:border-primary"
            />
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2 justify-end">
        {saved && <span className="text-xs text-success font-medium">Saved ✓</span>}
        {dirty && <span className="text-xs text-warning font-medium">Unsaved changes</span>}
        <button
          onClick={save}
          disabled={!dirty}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-red disabled:opacity-50"
        >
          Save Rules
        </button>
      </div>
    </>
  );
}

const NOTIFY_KEY = "ps_notify_settings";
const NOTIFY_DEFAULTS: Record<string, boolean> = {
  "SMS: Booking Confirmation": true,
  "SMS: Ready for Pickup": true,
  "Email: Receipt": true,
  "WhatsApp: Before/After Photos": true,
  "Email: Marketing Campaigns": false,
};

function loadNotify(): Record<string, boolean> {
  try {
    return { ...NOTIFY_DEFAULTS, ...JSON.parse(localStorage.getItem(NOTIFY_KEY) ?? "{}") };
  } catch {
    return { ...NOTIFY_DEFAULTS };
  }
}

function NotifyPanel() {
  const [channels, setChannels] = useState<Record<string, boolean>>(loadNotify);

  function toggle(name: string) {
    setChannels((prev) => {
      const next = { ...prev, [name]: !prev[name] };
      localStorage.setItem(NOTIFY_KEY, JSON.stringify(next));
      return next;
    });
  }

  return (
    <>
      <SectionTitle title="Notifications" desc="Toggle outbound channels and message templates." />
      <div className="divide-y divide-border">
        {Object.keys(NOTIFY_DEFAULTS).map((name) => {
          const on = channels[name] ?? NOTIFY_DEFAULTS[name];
          return (
            <div key={name} className="flex items-center justify-between py-3">
              <span className="text-sm">{name}</span>
              <button
                role="switch"
                aria-checked={on}
                onClick={() => toggle(name)}
                className={cn(
                  "inline-flex h-6 w-11 items-center rounded-full p-0.5 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40",
                  on ? "bg-primary" : "bg-muted",
                )}
              >
                <span
                  className={cn(
                    "h-5 w-5 rounded-full bg-white shadow transition-transform",
                    on ? "translate-x-5" : "translate-x-0",
                  )}
                />
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}

function IntegrationsPanel() {
  const apps = [
    { name: "Stripe Terminal", connected: true, desc: "Card-present payments" },
    { name: "QuickBooks Online", connected: true, desc: "Daily revenue sync" },
    { name: "Google Calendar", connected: false, desc: "Two-way booking sync" },
    { name: "WhatsApp Business API", connected: true, desc: "Customer messaging" },
    { name: "Mailchimp", connected: false, desc: "Email marketing" },
  ];
  return (
    <>
      <SectionTitle title="Integrations" desc="Connect Polish Station OS to external services." />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {apps.map((a) => (
          <div
            key={a.name}
            className="flex items-center justify-between rounded-lg border border-border p-4"
          >
            <div>
              <div className="font-display font-bold">{a.name}</div>
              <div className="text-xs text-muted-foreground">{a.desc}</div>
            </div>
            {a.connected ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/15 text-success border border-success/30 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider">
                <Check className="h-3 w-3" /> Connected
              </span>
            ) : (
              <button
                onClick={() => toast.info(`${a.name} integration isn't available yet.`)}
                className="inline-flex items-center gap-1 rounded-md border border-input px-3 py-1.5 text-xs hover:bg-accent"
              >
                <X className="h-3 w-3" /> Connect
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function AuditPanel() {
  const { auditList } = useStore();
  const events = [...auditList].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  function exportCSV() {
    const rows = events.map((e) => [
      new Date(e.createdAt).toISOString(),
      e.staffName || e.staffId || "",
      e.entity,
      e.action,
      e.entityId,
    ]);
    const csv = [["Timestamp", "User", "Entity", "Action", "Entity ID"], ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  return (
    <>
      <div className="mb-5 border-b border-border pb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold">Audit Log</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Sales, bookings, customers, coupons, services, inventory, equipment, purchase orders,
            expenses, and business/bay settings are all recorded immutably below. Notification
            settings and staff accounts aren't logged yet.
          </p>
        </div>
        {events.length > 0 && (
          <button
            onClick={exportCSV}
            className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs hover:bg-accent shrink-0"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
        )}
      </div>
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          No audit events recorded yet.
        </p>
      ) : (
        <>
          {/* Mobile: stacked cards */}
          <div className="divide-y divide-border md:hidden">
            {events.slice(0, 50).map((e) => (
              <div key={e.id} className="py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{e.staffName || e.staffId || "—"}</span>
                  <StatusChip variant="neutral">{e.entity}</StatusChip>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {e.action.replace(/_/g, " ")}
                  {e.entityId ? ` · ${e.entityId}` : ""}
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                  {formatDateTime(e.createdAt)}
                </div>
              </div>
            ))}
          </div>

          {/* Tablet/desktop: table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                <tr>
                  <th className="text-left py-2">Time</th>
                  <th className="text-left py-2">User</th>
                  <th className="text-left py-2">Entity</th>
                  <th className="text-left py-2">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {events.slice(0, 50).map((e) => (
                  <tr key={e.id}>
                    <td className="py-2.5 font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTime(e.createdAt)}
                    </td>
                    <td className="py-2.5 font-medium">{e.staffName || e.staffId || "—"}</td>
                    <td className="py-2.5">
                      <StatusChip variant="neutral">{e.entity}</StatusChip>
                    </td>
                    <td className="py-2.5 text-muted-foreground">
                      {e.action.replace(/_/g, " ")}
                      {e.entityId ? ` · ${e.entityId}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
