import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import { Search, Mail, Phone, Car, Calendar, UserPlus, Archive, CheckCircle2 } from "lucide-react";
import type { Lead, LeadStatus, LeadType } from "@/lib/db";
import { formatDate } from "@/lib/date-format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/leads")({
  head: () => ({ meta: [{ title: "Leads · Polish Station OS" }] }),
  component: Leads,
});

const STATUS_TONE: Record<LeadStatus, "info" | "warning" | "success" | "neutral"> = {
  new: "info",
  contacted: "warning",
  converted: "success",
  archived: "neutral",
};

const TYPE_LABEL: Record<LeadType, string> = {
  contact: "Contact",
  booking: "Booking Request",
};

function LeadActions({
  lead,
  onStatusChange,
  onConvert,
}: {
  lead: Lead;
  onStatusChange: (status: LeadStatus) => void;
  onConvert: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {lead.status !== "contacted" && lead.status !== "converted" && (
        <button
          onClick={() => onStatusChange("contacted")}
          className="inline-flex items-center gap-1 rounded-md border border-input px-2.5 py-1.5 text-[11px] font-medium hover:bg-accent"
        >
          <CheckCircle2 className="h-3.5 w-3.5" /> Mark Contacted
        </button>
      )}
      {lead.status !== "converted" && (
        <button
          onClick={onConvert}
          className="inline-flex items-center gap-1 rounded-md border border-input px-2.5 py-1.5 text-[11px] font-medium hover:bg-accent"
        >
          <UserPlus className="h-3.5 w-3.5" /> Convert to Customer
        </button>
      )}
      {lead.status !== "archived" && (
        <button
          onClick={() => onStatusChange("archived")}
          className="inline-flex items-center gap-1 rounded-md border border-input px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-accent"
        >
          <Archive className="h-3.5 w-3.5" /> Archive
        </button>
      )}
    </div>
  );
}

function LeadCard({
  lead,
  onStatusChange,
  onConvert,
}: {
  lead: Lead;
  onStatusChange: (status: LeadStatus) => void;
  onConvert: () => void;
}) {
  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold truncate">{lead.name}</span>
            <StatusChip variant={STATUS_TONE[lead.status]}>{lead.status}</StatusChip>
          </div>
          <div className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            {TYPE_LABEL[lead.type]} · {formatDate(lead.createdAt)}
          </div>
        </div>
      </div>

      <div className="mt-2 space-y-1 text-sm text-muted-foreground">
        {lead.email && (
          <div className="flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5 shrink-0" /> {lead.email}
          </div>
        )}
        {lead.phone && (
          <div className="flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5 shrink-0" /> {lead.phone}
          </div>
        )}
        {lead.vehicle && (
          <div className="flex items-center gap-1.5">
            <Car className="h-3.5 w-3.5 shrink-0" /> {lead.vehicle}
            {lead.serviceId && <span> · {lead.serviceId}</span>}
          </div>
        )}
        {lead.preferredDate && (
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 shrink-0" /> {lead.preferredDate}
            {lead.timeWindow && <span> · {lead.timeWindow}</span>}
          </div>
        )}
        {(lead.message || lead.notes) && (
          <p className="pt-1 text-foreground">{lead.message || lead.notes}</p>
        )}
      </div>

      <div className="mt-3">
        <LeadActions lead={lead} onStatusChange={onStatusChange} onConvert={onConvert} />
      </div>
    </div>
  );
}

