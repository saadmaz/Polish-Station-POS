import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { BookingSheet } from "@/components/booking-sheet";
import {
  Search,
  Mail,
  Phone,
  Car,
  Calendar,
  UserPlus,
  Archive,
  CheckCircle2,
  Tag,
  XCircle,
  Copy,
  Plus,
} from "lucide-react";
import type { Lead, LeadStatus, LeadType, BookingType } from "@/lib/db";
import { formatDate } from "@/lib/date-format";
import { formatCurrency } from "@/lib/currency";
import { isLegalLeadTransition } from "@/lib/lead";
import { normalizePhone } from "@/lib/phone";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/leads")({
  head: () => ({ meta: [{ title: "Leads · Polish Station OS" }] }),
  component: Leads,
});

type Tone = "info" | "warning" | "success" | "neutral" | "danger";

const STATUS_TONE: Record<LeadStatus, Tone> = {
  new: "info",
  contacted: "warning",
  quoted: "warning",
  converted: "success",
  lost: "danger",
  duplicate: "neutral",
  archived: "neutral",
};

const TYPE_LABEL: Record<LeadType, string> = {
  contact: "Contact",
  booking: "Booking Request",
};

const MANUAL_SOURCES = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "phone", label: "Phone Call" },
  { value: "walk-in", label: "Walk-in" },
] as const;

function sourceLabel(source: string): string {
  const manual = MANUAL_SOURCES.find((s) => s.value === source);
  return manual?.label ?? source;
}

const BUTTON =
  "inline-flex items-center gap-1 rounded-md border border-input px-2.5 py-1.5 text-[11px] font-medium hover:bg-accent";

// ─── New Lead dialog (manual WhatsApp/phone/walk-in entry) ────────────────────

function NewLeadDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { addLead, services } = useStore();
  const [type, setType] = useState<LeadType>("contact");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [source, setSource] = useState<(typeof MANUAL_SOURCES)[number]["value"]>("walk-in");
  const [vehicle, setVehicle] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [timeWindow, setTimeWindow] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setType("contact");
    setName("");
    setPhone("");
    setEmail("");
    setSource("walk-in");
    setVehicle("");
    setServiceId("");
    setPreferredDate("");
    setTimeWindow("");
    setNotes("");
    setMessage("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    addLead({
      type,
      name: name.trim(),
      ...(phone.trim() ? { phone: phone.trim() } : {}),
      ...(email.trim() ? { email: email.trim() } : {}),
      ...(type === "contact" ? { message: message.trim() } : {}),
      ...(type === "booking"
        ? { vehicle: vehicle.trim(), serviceId, preferredDate, timeWindow }
        : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      source,
    });
    toast.success("Lead added");
    setSubmitting(false);
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Lead</DialogTitle>
          <DialogDescription>Log a WhatsApp, phone, or walk-in inquiry.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-2">
            {MANUAL_SOURCES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setSource(s.value)}
                className={cn(
                  "flex-1 rounded-md border px-3 py-1.5 text-sm font-medium",
                  source === s.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-input hover:bg-accent",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Name *</label>
            <input
              required
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Phone</label>
              <input
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="+94 71 000 0000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Email</label>
              <input
                type="email"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-2">
            {(["contact", "booking"] as LeadType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={cn(
                  "flex-1 rounded-md border px-3 py-1.5 text-sm font-medium",
                  type === t
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-input hover:bg-accent",
                )}
              >
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>

          {type === "contact" ? (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Message</label>
              <textarea
                rows={2}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Vehicle</label>
                  <input
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Toyota Aqua"
                    value={vehicle}
                    onChange={(e) => setVehicle(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Service</label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={serviceId}
                    onChange={(e) => setServiceId(e.target.value)}
                  >
                    <option value="">Not sure yet…</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Preferred Date</label>
                  <input
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="e.g. this weekend"
                    value={preferredDate}
                    onChange={(e) => setPreferredDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Time Window</label>
                  <input
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="e.g. morning"
                    value={timeWindow}
                    onChange={(e) => setTimeWindow(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Notes</label>
            <textarea
              rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <DialogFooter>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-red hover:bg-primary/90 disabled:opacity-60"
            >
              Add Lead
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Mark Lost dialog ──────────────────────────────────────────────────────────

function LostDialog({
  lead,
  onOpenChange,
}: {
  lead: Lead | null;
  onOpenChange: (v: boolean) => void;
}) {
  const { markLeadLost } = useStore();
  const [reason, setReason] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!lead || !reason.trim()) return;
    markLeadLost(lead, reason.trim());
    toast.success("Lead marked lost");
    setReason("");
    onOpenChange(false);
  }

  return (
    <Dialog
      open={lead !== null}
      onOpenChange={(v) => {
        if (!v) setReason("");
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark Lost</DialogTitle>
          <DialogDescription>{lead?.name}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Reason *</label>
            <textarea
              required
              rows={3}
              autoFocus
              placeholder="Why was this lead lost?"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <button
              type="submit"
              disabled={!reason.trim()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-red hover:bg-primary/90 disabled:opacity-60"
            >
              Mark Lost
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Mark Duplicate dialog ──────────────────────────────────────────────────────

function DuplicateDialog({
  lead,
  leads,
  onOpenChange,
}: {
  lead: Lead | null;
  leads: Lead[];
  onOpenChange: (v: boolean) => void;
}) {
  const { markLeadDuplicate } = useStore();
  const [search, setSearch] = useState("");
  const [targetId, setTargetId] = useState<string | null>(null);

  const candidates = lead
    ? leads.filter((l) => {
        if (l.id === lead.id) return false;
        if (["converted", "lost", "duplicate"].includes(l.status)) return false;
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return l.name.toLowerCase().includes(q) || (l.phone ?? "").includes(q);
      })
    : [];

  function handleSubmit() {
    if (!lead || !targetId) return;
    markLeadDuplicate(lead, targetId);
    toast.success("Lead marked as duplicate");
    setTargetId(null);
    setSearch("");
    onOpenChange(false);
  }

  return (
    <Dialog
      open={lead !== null}
      onOpenChange={(v) => {
        if (!v) {
          setTargetId(null);
          setSearch("");
        }
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark as Duplicate</DialogTitle>
          <DialogDescription>Merge {lead?.name} into another open lead.</DialogDescription>
        </DialogHeader>
        <input
          placeholder="Search leads by name or phone…"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="max-h-60 overflow-y-auto divide-y divide-border rounded-md border border-border">
          {candidates.map((l) => (
            <label
              key={l.id}
              className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-accent"
            >
              <input
                type="radio"
                name="dup-target"
                checked={targetId === l.id}
                onChange={() => setTargetId(l.id)}
              />
              <span className="text-sm">
                {l.name}
                {l.phone && <span className="text-muted-foreground"> · {l.phone}</span>}
              </span>
            </label>
          ))}
          {candidates.length === 0 && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No other open leads
            </div>
          )}
        </div>
        <DialogFooter>
          <button
            onClick={handleSubmit}
            disabled={!targetId}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-red hover:bg-primary/90 disabled:opacity-60"
          >
            Mark Duplicate
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Convert dialogs ────────────────────────────────────────────────────────────

function ConvertChooserDialog({
  lead,
  onOpenChange,
  onChooseBooking,
  onChooseInvoice,
}: {
  lead: Lead | null;
  onOpenChange: (v: boolean) => void;
  onChooseBooking: (type: BookingType) => void;
  onChooseInvoice: () => void;
}) {
  return (
    <Dialog open={lead !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convert Lead</DialogTitle>
          <DialogDescription>{lead?.name} — what does this convert into?</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => onChooseBooking("inspection")}
            className="rounded-md border border-input px-4 py-3 text-left text-sm font-medium hover:bg-accent"
          >
            Inspection booking
            <div className="text-xs font-normal text-muted-foreground">
              Free assessment, scheduled on the calendar
            </div>
          </button>
          <button
            onClick={() => onChooseBooking("service")}
            className="rounded-md border border-input px-4 py-3 text-left text-sm font-medium hover:bg-accent"
          >
            Service booking
            <div className="text-xs font-normal text-muted-foreground">
              A paid job, scheduled on the calendar
            </div>
          </button>
          <button
            onClick={onChooseInvoice}
            className="rounded-md border border-input px-4 py-3 text-left text-sm font-medium hover:bg-accent"
          >
            Link to invoice
            <div className="text-xs font-normal text-muted-foreground">
              Already rung up at the till — no booking involved
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LinkInvoiceDialog({
  lead,
  onOpenChange,
}: {
  lead: Lead | null;
  onOpenChange: (v: boolean) => void;
}) {
  const { invoices, convertLeadToInvoiceLink } = useStore();
  const [search, setSearch] = useState("");
  const [linking, setLinking] = useState<string | null>(null);

  const candidates = lead
    ? invoices.filter((inv) => {
        const q = search.trim().toLowerCase();
        if (q) {
          return (
            inv.id.toLowerCase().includes(q) ||
            inv.customerName.toLowerCase().includes(q) ||
            (inv.phone ?? "").includes(q)
          );
        }
        const nameMatch = inv.customerName.toLowerCase().includes(lead.name.toLowerCase());
        const phoneMatch =
          Boolean(lead.phone) &&
          Boolean(inv.phone) &&
          normalizePhone(inv.phone!) === normalizePhone(lead.phone!);
        return nameMatch || phoneMatch;
      })
    : [];

  async function handleLink(invoiceId: string) {
    if (!lead) return;
    setLinking(invoiceId);
    try {
      await convertLeadToInvoiceLink(lead, invoiceId);
      toast.success("Lead linked to invoice");
      onOpenChange(false);
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      toast.error(
        name === "LeadAlreadyConvertedError"
          ? "This lead was already converted"
          : "Couldn't link that invoice",
      );
    } finally {
      setLinking(null);
    }
  }

  return (
    <Dialog
      open={lead !== null}
      onOpenChange={(v) => {
        if (!v) setSearch("");
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link to Invoice</DialogTitle>
          <DialogDescription>{lead?.name}</DialogDescription>
        </DialogHeader>
        <input
          placeholder="Search by invoice #, name, or phone…"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="max-h-72 overflow-y-auto divide-y divide-border rounded-md border border-border">
          {candidates.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">
                  {inv.id} · {inv.customerName}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatCurrency(inv.total)} · {formatDate(inv.createdAt)}
                </div>
              </div>
              <button
                onClick={() => handleLink(inv.id)}
                disabled={linking === inv.id}
                className="shrink-0 rounded-md border border-input px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-60"
              >
                Link
              </button>
            </div>
          ))}
          {candidates.length === 0 && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No matching invoices
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Lead row actions ────────────────────────────────────────────────────────

function LeadActions({
  lead,
  onTransition,
  onConvert,
  onLost,
  onDuplicate,
}: {
  lead: Lead;
  onTransition: (status: "contacted" | "quoted" | "archived") => void;
  onConvert: () => void;
  onLost: () => void;
  onDuplicate: () => void;
}) {
  const can = (to: LeadStatus) => isLegalLeadTransition(lead.status, to);
  return (
    <div className="flex flex-wrap gap-1.5">
      {can("contacted") && (
        <button onClick={() => onTransition("contacted")} className={BUTTON}>
          <CheckCircle2 className="h-3.5 w-3.5" /> Mark Contacted
        </button>
      )}
      {can("quoted") && (
        <button onClick={() => onTransition("quoted")} className={BUTTON}>
          <Tag className="h-3.5 w-3.5" /> Mark Quoted
        </button>
      )}
      {can("converted") && (
        <button onClick={onConvert} className={BUTTON}>
          <UserPlus className="h-3.5 w-3.5" /> Convert
        </button>
      )}
      {can("lost") && (
        <button onClick={onLost} className={BUTTON}>
          <XCircle className="h-3.5 w-3.5" /> Mark Lost
        </button>
      )}
      {can("duplicate") && (
        <button onClick={onDuplicate} className={BUTTON}>
          <Copy className="h-3.5 w-3.5" /> Duplicate
        </button>
      )}
      {can("archived") && (
        <button
          onClick={() => onTransition("archived")}
          className={cn(BUTTON, "text-muted-foreground")}
        >
          <Archive className="h-3.5 w-3.5" /> Archive
        </button>
      )}
      {lead.status === "converted" && lead.convertedTo && (
        <span className="inline-flex items-center px-1 text-[11px] text-muted-foreground">
          → {lead.convertedTo.id}
        </span>
      )}
      {lead.status === "lost" && lead.lostReason && (
        <span className="inline-flex items-center px-1 text-[11px] text-muted-foreground truncate">
          {lead.lostReason}
        </span>
      )}
    </div>
  );
}

function LeadCard({
  lead,
  onTransition,
  onConvert,
  onLost,
  onDuplicate,
}: {
  lead: Lead;
  onTransition: (status: "contacted" | "quoted" | "archived") => void;
  onConvert: () => void;
  onLost: () => void;
  onDuplicate: () => void;
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
            {TYPE_LABEL[lead.type]} · {sourceLabel(lead.source)} · {formatDate(lead.createdAt)}
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
        <LeadActions
          lead={lead}
          onTransition={onTransition}
          onConvert={onConvert}
          onLost={onLost}
          onDuplicate={onDuplicate}
        />
      </div>
    </div>
  );
}

function Leads() {
  const { leads, transitionLeadStatus } = useStore();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"All" | LeadType>("All");
  const [statusFilter, setStatusFilter] = useState<"All" | LeadStatus>("All");
  const [newLeadOpen, setNewLeadOpen] = useState(false);
  const [lostLead, setLostLead] = useState<Lead | null>(null);
  const [duplicateLead, setDuplicateLead] = useState<Lead | null>(null);
  const [convertingLead, setConvertingLead] = useState<Lead | null>(null);
  const [bookingConvert, setBookingConvert] = useState<{
    lead: Lead;
    bookingType: BookingType;
  } | null>(null);
  const [invoiceLinkLead, setInvoiceLinkLead] = useState<Lead | null>(null);

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

  function handleTransition(lead: Lead, status: "contacted" | "quoted" | "archived") {
    transitionLeadStatus(lead, status);
    toast.success(`Lead marked ${status}`);
  }

  const newCount = leads.filter((l) => l.status === "new").length;

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="Leads"
        subtitle={`${leads.length} inquiries · ${newCount} new`}
        actions={
          <button
            onClick={() => setNewLeadOpen(true)}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-red hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> New Lead
          </button>
        }
      />

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
            <option value="quoted">Quoted</option>
            <option value="converted">Converted</option>
            <option value="lost">Lost</option>
            <option value="duplicate">Duplicate</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        {/* Mobile: stacked cards */}
        <div className="divide-y divide-border md:hidden">
          {filtered.map((l) => (
            <LeadCard
              key={l.id}
              lead={l}
              onTransition={(status) => handleTransition(l, status)}
              onConvert={() => setConvertingLead(l)}
              onLost={() => setLostLead(l)}
              onDuplicate={() => setDuplicateLead(l)}
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
                <th className="text-left px-3 py-2.5">Source</th>
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
                    {sourceLabel(l.source)}
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
                      onTransition={(status) => handleTransition(l, status)}
                      onConvert={() => setConvertingLead(l)}
                      onLost={() => setLostLead(l)}
                      onDuplicate={() => setDuplicateLead(l)}
                    />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-muted-foreground">
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

      <NewLeadDialog open={newLeadOpen} onOpenChange={setNewLeadOpen} />
      <LostDialog lead={lostLead} onOpenChange={(v) => !v && setLostLead(null)} />
      <DuplicateDialog
        lead={duplicateLead}
        leads={leads}
        onOpenChange={(v) => !v && setDuplicateLead(null)}
      />
      <ConvertChooserDialog
        lead={convertingLead}
        onOpenChange={(v) => !v && setConvertingLead(null)}
        onChooseBooking={(bookingType) => {
          if (!convertingLead) return;
          setBookingConvert({ lead: convertingLead, bookingType });
          setConvertingLead(null);
        }}
        onChooseInvoice={() => {
          setInvoiceLinkLead(convertingLead);
          setConvertingLead(null);
        }}
      />
      <LinkInvoiceDialog
        lead={invoiceLinkLead}
        onOpenChange={(v) => !v && setInvoiceLinkLead(null)}
      />
      <BookingSheet
        open={bookingConvert !== null}
        onOpenChange={(v) => !v && setBookingConvert(null)}
        convertLead={bookingConvert ?? undefined}
      />
    </div>
  );
}
