import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { useStaffList, type PublicStaff } from "@/lib/use-staff-list";
import { useConfirm } from "@/hooks/use-confirm";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { BookingSheet } from "@/components/booking-sheet";
import {
  Search,
  Mail,
  Phone,
  MessageCircle,
  Car,
  Calendar,
  UserPlus,
  Archive,
  CheckCircle2,
  Tag,
  XCircle,
  Copy,
  Plus,
  MoreHorizontal,
  Globe,
  PhoneCall,
  Footprints,
  User,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";
import type { Lead, LeadStatus, LeadType, BookingType, Service } from "@/lib/db";
import { formatDate, formatDateTime, formatRelativeAge } from "@/lib/date-format";
import { formatCurrency } from "@/lib/currency";
import {
  isLegalLeadTransition,
  reconcileServiceIds,
  PREFERRED_WINDOW_SHORT_LABELS,
} from "@/lib/lead";
import { normalizePhone } from "@/lib/phone";
import { toWAPhone } from "@/lib/notifications";
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

const SOURCE_ICON: Record<string, typeof Globe> = {
  "polishstation.lk": Globe,
  whatsapp: MessageCircle,
  phone: PhoneCall,
  "walk-in": Footprints,
};

// The website's date input always posts YYYY-MM-DD; the staff "New Lead"
// dialog's preferredDate is free text (e.g. "this weekend") that formatDate()
// can't parse. Only format the ones that are actually dates.
const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
function displayPreferredDate(value: string): string {
  return ISO_DATE_ONLY.test(value) ? formatDate(value) : value;
}

// A booking lead carries its requested service one of two ways depending on
// origin: `services`/`otherService` (the website's checkbox list) or
// `serviceId` (the staff "New Lead" dialog's real-catalog dropdown) — never
// both on the same lead. reconcileServiceIds() folds either into one array;
// this resolves a staff-dialog serviceId against the real catalog for a
// human-readable chip label instead of the raw id.
function serviceChipLabels(lead: Lead, services: Service[]): string[] {
  return reconcileServiceIds(lead).map((id) => services.find((s) => s.id === id)?.name ?? id);
}

function vehicleLabel(lead: Lead): string {
  if (lead.vehicleMake || lead.vehicleModel) {
    const makeModel = [lead.vehicleMake, lead.vehicleModel].filter(Boolean).join(" ");
    return lead.vehicleYear ? `${makeModel} · ${lead.vehicleYear}` : makeModel;
  }
  return lead.vehicle || "—";
}

function requestedLabel(lead: Lead): string {
  if (!lead.preferredDate) return "—";
  const date = displayPreferredDate(lead.preferredDate);
  const window = lead.preferredWindow ? PREFERRED_WINDOW_SHORT_LABELS[lead.preferredWindow] : null;
  return window ? `${date} · ${window}` : date;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

const BUTTON =
  "inline-flex items-center gap-1 rounded-md border border-input px-2.5 py-1.5 text-[11px] font-medium hover:bg-accent";
const PRIMARY_BUTTON =
  "inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90";

// ─── Waiting cell ───────────────────────────────────────────────────────────
// Default sort target: oldest `new` lead first. Shows age-since-created,
// color-escalating the longer a lead sits untouched; once a lead has been
// acted on at all (firstResponseAt set — see stampFirstResponse in lead.ts),
// shows the response time achieved instead, in neutral.
function WaitingCell({ lead, now }: { lead: Lead; now: Date }) {
  if (lead.firstResponseAt) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-xs text-muted-foreground">{lead.responseMinutes ?? 0}m</span>
        </TooltipTrigger>
        <TooltipContent>Responded {formatDateTime(lead.firstResponseAt)}</TooltipContent>
      </Tooltip>
    );
  }
  const minutes = Math.round((now.getTime() - new Date(lead.createdAt).getTime()) / 60000);
  const tone =
    minutes >= 120
      ? "text-primary font-semibold"
      : minutes >= 30
        ? "text-warning font-semibold"
        : "text-foreground";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("text-xs", tone)}>{formatRelativeAge(lead.createdAt, now)}</span>
      </TooltipTrigger>
      <TooltipContent>Received {formatDateTime(lead.createdAt)}</TooltipContent>
    </Tooltip>
  );
}

