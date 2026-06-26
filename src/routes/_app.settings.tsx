import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import { useStore } from "@/lib/store";
import * as db from "@/lib/db";
import type { Service, ServiceCategory } from "@/lib/db";
import { STAFF, DEMO_PIN } from "@/lib/auth";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Settings — Polish Station OS" }] }),
  component: Settings,
});

const SECTIONS = [
  {
    id: "business",
    icon: Building2,
    name: "Business",
    desc: "Name, logo, hours, tax rate, receipt header",
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
    desc: "Bay types, capacity rules, maintenance",
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
  const [active, setActive] = useState<SectionId>("business");
  return (
    <div className="p-6">
      <PageHeader title="Settings" subtitle="Admin-only · all changes audited" />
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

        <div className="rounded-xl border border-border bg-card shadow-card p-6 min-h-[420px]">
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

function Field({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <input
        defaultValue={value}
        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

function BusinessPanel() {
  return (
    <>
      <SectionTitle
        title="Business"
        desc="Information used on invoices and customer-facing communications."
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Business Name" value="Polish Station (Pvt) Ltd" />
        <Field label="Trading Name" value="Polish Station" />
        <Field label="VAT / Tax No." value="VAT-184220985-7000" />
        <Field label="Phone" value="+94 11 250 8821" />
        <Field label="Email" value="hello@polishstation.lk" />
        <Field label="Address" value="No. 142, Havelock Rd, Colombo 05" />
        <Field label="Opening Hours" value="Mon–Sat · 08:00–18:00" />
        <Field label="VAT Rate" value="18%" hint="Applied to all taxable line items at checkout." />
      </div>
      <div className="mt-6 flex gap-2 justify-end">
        <button className="rounded-md border border-input px-4 py-2 text-sm">Cancel</button>
        <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-red">
          Save Changes
        </button>
      </div>
    </>
  );
}

const BLANK_SERVICE: Omit<Service, "id"> = { name: "", category: "Exterior", durationMin: 60, price: 0 };
const CATEGORIES: ServiceCategory[] = ["Exterior", "Interior", "Full Detail", "Paint Protection", "Coating"];

function CatalogPanel() {
  const { services, upsertService, deleteService } = useStore();
  const [editing, setEditing] = useState<Service | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<Omit<Service, "id">>(BLANK_SERVICE);

  function openAdd() { setForm(BLANK_SERVICE); setAdding(true); setEditing(null); }
  function openEdit(s: Service) { setForm({ name: s.name, category: s.category, durationMin: s.durationMin, price: s.price }); setEditing(s); setAdding(false); }
  function closeForm() { setAdding(false); setEditing(null); }

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
      <SectionTitle title="Services Catalog" desc="Add, edit and price the services on offer." />

      {(adding || editing) && (
        <div className="mb-5 rounded-lg border border-border bg-muted/30 p-4 grid grid-cols-2 gap-3">
          <label className="block col-span-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Service Name</span>
            <input className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Category</span>
            <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as ServiceCategory }))}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Duration (min)</span>
            <input type="number" min={5} step={5} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.durationMin} onChange={(e) => setForm((f) => ({ ...f, durationMin: Number(e.target.value) }))} />
          </label>
          <label className="block col-span-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Price (LKR)</span>
            <input type="number" min={0} step={100} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) }))} />
          </label>
          <div className="col-span-2 flex gap-2 justify-end">
            <button onClick={closeForm} className="rounded-md border border-input px-4 py-2 text-sm">Cancel</button>
            <button onClick={saveForm} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-red">
              {editing ? "Save Changes" : "Add Service"}
            </button>
          </div>
        </div>
      )}

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
              <td className="py-3 text-right font-mono font-semibold">LKR {s.price.toLocaleString()}</td>
              <td className="py-3 text-right flex gap-2 justify-end">
                <button onClick={() => openEdit(s)} className="text-xs text-primary hover:underline">Edit</button>
                <button onClick={() => { if (confirm(`Delete "${s.name}"?`)) deleteService(s.id); }}
                  className="text-xs text-destructive hover:underline">Del</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 flex justify-end">
        <button onClick={openAdd}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-red">
          + Add Service
        </button>
      </div>
    </>
  );
}