function Leads() {
  const { leads, updateLead, addCustomer, customers } = useStore();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"All" | LeadType>("All");
  const [statusFilter, setStatusFilter] = useState<"All" | LeadStatus>("All");

  const filtered = leads.filter((l) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      l.name.toLowerCase().includes(q) ||
      (l.email ?? "").toLowerCase().includes(q) ||
      (l.phone ?? "").includes(q);
    const matchesType = typeFilter === "All" || l.type === typeFilter;
    const matchesStatus = statusFilter === "All" || l.status === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
  });

  function handleStatusChange(lead: Lead, status: LeadStatus) {
    updateLead({ ...lead, status });
    toast.success(`Lead marked ${status}`);
  }

  // Reuses the same customer-creation path the Customers screen uses
  // (addCustomer), since triaging a lead into a customer record is the same
  // shape of action staff already do there.
  function handleConvert(lead: Lead) {
    const existing = customers.find(
      (c) =>
        (lead.email && c.email.toLowerCase() === lead.email.toLowerCase()) ||
        (lead.phone && c.phone === lead.phone),
    );
    if (existing) {
      toast.error(`Already a customer: ${existing.name}`);
      updateLead({ ...lead, status: "converted" });
      return;
    }
    addCustomer({
      name: lead.name,
      phone: lead.phone ?? "",
      email: lead.email ?? "",
      vehicles: lead.vehicle ? [{ plate: "", model: lead.vehicle, color: "" }] : [],
    });
    updateLead({ ...lead, status: "converted" });
    toast.success(`${lead.name} added as a customer`);
  }

  const newCount = leads.filter((l) => l.status === "new").length;

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="Leads" subtitle={`${leads.length} inquiries · ${newCount} new`} />

      <div className="rounded-xl border border-border bg-card shadow-card">
        <div className="flex flex-col gap-3 p-4 border-b border-border sm:flex-row sm:items-center">
          <div className="flex flex-1 items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              className="flex-1 bg-transparent outline-none"
              placeholder="Search by name, email, phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="min-h-9 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as "All" | LeadType)}
          >
            <option value="All">All Types</option>
            <option value="contact">Contact</option>
            <option value="booking">Booking Request</option>
          </select>
          <select
            className="min-h-9 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "All" | LeadStatus)}
          >
            <option value="All">All Statuses</option>
            <option value="new">New</option>
            <option value="contacted">Contacted</option>
            <option value="converted">Converted</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        {/* Mobile: stacked cards */}
        <div className="divide-y divide-border md:hidden">
          {filtered.map((l) => (
            <LeadCard
              key={l.id}
              lead={l}
              onStatusChange={(status) => handleStatusChange(l, status)}
              onConvert={() => handleConvert(l)}
            />
          ))}
          {filtered.length === 0 && (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {search || typeFilter !== "All" || statusFilter !== "All"
                ? "No leads match your filter"
                : "No leads yet"}
            </div>
          )}
        </div>

        {/* Tablet/desktop: table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead className="bg-charcoal text-charcoal-foreground text-[11px] uppercase tracking-wider">
              <tr>
                <th className="text-left px-5 py-2.5">Lead</th>
                <th className="text-left px-3 py-2.5">Type</th>
                <th className="text-left px-3 py-2.5">Contact</th>
                <th className="text-left px-3 py-2.5">Details</th>
                <th className="text-left px-3 py-2.5">Received</th>
                <th className="text-left px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((l) => (
                <tr key={l.id} className="hover:bg-muted/40 align-top">
                  <td className="px-5 py-3 font-semibold">{l.name}</td>
                  <td className="px-3 py-3">
                    <span
                      className={cn(
                        "text-xs",
                        l.type === "booking" ? "text-primary font-medium" : "text-muted-foreground",
                      )}
                    >
                      {TYPE_LABEL[l.type]}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-xs text-muted-foreground">
                    {l.email && <div>{l.email}</div>}
                    {l.phone && <div className="font-mono">{l.phone}</div>}
                  </td>
                  <td className="px-3 py-3 max-w-xs text-xs text-muted-foreground">
                    {l.type === "booking" ? (
                      <>
                        <div>
                          {l.vehicle} {l.serviceId && `· ${l.serviceId}`}
                        </div>
                        <div>
                          {l.preferredDate} {l.timeWindow && `· ${l.timeWindow}`}
                        </div>
                      </>
                    ) : (
                      <div className="line-clamp-2">{l.message}</div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs text-muted-foreground">
                    {formatDate(l.createdAt)}
                  </td>
                  <td className="px-3 py-3">
                    <StatusChip variant={STATUS_TONE[l.status]}>{l.status}</StatusChip>
                  </td>
                  <td className="px-3 py-3">
                    <LeadActions
                      lead={l}
                      onStatusChange={(status) => handleStatusChange(l, status)}
                      onConvert={() => handleConvert(l)}
                    />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-muted-foreground">
                    {search || typeFilter !== "All" || statusFilter !== "All"
                      ? "No leads match your filter"
                      : "No leads yet"}
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
