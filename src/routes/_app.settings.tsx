import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Building2, Tag, ParkingMeter, Calendar, ShieldCheck, Bell, Link2, ScrollText } from "lucide-react";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Settings — Polish Station OS" }] }),
  component: Settings,
});

const SECTIONS = [
  { icon: Building2, name: "Business", desc: "Name, logo, hours, tax rate, receipt header" },
  { icon: Tag, name: "Services Catalog", desc: "Services, add-ons, bundles, pricing tiers" },
  { icon: ParkingMeter, name: "Bays & Capacity", desc: "Bay types, capacity rules, maintenance" },
  { icon: Calendar, name: "Booking Rules", desc: "Lead time, deposits, cancellation policy" },
  { icon: ShieldCheck, name: "Staff & Access", desc: "Roles, PIN length, timeout, lockout" },
  { icon: Bell, name: "Notifications", desc: "SMS, Email, WhatsApp templates" },
  { icon: Link2, name: "Integrations", desc: "Payment terminal, QuickBooks, Google Calendar" },
  { icon: ScrollText, name: "Audit Log", desc: "All admin/manager actions, exportable" },
];

function Settings() {
  return (
    <div className="p-6">
      <PageHeader title="Settings" subtitle="Admin-only · all changes audited" />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {SECTIONS.map(({ icon: Icon, name, desc }) => (
          <button
            key={name}
            className="text-left rounded-xl border border-border bg-card p-5 shadow-card hover:border-primary hover:shadow-elevated transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-md bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <div className="font-display font-bold">{name}</div>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