function BaysPanel() {
  const bays = [
    { id: "Bay 1", type: "Wash + Detail", status: "Active" },
    { id: "Bay 2", type: "Wash", status: "Active" },
    { id: "Bay 3", type: "Paint Correction", status: "Maintenance" },
    { id: "Bay 4", type: "Coating Booth", status: "Active" },
    { id: "Bay 5", type: "Express", status: "Active" },
  ];
  return (
    <>
      <SectionTitle
        title="Bays & Capacity"
        desc="Configure service bays and their daily capacity rules."
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {bays.map((b) => (
          <div
            key={b.id}
            className="flex items-center justify-between rounded-lg border border-border p-3"
          >
            <div>
              <div className="font-display font-bold">{b.id}</div>
              <div className="text-xs text-muted-foreground">{b.type}</div>
            </div>
            <StatusChip variant={b.status === "Active" ? "success" : "warning"}>
              {b.status}
            </StatusChip>
          </div>
        ))}
      </div>
    </>
  );
}

function BookingRulesPanel() {
  const rules = [
    ["Minimum lead time", "30 minutes"],
    ["Maximum advance booking", "60 days"],
    ["Deposit required (>LKR 25k)", "20%"],
    ["Cancellation window", "24 hours"],
    ["No-show penalty", "LKR 1,500"],
    ["Auto-confirm walk-ins", "Yes"],
  ];
  return (
    <>
      <SectionTitle
        title="Booking Rules"
        desc="Policies enforced at the point of booking and cancellation."
      />
      <div className="divide-y divide-border">
        {rules.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between py-3">
            <span className="text-sm">{k}</span>
            <span className="font-mono text-sm font-semibold">{v}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function AccessPanel() {
  return (
    <>
      <SectionTitle title="Staff & Access" desc="Roles, PIN policy and session controls." />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="rounded-lg border border-border p-3">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            PIN Length
          </div>
          <div className="font-display text-xl font-bold">5 digits</div>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Demo PIN</div>
          <div className="font-display text-xl font-bold font-mono">{DEMO_PIN}</div>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Session Timeout
          </div>
          <div className="font-display text-xl font-bold">15 min</div>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Lockout</div>
          <div className="font-display text-xl font-bold">3 fails · 60s</div>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
          <tr>
            <th className="text-left py-2">Name</th>
            <th className="text-left py-2">Role</th>
            <th className="text-left py-2">PIN</th>
            <th className="text-left py-2">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {STAFF.map((s) => (
            <tr key={s.id}>
              <td className="py-2.5 font-medium">{s.name}</td>
              <td className="py-2.5 text-muted-foreground">{s.role}</td>
              <td className="py-2.5 font-mono">●●●●●</td>
              <td className="py-2.5">
                <StatusChip variant="success">Active</StatusChip>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function NotifyPanel() {
  const channels = [
    { name: "SMS — Booking Confirmation", on: true },
    { name: "SMS — Ready for Pickup", on: true },
    { name: "Email — Receipt", on: true },
    { name: "WhatsApp — Before/After Photos", on: true },
    { name: "Email — Marketing Campaigns", on: false },
  ];
  return (
    <>
      <SectionTitle title="Notifications" desc="Toggle outbound channels and message templates." />
      <div className="divide-y divide-border">
        {channels.map((c) => (
          <div key={c.name} className="flex items-center justify-between py-3">
            <span className="text-sm">{c.name}</span>
            <span
              className={cn(
                "inline-flex h-6 w-11 items-center rounded-full p-0.5 transition-colors",
                c.on ? "bg-primary" : "bg-muted",
              )}
            >
              <span
                className={cn(
                  "h-5 w-5 rounded-full bg-white shadow transition-transform",
                  c.on ? "translate-x-5" : "translate-x-0",
                )}
              />
            </span>
          </div>
        ))}
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
              <button className="inline-flex items-center gap-1 rounded-md border border-input px-3 py-1.5 text-xs hover:bg-accent">
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
  const events = [...db.audit.list()].reverse();
  return (
    <>
      <SectionTitle
        title="Audit Log"
        desc="All admin and manager actions are recorded immutably."
      />
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">No audit events recorded yet.</p>
      ) : (
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
                  {new Date(e.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </td>
                <td className="py-2.5 font-medium">{e.staffName || e.staffId || "—"}</td>
                <td className="py-2.5">
                  <StatusChip variant="neutral">{e.entity}</StatusChip>
                </td>
                <td className="py-2.5 text-muted-foreground">{e.action.replace(/_/g, " ")}{e.entityId ? ` · ${e.entityId}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