// ─── Customer cell ──────────────────────────────────────────────────────────
function CustomerCell({ lead }: { lead: Lead }) {
  const SourceIcon = SOURCE_ICON[lead.source];
  const utm = [lead.utmSource, lead.utmMedium, lead.utmCampaign].filter(Boolean).join(" / ");
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <span className="font-semibold truncate">{lead.name}</span>
        {SourceIcon && (
          <Tooltip>
            <TooltipTrigger asChild>
              <SourceIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent>
              {utm ? `${sourceLabel(lead.source)} · ${utm}` : sourceLabel(lead.source)}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      {lead.phone && (
        <div className="mt-0.5 flex items-center gap-2 font-mono text-xs text-muted-foreground">
          <span>{lead.phone}</span>
          <a
            href={`https://wa.me/${toWAPhone(lead.phone)}`}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            aria-label={`Message ${lead.name} on WhatsApp`}
            className="text-success hover:opacity-70"
          >
            <MessageCircle className="h-3.5 w-3.5" />
          </a>
          <a
            href={`tel:${lead.phone}`}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Call ${lead.name}`}
            className="hover:opacity-70"
          >
            <Phone className="h-3.5 w-3.5" />
          </a>
        </div>
      )}
    </div>
  );
}

// ─── Owner cell ─────────────────────────────────────────────────────────────
function OwnerCell({
  lead,
  staffList,
  onAssign,
}: {
  lead: Lead;
  staffList: PublicStaff[];
  onAssign: (staffId: string | null) => void;
}) {
  const owner = staffList.find((s) => s.id === lead.assignedTo);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
        <button
          aria-label={owner ? `Reassign ${owner.name}` : "Assign owner"}
          className="grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold text-white hover:opacity-80"
          style={{ backgroundColor: owner?.color ?? "var(--muted-foreground)" }}
        >
          {owner ? initials(owner.name) : <User className="h-3.5 w-3.5" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel>Assign to</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={lead.assignedTo ?? ""}
          onValueChange={(v) => onAssign(v || null)}
        >
          <DropdownMenuRadioItem value="">Unassigned</DropdownMenuRadioItem>
          {staffList.map((s) => (
            <DropdownMenuRadioItem key={s.id} value={s.id}>
              {s.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Service chips ──────────────────────────────────────────────────────────
function ServiceChips({ labels }: { labels: string[] }) {
  if (labels.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  const shown = labels.slice(0, 2);
  const rest = labels.slice(2);
  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((s) => (
        <span
          key={s}
          className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
        >
          {s}
        </span>
      ))}
      {rest.length > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              +{rest.length}
            </span>
          </TooltipTrigger>
          <TooltipContent>{rest.join(", ")}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

// ─── Row actions: one primary button + overflow ────────────────────────────
// Terminal statuses this codebase's transition graph has no way out of
// (lost, archived) intentionally get no primary action here -- adding a
// Reopen/Restore transition is a data-layer change (lead.ts +
// firestore.rules), not a table-layout one; see the Phase 2 handoff notes.
function LeadRowActions({
  lead,
  staffList,
  onTransition,
  onConvert,
  onLost,
  onDuplicate,
  onAssign,
  onArchive,
  fullWidthPrimary,
}: {
  lead: Lead;
  staffList: PublicStaff[];
  onTransition: (status: "contacted" | "quoted") => void;
  onConvert: () => void;
  onLost: () => void;
  onDuplicate: () => void;
  onAssign: (staffId: string | null) => void;
  onArchive: () => void;
  /** Mobile card layout: the primary action fills the row, overflow stays a
   *  fixed-width trigger next to it (Phase 2/6 mobile spec). */
  fullWidthPrimary?: boolean;
}) {
  const can = (to: LeadStatus) => isLegalLeadTransition(lead.status, to);

  let primary: { label: string; icon: typeof CheckCircle2; onClick: () => void } | null = null;
  if (lead.status === "new" && can("contacted")) {
    primary = {
      label: "Mark Contacted",
      icon: CheckCircle2,
      onClick: () => onTransition("contacted"),
    };
  } else if (lead.status === "contacted" && can("quoted")) {
    primary = { label: "Mark Quoted", icon: Tag, onClick: () => onTransition("quoted") };
  } else if (
    (lead.status === "new" || lead.status === "contacted" || lead.status === "quoted") &&
    can("converted")
  ) {
    primary = { label: "Convert", icon: UserPlus, onClick: onConvert };
  }

  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      {primary && (
        <button
          onClick={primary.onClick}
          className={cn(PRIMARY_BUTTON, fullWidthPrimary && "flex-1 justify-center")}
        >
          <primary.icon className="h-3.5 w-3.5" /> {primary.label}
        </button>
      )}
      {lead.status === "converted" && lead.convertedTo && (
        <span className="text-[11px] text-muted-foreground truncate">
          → {lead.convertedTo.type} {lead.convertedTo.id}
        </span>
      )}
      {lead.status === "duplicate" && lead.duplicateOf && (
        <span className="text-[11px] text-muted-foreground truncate">
          → merged into {lead.duplicateOf}
        </span>
      )}
      {lead.status === "lost" && lead.lostReason && (
        <span className="text-[11px] text-muted-foreground truncate">{lead.lostReason}</span>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button aria-label="More actions" className={cn(BUTTON, "px-1.5")}>
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Assign to staff</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={lead.assignedTo ?? ""}
                onValueChange={(v) => onAssign(v || null)}
              >
                <DropdownMenuRadioItem value="">Unassigned</DropdownMenuRadioItem>
                {staffList.map((s) => (
                  <DropdownMenuRadioItem key={s.id} value={s.id}>
                    {s.name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          {can("duplicate") && (
            <DropdownMenuItem onClick={onDuplicate}>
              <Copy className="h-3.5 w-3.5" /> Mark as Duplicate
            </DropdownMenuItem>
          )}
          {can("lost") && (
            <DropdownMenuItem onClick={onLost} className="text-primary focus:text-primary">
              <XCircle className="h-3.5 w-3.5" /> Mark Lost
            </DropdownMenuItem>
          )}
          {can("archived") && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onArchive} className="text-primary focus:text-primary">
                <Archive className="h-3.5 w-3.5" /> Archive
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ─── Detail panel ───────────────────────────────────────────────────────────
// Minimal read-only pass for now -- full editable fields, the status
// timeline, add-note, and WhatsApp templates are Phase 5. This exists so the
// new clickable row has somewhere real to go.
function LeadDetailPanel({
  lead,
  staffList,
  services,
  onOpenChange,
  actions,
}: {
  lead: Lead | null;
  staffList: PublicStaff[];
  services: Service[];
  onOpenChange: (v: boolean) => void;
  actions: {
    onTransition: (lead: Lead, status: "contacted" | "quoted") => void;
    onConvert: (lead: Lead) => void;
    onLost: (lead: Lead) => void;
    onDuplicate: (lead: Lead) => void;
    onAssign: (lead: Lead, staffId: string | null) => void;
    onArchive: (lead: Lead) => void;
  };
}) {
  const owner = lead ? staffList.find((s) => s.id === lead.assignedTo) : undefined;
  return (
    <Sheet open={lead !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md flex flex-col overflow-y-auto">
        {lead && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                {lead.name}
                <StatusChip variant={STATUS_TONE[lead.status]}>{lead.status}</StatusChip>
              </SheetTitle>
              <SheetDescription>
                {TYPE_LABEL[lead.type]} · {sourceLabel(lead.source)} ·{" "}
                {formatDateTime(lead.createdAt)}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-4 flex-1 space-y-4 text-sm">
              <div className="space-y-1">
                {lead.email && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Mail className="h-3.5 w-3.5 shrink-0" /> {lead.email}
                  </div>
                )}
                {lead.phone && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Phone className="h-3.5 w-3.5 shrink-0" /> {lead.phone}
                    <a
                      href={`https://wa.me/${toWAPhone(lead.phone)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-success hover:opacity-70"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                    </a>
                  </div>
                )}
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Vehicle
                </h4>
                <div className="flex items-center gap-1.5">
                  <Car className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />{" "}
                  {vehicleLabel(lead)}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Services
                </h4>
                <ServiceChips labels={serviceChipLabels(lead, services)} />
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Requested
                </h4>
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />{" "}
                  {requestedLabel(lead)}
                </div>
              </div>

              {lead.notes && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                    Notes
                  </h4>
                  <p className="whitespace-pre-wrap text-foreground">{lead.notes}</p>
                </div>
              )}

              {(lead.utmSource || lead.utmMedium || lead.utmCampaign || lead.landingPage) && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                    Attribution
                  </h4>
                  <div className="space-y-0.5 text-xs text-muted-foreground">
                    {lead.utmSource && <div>Source: {lead.utmSource}</div>}
                    {lead.utmMedium && <div>Medium: {lead.utmMedium}</div>}
                    {lead.utmCampaign && <div>Campaign: {lead.utmCampaign}</div>}
                    {lead.landingPage && <div>Landing page: {lead.landingPage}</div>}
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Owner
                </h4>
                <div className="text-muted-foreground">{owner?.name ?? "Unassigned"}</div>
              </div>

              {lead.firstResponseAt && (
                <div className="text-xs text-muted-foreground">
                  First response {formatDateTime(lead.firstResponseAt)} ({lead.responseMinutes}m
                  after received)
                </div>
              )}
            </div>

            <div className="border-t border-border pt-3">
              <LeadRowActions
                lead={lead}
                staffList={staffList}
                onTransition={(status) => actions.onTransition(lead, status)}
                onConvert={() => actions.onConvert(lead)}
                onLost={() => actions.onLost(lead)}
                onDuplicate={() => actions.onDuplicate(lead)}
                onAssign={(staffId) => actions.onAssign(lead, staffId)}
                onArchive={() => actions.onArchive(lead)}
              />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

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

// ─── Mobile card ────────────────────────────────────────────────────────────

function LeadCard({
  lead,
  now,
  staffList,
  onTransition,
  onConvert,
  onLost,
  onDuplicate,
  onAssign,
  onArchive,
  onOpen,
  services,
}: {
  lead: Lead;
  now: Date;
  staffList: PublicStaff[];
  onTransition: (status: "contacted" | "quoted") => void;
  onConvert: () => void;
  onLost: () => void;
  onDuplicate: () => void;
  onAssign: (staffId: string | null) => void;
  onArchive: () => void;
  onOpen: () => void;
  services: Service[];
}) {
  return (
    <div className="p-4" onClick={onOpen}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold truncate">{lead.name}</span>
            <StatusChip variant={STATUS_TONE[lead.status]}>{lead.status}</StatusChip>
          </div>
          <div className="mt-0.5">
            <WaitingCell lead={lead} now={now} />
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
        <div className="flex items-center gap-1.5">
          <Car className="h-3.5 w-3.5 shrink-0" /> {vehicleLabel(lead)}
        </div>
        <ServiceChips labels={serviceChipLabels(lead, services)} />
        <div className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5 shrink-0" /> {requestedLabel(lead)}
        </div>
      </div>

      <div className="mt-3">
        <LeadRowActions
          lead={lead}
          staffList={staffList}
          onTransition={onTransition}
          onConvert={onConvert}
          onLost={onLost}
          onDuplicate={onDuplicate}
          onAssign={onAssign}
          onArchive={onArchive}
          fullWidthPrimary
        />
      </div>
    </div>
  );
}

// ─── Loading / empty states ─────────────────────────────────────────────────

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <tr key={i}>
          {Array.from({ length: 8 }).map((_, j) => (
            <td key={j} className="px-3 py-3">
              <Skeleton className="h-4 w-full max-w-32" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function Leads() {
  const { leads, services, transitionLeadStatus, assignLead, storeLoading, listenerErrors } =
    useStore();
  const { staffList } = useStaffList();
  const { confirm, ConfirmDialog } = useConfirm();
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
  const [detailLead, setDetailLead] = useState<Lead | null>(null);
  const [now, setNow] = useState(() => new Date());

  // Keeps the Waiting column's relative age (and its color escalation) from
  // going stale while the tab stays open.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const visibleLeads = leads.filter((l) => !l.isTest);

  const filtered = visibleLeads.filter((l) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      l.name.toLowerCase().includes(q) ||
      (l.email ?? "").toLowerCase().includes(q) ||
      (l.phone ?? "").includes(q) ||
      (l.vehicle ?? "").toLowerCase().includes(q);
    const matchesType = typeFilter === "All" || l.type === typeFilter;
    const matchesStatus = statusFilter === "All" || l.status === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
  });

  function clearFilters() {
    setSearch("");
    setTypeFilter("All");
    setStatusFilter("All");
  }

  function handleTransition(lead: Lead, status: "contacted" | "quoted") {
    transitionLeadStatus(lead, status);
    toast.success(`Lead marked ${status}`);
  }

  async function handleArchive(lead: Lead) {
    if (!(await confirm({ title: "Archive this lead?", description: lead.name }))) return;
    transitionLeadStatus(lead, "archived");
    toast.success("Lead archived");
  }

  function handleAssign(lead: Lead, staffId: string | null) {
    assignLead(lead, staffId);
    toast.success(staffId ? "Lead assigned" : "Lead unassigned");
  }

  const newCount = visibleLeads.filter((l) => l.status === "new").length;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="p-4 sm:p-6">
        {ConfirmDialog}
        <PageHeader
          title="Leads"
          subtitle={`${visibleLeads.length} inquiries · ${newCount} new`}
          actions={
            <button
              onClick={() => setNewLeadOpen(true)}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-red hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" /> New Lead
            </button>
          }
        />

        {listenerErrors.has("leads") && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm text-primary">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Couldn't load the latest leads.
            <button
              onClick={() => window.location.reload()}
              className="ml-auto inline-flex items-center gap-1 font-medium underline underline-offset-2"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reload
            </button>
          </div>
        )}

        <div className="rounded-xl border border-border bg-card shadow-card">
          <div className="flex flex-col gap-3 p-4 border-b border-border sm:flex-row sm:items-center">
            <div className="flex flex-1 items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                className="flex-1 bg-transparent outline-none"
                placeholder="Search by name, email, phone, vehicle…"
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
            {storeLoading ? (
              <div className="space-y-3 p-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            ) : (
              <>
                {filtered.map((l) => (
                  <LeadCard
                    key={l.id}
                    lead={l}
                    now={now}
                    staffList={staffList}
                    services={services}
                    onTransition={(status) => handleTransition(l, status)}
                    onConvert={() => setConvertingLead(l)}
                    onLost={() => setLostLead(l)}
                    onDuplicate={() => setDuplicateLead(l)}
                    onAssign={(staffId) => handleAssign(l, staffId)}
                    onArchive={() => handleArchive(l)}
                    onOpen={() => setDetailLead(l)}
                  />
                ))}
                {filtered.length === 0 && (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    {visibleLeads.length === 0 ? (
                      "No leads yet"
                    ) : (
                      <div className="space-y-2">
                        <div>No leads match your filters</div>
                        <button onClick={clearFilters} className={BUTTON}>
                          Clear filters
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Tablet/desktop: table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-charcoal text-charcoal-foreground text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="text-left px-5 py-2.5">Waiting</th>
                  <th className="text-left px-3 py-2.5">Customer</th>
                  <th className="text-left px-3 py-2.5">Vehicle</th>
                  <th className="text-left px-3 py-2.5">Service</th>
                  <th className="text-left px-3 py-2.5">Requested</th>
                  <th className="text-left px-3 py-2.5">Status</th>
                  <th className="text-left px-3 py-2.5">Owner</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {storeLoading ? (
                  <SkeletonRows />
                ) : (
                  <>
                    {filtered.map((l) => (
                      <tr
                        key={l.id}
                        onClick={() => setDetailLead(l)}
                        className="h-16 cursor-pointer align-middle hover:bg-muted/40"
                      >
                        <td className="px-5 py-3">
                          <WaitingCell lead={l} now={now} />
                        </td>
                        <td className="px-3 py-3 max-w-56">
                          <CustomerCell lead={l} />
                        </td>
                        <td className="px-3 py-3 text-xs text-muted-foreground truncate max-w-40">
                          {vehicleLabel(l)}
                        </td>
                        <td className="px-3 py-3 max-w-48">
                          <ServiceChips labels={serviceChipLabels(l, services)} />
                        </td>
                        <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {requestedLabel(l)}
                        </td>
                        <td className="px-3 py-3">
                          <StatusChip variant={STATUS_TONE[l.status]}>{l.status}</StatusChip>
                        </td>
                        <td className="px-3 py-3">
                          <OwnerCell
                            lead={l}
                            staffList={staffList}
                            onAssign={(staffId) => handleAssign(l, staffId)}
                          />
                        </td>
                        <td className="px-3 py-3">
                          <LeadRowActions
                            lead={l}
                            staffList={staffList}
                            onTransition={(status) => handleTransition(l, status)}
                            onConvert={() => setConvertingLead(l)}
                            onLost={() => setLostLead(l)}
                            onDuplicate={() => setDuplicateLead(l)}
                            onAssign={(staffId) => handleAssign(l, staffId)}
                            onArchive={() => handleArchive(l)}
                          />
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={8} className="text-center py-10 text-muted-foreground">
                          {visibleLeads.length === 0 ? (
                            "No leads yet"
                          ) : (
                            <div className="space-y-2">
                              <div>No leads match your filters</div>
                              <button onClick={clearFilters} className={BUTTON}>
                                Clear filters
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <NewLeadDialog open={newLeadOpen} onOpenChange={setNewLeadOpen} />
        <LostDialog lead={lostLead} onOpenChange={(v) => !v && setLostLead(null)} />
        <DuplicateDialog
          lead={duplicateLead}
          leads={visibleLeads}
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
        <LeadDetailPanel
          lead={detailLead}
          staffList={staffList}
          services={services}
          onOpenChange={(v) => !v && setDetailLead(null)}
          actions={{
            onTransition: handleTransition,
            onConvert: (lead) => {
              setDetailLead(null);
              setConvertingLead(lead);
            },
            onLost: (lead) => {
              setDetailLead(null);
              setLostLead(lead);
            },
            onDuplicate: (lead) => {
              setDetailLead(null);
              setDuplicateLead(lead);
            },
            onAssign: handleAssign,
            onArchive: handleArchive,
          }}
        />
      </div>
    </TooltipProvider>
  );
}
