import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import { useStore } from "@/lib/store";
import { useStaffList, type PublicStaff } from "@/lib/use-staff-list";
import { useConfirm } from "@/hooks/use-confirm";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import { JobSheet } from "@/components/job-sheet";
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
  DropdownMenuCheckboxItem,
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
  ArchiveRestore,
  Undo2,
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
  ExternalLink,
  DollarSign,
  Pencil,
  Send,
  History,
  MessageSquareText,
  Save,
} from "lucide-react";
import type {
  Lead,
  LeadStatus,
  LeadType,
  BookingType,
  Service,
  LostReason,
  LeadEvent,
  VehicleBodyType,
} from "@/lib/db";
import { LOST_REASONS } from "@/lib/db";
import { formatDate, formatDateTime, formatRelativeAge } from "@/lib/date-format";
import { formatCurrency } from "@/lib/currency";
import {
  isLegalLeadTransition,
  reconcileServiceIds,
  PREFERRED_WINDOW_SHORT_LABELS,
  LOST_REASON_LABELS,
} from "@/lib/lead";
import { normalizePhone } from "@/lib/phone";
import { toWAPhone, buildWALink, fillTemplate } from "@/lib/notifications";
import { cn } from "@/lib/utils";

const VEHICLE_BODY_TYPES: { value: VehicleBodyType; label: string }[] = [
  { value: "sedan", label: "Sedan" },
  { value: "hatchback", label: "Hatchback" },
  { value: "suv", label: "SUV" },
  { value: "double_cab", label: "Double Cab" },
  { value: "van", label: "Van" },
  { value: "coupe", label: "Coupe" },
];

// Pre-written starting points for the detail panel's WhatsApp buttons --
// staff can edit the text in WhatsApp itself before sending, this just saves
// typing the same three messages from scratch every time. {vehicle} falls
// back gracefully since fillTemplate() only replaces what's present.
const LEAD_WA_TEMPLATES = [
  {
    key: "acknowledge",
    label: "Acknowledge",
    text: "Hi {customerName}! Thanks for reaching out to Polish Station about your {vehicle} 🚗 We've got your request and will confirm details shortly.",
  },
  {
    key: "quoteFollowUp",
    label: "Quote follow-up",
    text: "Hi {customerName}, following up on the quote for your {vehicle} — LKR {quotedAmount}. Let us know if you'd like to go ahead or have any questions!",
  },
  {
    key: "noResponse",
    label: "No-response nudge",
    text: "Hi {customerName}, just checking in about your {vehicle} detailing request — still interested? Happy to answer any questions or get you booked in.",
  },
] as const;

const LEAD_STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "quoted",
  "converted",
  "lost",
  "duplicate",
  "archived",
];

// Sentinel for "no owner" in the Assigned-to filter's URL value -- distinct
// from any real staffId, same precedent as the Owner/overflow assign
// dropdowns using "" for the same concept in their own local state.
const UNASSIGNED = "__unassigned__";

// All filter state lives in the URL (shareable, survives refresh) rather
// than component state -- the one thing every filter setter does is
// navigate({ search }), never setState. Arrays are TanStack Router's default
// JSON-in-query-string encoding; nothing custom needed.
interface LeadsSearch {
  status?: LeadStatus[];
  service?: string[];
  assignedTo?: string[];
  source?: string;
  type?: LeadType;
  search?: string;
  receivedFrom?: string;
  receivedTo?: string;
  requestedFrom?: string;
  requestedTo?: string;
  showTest?: boolean;
}

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const strs = v.filter((x): x is string => typeof x === "string");
  return strs.length > 0 ? strs : undefined;
}

export const Route = createFileRoute("/_app/leads")({
  head: () => ({ meta: [{ title: "Leads · Polish Station OS" }] }),
  validateSearch: (search: Record<string, unknown>): LeadsSearch => ({
    status: asStringArray(search.status)?.filter((s): s is LeadStatus =>
      LEAD_STATUSES.includes(s as LeadStatus),
    ),
    service: asStringArray(search.service),
    assignedTo: asStringArray(search.assignedTo),
    source: typeof search.source === "string" ? search.source : undefined,
    type: search.type === "contact" || search.type === "booking" ? search.type : undefined,
    search: typeof search.search === "string" ? search.search : undefined,
    receivedFrom: typeof search.receivedFrom === "string" ? search.receivedFrom : undefined,
    receivedTo: typeof search.receivedTo === "string" ? search.receivedTo : undefined,
    requestedFrom: typeof search.requestedFrom === "string" ? search.requestedFrom : undefined,
    requestedTo: typeof search.requestedTo === "string" ? search.requestedTo : undefined,
    showTest: search.showTest === true ? true : undefined,
  }),
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

// "42m" under an hour, "1h 30m" beyond it -- used for the median-first-
// response header tile, where a bare minute count over ~60 stops being
// readable at a glance.
function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
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
// "walk-in" (Invoice) has no dedicated route to link to -- Invoices are
// viewed inline from POS/reports, not as a standalone page.
function convertedToHref(convertedTo: NonNullable<Lead["convertedTo"]>): string | null {
  if (convertedTo.type === "job") return "/jobs";
  if (convertedTo.type === "inspection" || convertedTo.type === "service") return "/bookings";
  return null;
}

function LeadRowActions({
  lead,
  staffList,
  onTransition,
  onConvert,
  onQuote,
  onLost,
  onDuplicate,
  onAssign,
  onArchive,
  fullWidthPrimary,
}: {
  lead: Lead;
  staffList: PublicStaff[];
  onTransition: (status: "contacted" | "new") => void;
  onConvert: () => void;
  onQuote: () => void;
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
    primary = { label: "Mark Quoted", icon: Tag, onClick: onQuote };
  } else if (
    (lead.status === "new" || lead.status === "contacted" || lead.status === "quoted") &&
    can("converted")
  ) {
    primary = { label: "Convert", icon: UserPlus, onClick: onConvert };
  } else if (lead.status === "lost" && can("new")) {
    primary = { label: "Reopen", icon: Undo2, onClick: () => onTransition("new") };
  } else if (lead.status === "archived" && can("new")) {
    primary = { label: "Restore", icon: ArchiveRestore, onClick: () => onTransition("new") };
  }

  const jobOrBookingHref = lead.convertedTo ? convertedToHref(lead.convertedTo) : null;

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
      {lead.status === "converted" &&
        lead.convertedTo &&
        (jobOrBookingHref ? (
          <Link
            to={jobOrBookingHref}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
          >
            {lead.convertedTo.type} {lead.convertedTo.id} <ExternalLink className="h-3 w-3" />
          </Link>
        ) : (
          <span className="text-[11px] text-muted-foreground truncate">
            → {lead.convertedTo.type} {lead.convertedTo.id}
          </span>
        ))}
      {lead.status === "duplicate" && lead.duplicateOf && (
        <span className="text-[11px] text-muted-foreground truncate">
          → merged into {lead.duplicateOf}
        </span>
      )}
      {lead.status === "lost" && lead.lostReason && (
        <span className="text-[11px] text-muted-foreground truncate">
          {LOST_REASON_LABELS[lead.lostReason]}
        </span>
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

// ─── Timeline ───────────────────────────────────────────────────────────────
// Subscribes on demand (not part of the store's always-on collections --
// there's no reason to eagerly load every lead's history before its panel is
// even opened). See LeadEvent in db.ts for why this reads leadEvents rather
// than the app-wide audit log.
function useLeadEvents(leadId: string | null): LeadEvent[] {
  const [events, setEvents] = useState<LeadEvent[]>([]);
  useEffect(() => {
    if (!leadId) {
      setEvents([]);
      return;
    }
    const q = query(
      collection(db, "leadEvents"),
      where("leadId", "==", leadId),
      orderBy("at", "desc"),
    );
    return onSnapshot(
      q,
      (snap) => setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as LeadEvent)),
      () => setEvents([]),
    );
  }, [leadId]);
  return events;
}

function eventSummary(event: LeadEvent): string {
  if (event.type === "note") return event.note ?? "";
  const from = event.fromStatus ?? "new";
  return `${from} → ${event.toStatus}${event.note ? ` · ${event.note}` : ""}`;
}

function Timeline({ leadId }: { leadId: string }) {
  const events = useLeadEvents(leadId);
  if (events.length === 0) {
    return <p className="text-xs text-muted-foreground">No activity yet.</p>;
  }
  return (
    <ol className="space-y-3">
      {events.map((e) => (
        <li key={e.id} className="flex gap-2 text-xs">
          <History className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="text-foreground">{eventSummary(e)}</div>
            <div className="text-muted-foreground">
              {e.actorName} · {formatDateTime(e.at)}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

// ─── Editable field set ─────────────────────────────────────────────────────
function EditableFields({
  lead,
  onSave,
  onCancel,
}: {
  lead: Lead;
  onSave: (fields: Partial<Lead>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(lead.name);
  const [email, setEmail] = useState(lead.email ?? "");
  const [phone, setPhone] = useState(lead.phone ?? "");
  const [make, setMake] = useState(lead.vehicleMake ?? "");
  const [model, setModel] = useState(lead.vehicleModel ?? "");
  const [year, setYear] = useState(lead.vehicleYear ? String(lead.vehicleYear) : "");
  const [bodyType, setBodyType] = useState<VehicleBodyType | "">(lead.vehicleBodyType ?? "");

  function handleSave() {
    onSave({
      name: name.trim() || lead.name,
      ...(email.trim() ? { email: email.trim() } : {}),
      ...(phone.trim() ? { phone: phone.trim() } : {}),
      ...(make.trim() ? { vehicleMake: make.trim() } : {}),
      ...(model.trim() ? { vehicleModel: model.trim() } : {}),
      ...(year.trim() ? { vehicleYear: Number(year) } : {}),
      ...(bodyType ? { vehicleBodyType: bodyType } : {}),
    });
  }

  const inputClass =
    "w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2 space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Name</label>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Email</label>
          <input className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Phone</label>
          <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Make</label>
          <input className={inputClass} value={make} onChange={(e) => setMake(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Model</label>
          <input className={inputClass} value={model} onChange={(e) => setModel(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Year</label>
          <input
            type="number"
            className={inputClass}
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Body type</label>
          <select
            className={inputClass}
            value={bodyType}
            onChange={(e) => setBodyType(e.target.value as VehicleBodyType)}
          >
            <option value="">—</option>
            {VEHICLE_BODY_TYPES.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className={BUTTON}>
          Cancel
        </button>
        <button onClick={handleSave} className={PRIMARY_BUTTON}>
          <Save className="h-3.5 w-3.5" /> Save
        </button>
      </div>
    </div>
  );
}

// ─── Detail panel ───────────────────────────────────────────────────────────
function LeadDetailPanel({
  lead,
  staffList,
  services,
  onOpenChange,
  onNavigate,
  actions,
}: {
  lead: Lead | null;
  staffList: PublicStaff[];
  services: Service[];
  onOpenChange: (v: boolean) => void;
  onNavigate: (direction: "prev" | "next") => void;
  actions: {
    onTransition: (lead: Lead, status: "contacted" | "new") => void;
    onConvert: (lead: Lead) => void;
    onQuote: (lead: Lead) => void;
    onLost: (lead: Lead) => void;
    onDuplicate: (lead: Lead) => void;
    onAssign: (lead: Lead, staffId: string | null) => void;
    onArchive: (lead: Lead) => void;
    onSaveFields: (lead: Lead, fields: Partial<Lead>) => void;
    onAddNote: (lead: Lead, text: string) => void;
  };
}) {
  const owner = lead ? staffList.find((s) => s.id === lead.assignedTo) : undefined;
  const [editing, setEditing] = useState(false);
  const [noteText, setNoteText] = useState("");

  useEffect(() => {
    setEditing(false);
    setNoteText("");
  }, [lead?.id]);

  // J/K move between leads without closing, per the Phase 5 spec -- ignored
  // while typing anywhere (edit fields, the add-note box) so a "j" or "k"
  // keystroke there types the letter instead of navigating away.
  useEffect(() => {
    if (!lead) return;
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if (typing) return;
      if (e.key === "j" || e.key === "J") onNavigate("next");
      else if (e.key === "k" || e.key === "K") onNavigate("prev");
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lead, onNavigate]);

  const waPhone = lead?.phone;
  const templateVars = lead
    ? {
        customerName: lead.name,
        vehicle: vehicleLabel(lead) === "—" ? "vehicle" : vehicleLabel(lead),
        quotedAmount: lead.quotedAmount !== undefined ? formatCurrency(lead.quotedAmount) : "",
      }
    : { customerName: "", vehicle: "", quotedAmount: "" };

  return (
    <Sheet open={lead !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md flex flex-col overflow-y-auto">
        {lead && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 pr-8">
                {lead.name}
                <StatusChip variant={STATUS_TONE[lead.status]}>{lead.status}</StatusChip>
                <button
                  onClick={() => setEditing((v) => !v)}
                  aria-label="Edit lead details"
                  className="ml-auto mr-6 shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </SheetTitle>
              <SheetDescription>
                {TYPE_LABEL[lead.type]} · {sourceLabel(lead.source)} ·{" "}
                {formatDateTime(lead.createdAt)}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-4 flex-1 space-y-4 text-sm">
              {editing ? (
                <EditableFields
                  lead={lead}
                  onCancel={() => setEditing(false)}
                  onSave={(fields) => {
                    actions.onSaveFields(lead, fields);
                    setEditing(false);
                  }}
                />
              ) : (
                <>
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
                          aria-label={`Message ${lead.name} on WhatsApp`}
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
                </>
              )}

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

              {lead.quotedAmount !== undefined && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                    Quote
                  </h4>
                  <div className="flex items-center gap-1.5">
                    <DollarSign className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    {formatCurrency(lead.quotedAmount)}
                    {lead.quoteValidUntil && (
                      <span className="text-muted-foreground">
                        · valid until {displayPreferredDate(lead.quoteValidUntil)}
                      </span>
                    )}
                  </div>
                </div>
              )}

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

              {waPhone && (
                <div>
                  <h4 className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    <MessageSquareText className="h-3.5 w-3.5" /> WhatsApp templates
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {LEAD_WA_TEMPLATES.map((t) => (
                      <a
                        key={t.key}
                        href={buildWALink(waPhone, fillTemplate(t.text, templateVars))}
                        target="_blank"
                        rel="noreferrer"
                        className={BUTTON}
                      >
                        {t.label}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h4 className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <History className="h-3.5 w-3.5" /> Timeline
                </h4>
                <Timeline leadId={lead.id} />
                <div className="mt-2 flex items-center gap-1.5">
                  <input
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && noteText.trim()) {
                        actions.onAddNote(lead, noteText.trim());
                        setNoteText("");
                      }
                    }}
                    placeholder="Add a note…"
                    className="flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    onClick={() => {
                      if (!noteText.trim()) return;
                      actions.onAddNote(lead, noteText.trim());
                      setNoteText("");
                    }}
                    disabled={!noteText.trim()}
                    aria-label="Add note"
                    className="rounded-md border border-input p-2 hover:bg-accent disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>

            <div className="border-t border-border pt-3">
              <LeadRowActions
                lead={lead}
                staffList={staffList}
                onTransition={(status) => actions.onTransition(lead, status)}
                onConvert={() => actions.onConvert(lead)}
                onQuote={() => actions.onQuote(lead)}
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
  const [reason, setReason] = useState<LostReason | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!lead || !reason) return;
    try {
      await markLeadLost(lead, reason);
      toast.success("Lead marked lost");
      setReason(null);
      onOpenChange(false);
    } catch {
      toast.error("Couldn't mark the lead lost, please try again");
    }
  }

  return (
    <Dialog
      open={lead !== null}
      onOpenChange={(v) => {
        if (!v) setReason(null);
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
            <div className="space-y-1.5">
              {LOST_REASONS.map((r) => (
                <label
                  key={r}
                  className="flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm cursor-pointer hover:bg-accent has-[:checked]:border-primary has-[:checked]:bg-primary/10"
                >
                  <input
                    type="radio"
                    name="lost-reason"
                    checked={reason === r}
                    onChange={() => setReason(r)}
                  />
                  {LOST_REASON_LABELS[r]}
                </label>
              ))}
            </div>
          </div>
          <DialogFooter>
            <button
              type="submit"
              disabled={!reason}
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

// ─── Bulk Mark Lost dialog (single reason applied to every selected lead) ──────

function BulkLostDialog({
  open,
  count,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  count: number;
  onOpenChange: (v: boolean) => void;
  onSubmit: (reason: LostReason) => void;
}) {
  const [reason, setReason] = useState<LostReason | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason) return;
    onSubmit(reason);
    setReason(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setReason(null);
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark Lost</DialogTitle>
          <DialogDescription>One reason applied to all {count} selected lead(s).</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            {LOST_REASONS.map((r) => (
              <label
                key={r}
                className="flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm cursor-pointer hover:bg-accent has-[:checked]:border-primary has-[:checked]:bg-primary/10"
              >
                <input
                  type="radio"
                  name="bulk-lost-reason"
                  checked={reason === r}
                  onChange={() => setReason(r)}
                />
                {LOST_REASON_LABELS[r]}
              </label>
            ))}
          </div>
          <DialogFooter>
            <button
              type="submit"
              disabled={!reason}
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

// ─── Mark Quoted dialog (amount + validity) ────────────────────────────────────

function QuoteDialog({
  lead,
  onOpenChange,
  onSubmit,
}: {
  lead: Lead | null;
  onOpenChange: (v: boolean) => void;
  onSubmit: (lead: Lead, amount: number, validUntil: string) => void;
}) {
  const [amount, setAmount] = useState("");
  const [validUntil, setValidUntil] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!lead || !amount.trim()) return;
    onSubmit(lead, Number(amount), validUntil);
    setAmount("");
    setValidUntil("");
    onOpenChange(false);
  }

  return (
    <Dialog
      open={lead !== null}
      onOpenChange={(v) => {
        if (!v) {
          setAmount("");
          setValidUntil("");
        }
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark Quoted</DialogTitle>
          <DialogDescription>{lead?.name}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Amount (LKR) *</label>
            <input
              required
              type="number"
              min="0"
              step="1"
              autoFocus
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Valid until</label>
            <input
              type="date"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
            />
          </div>
          <DialogFooter>
            <button
              type="submit"
              disabled={!amount.trim()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-red hover:bg-primary/90 disabled:opacity-60"
            >
              Mark Quoted
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

  async function handleSubmit() {
    if (!lead || !targetId) return;
    try {
      await markLeadDuplicate(lead, targetId);
      toast.success("Lead marked as duplicate");
      setTargetId(null);
      setSearch("");
      onOpenChange(false);
    } catch {
      toast.error("Couldn't mark the lead as a duplicate, please try again");
    }
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
  onChooseJob,
}: {
  lead: Lead | null;
  onOpenChange: (v: boolean) => void;
  onChooseBooking: (type: BookingType) => void;
  onChooseInvoice: () => void;
  onChooseJob: () => void;
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
          <button
            onClick={onChooseJob}
            className="rounded-md border border-input px-4 py-3 text-left text-sm font-medium hover:bg-accent"
          >
            Create job
            <div className="text-xs font-normal text-muted-foreground">
              Full job intake — scheduling, pricing, and a job card
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
  onQuote,
  onLost,
  onDuplicate,
  onAssign,
  onArchive,
  onOpen,
  services,
  selected,
  onToggleSelect,
}: {
  lead: Lead;
  now: Date;
  staffList: PublicStaff[];
  onTransition: (status: "contacted" | "new") => void;
  onConvert: () => void;
  onQuote: () => void;
  onLost: () => void;
  onDuplicate: () => void;
  onAssign: (staffId: string | null) => void;
  onArchive: () => void;
  onOpen: () => void;
  services: Service[];
  selected: boolean;
  onToggleSelect: () => void;
}) {
  return (
    <div className="p-4" onClick={onOpen}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select ${lead.name}`}
            className="mt-1 h-4 w-4 shrink-0"
          />
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
          onQuote={onQuote}
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
          {Array.from({ length: 9 }).map((_, j) => (
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
  const {
    leads,
    services,
    transitionLeadStatus,
    markLeadLost,
    assignLead,
    markLeadsTest,
    addLeadNote,
    updateLeadFields,
    storeLoading,
    listenerErrors,
  } = useStore();
  const { staffList } = useStaffList();
  const { confirm, ConfirmDialog } = useConfirm();
  const searchParams = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  // Default view (no URL params at all): status = new, per the spec -- once
  // any filter has ever been touched the URL always carries an explicit
  // (possibly empty) status array, so this default only applies on first
  // load / a bare link to the page.
  const statusFilter = searchParams.status ?? ["new"];
  const serviceFilter = searchParams.service ?? [];
  const assignedFilter = searchParams.assignedTo ?? [];
  const sourceFilter = searchParams.source ?? "All";
  const typeFilter = searchParams.type ?? "All";
  const receivedFrom = searchParams.receivedFrom ?? "";
  const receivedTo = searchParams.receivedTo ?? "";
  const requestedFrom = searchParams.requestedFrom ?? "";
  const requestedTo = searchParams.requestedTo ?? "";
  const showTest = searchParams.showTest ?? false;

  // Search alone is debounced locally before it hits the URL -- every other
  // filter is a discrete click, but re-navigating on every keystroke would
  // otherwise thrash history/re-render on each character.
  const [searchInput, setSearchInput] = useState(searchParams.search ?? "");
  useEffect(() => {
    setSearchInput(searchParams.search ?? "");
  }, [searchParams.search]);
  useEffect(() => {
    const id = setTimeout(() => {
      if (searchInput !== (searchParams.search ?? "")) {
        setSearchParam("search", searchInput || undefined);
      }
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  function setSearchParam<K extends keyof LeadsSearch>(key: K, value: LeadsSearch[K]) {
    navigate({ search: (prev) => ({ ...prev, [key]: value }), replace: true });
  }

  function toggleArrayParam(key: "status" | "service" | "assignedTo", value: string) {
    navigate({
      search: (prev) => {
        // Toggling must act on the EFFECTIVE current value, not the raw URL
        // one -- status's implicit default (["new"]) only lives in the
        // component, so without this a first click while on that default
        // would silently drop "new" instead of adding to it.
        const current = (prev[key] as string[] | undefined) ?? (key === "status" ? ["new"] : []);
        const next = current.includes(value)
          ? current.filter((v) => v !== value)
          : [...current, value];
        return { ...prev, [key]: next.length > 0 ? next : undefined };
      },
      replace: true,
    });
  }

  const [newLeadOpen, setNewLeadOpen] = useState(false);
  const [lostLead, setLostLead] = useState<Lead | null>(null);
  const [duplicateLead, setDuplicateLead] = useState<Lead | null>(null);
  const [convertingLead, setConvertingLead] = useState<Lead | null>(null);
  const [quotingLead, setQuotingLead] = useState<Lead | null>(null);
  const [bookingConvert, setBookingConvert] = useState<{
    lead: Lead;
    bookingType: BookingType;
  } | null>(null);
  const [jobConvertLead, setJobConvertLead] = useState<Lead | null>(null);
  const [invoiceLinkLead, setInvoiceLinkLead] = useState<Lead | null>(null);
  const [detailLead, setDetailLead] = useState<Lead | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLostOpen, setBulkLostOpen] = useState(false);

  // Keeps the Waiting column's relative age (and its color escalation) from
  // going stale while the tab stays open.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // isTest-excluded: the base for every count/metric/default view, per
  // Phase 1.4 -- "Show test leads" only ever affects which rows the TABLE
  // itself can show, never what the header tiles or subtitle count.
  const visibleLeads = leads.filter((l) => !l.isTest);
  const filterableLeads = showTest ? leads : visibleLeads;

  // Options for the Service filter: distinct labels actually present on
  // current leads (not the full catalog) -- an option nothing matches isn't
  // useful in a filter.
  const serviceOptions = Array.from(
    new Set(visibleLeads.flatMap((l) => serviceChipLabels(l, services))),
  ).sort();
  const sourceOptions = Array.from(new Set(visibleLeads.map((l) => l.source))).sort();

  const filtered = filterableLeads.filter((l) => {
    const q = searchParams.search?.toLowerCase() ?? "";
    const matchesSearch =
      !q ||
      l.name.toLowerCase().includes(q) ||
      (l.email ?? "").toLowerCase().includes(q) ||
      (l.phone ?? "").includes(q) ||
      (l.vehicle ?? "").toLowerCase().includes(q) ||
      (l.notes ?? "").toLowerCase().includes(q);
    const matchesType = typeFilter === "All" || l.type === typeFilter;
    const matchesStatus = statusFilter.includes(l.status);
    const matchesService =
      serviceFilter.length === 0 ||
      serviceChipLabels(l, services).some((s) => serviceFilter.includes(s));
    const matchesAssigned =
      assignedFilter.length === 0 ||
      (l.assignedTo ? assignedFilter.includes(l.assignedTo) : assignedFilter.includes(UNASSIGNED));
    const matchesSource = sourceFilter === "All" || l.source === sourceFilter;
    const receivedDate = l.createdAt.slice(0, 10);
    const matchesReceived =
      (!receivedFrom || receivedDate >= receivedFrom) &&
      (!receivedTo || receivedDate <= receivedTo);
    const requestedDate =
      l.preferredDate && ISO_DATE_ONLY.test(l.preferredDate) ? l.preferredDate : null;
    const matchesRequested =
      (!requestedFrom && !requestedTo) ||
      (requestedDate !== null &&
        (!requestedFrom || requestedDate >= requestedFrom) &&
        (!requestedTo || requestedDate <= requestedTo));
    return (
      matchesSearch &&
      matchesType &&
      matchesStatus &&
      matchesService &&
      matchesAssigned &&
      matchesSource &&
      matchesReceived &&
      matchesRequested
    );
  });

  const selectedLeads = filtered.filter((l) => selectedIds.has(l.id));

  const hasActiveFilters =
    Boolean(searchParams.search) ||
    typeFilter !== "All" ||
    JSON.stringify(statusFilter) !== JSON.stringify(["new"]) ||
    serviceFilter.length > 0 ||
    assignedFilter.length > 0 ||
    sourceFilter !== "All" ||
    Boolean(receivedFrom || receivedTo || requestedFrom || requestedTo);

  function clearFilters() {
    setSearchInput("");
    navigate({ search: {}, replace: true });
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) =>
      prev.size === filtered.length ? new Set() : new Set(filtered.map((l) => l.id)),
    );
  }

  // Optimistic: the toast fires as soon as the write is accepted locally
  // (Firestore's own cache applies it immediately, before the server round
  // trip), so this reads as instant. If the server later rejects it, the
  // SDK reverts the local doc on its own -- the catch here exists purely to
  // tell the user that happened, since nothing else would.
  async function handleTransition(lead: Lead, status: "contacted" | "new") {
    try {
      await transitionLeadStatus(lead, status);
      toast.success(status === "new" ? "Lead reopened" : "Lead marked contacted");
    } catch {
      toast.error("Couldn't update the lead, please try again");
    }
  }

  async function handleQuote(lead: Lead, quotedAmount: number, quoteValidUntil: string) {
    try {
      await transitionLeadStatus(lead, "quoted", { quotedAmount, quoteValidUntil });
      toast.success("Lead marked quoted");
    } catch {
      toast.error("Couldn't update the lead, please try again");
    }
  }

  async function handleArchive(lead: Lead) {
    if (!(await confirm({ title: "Archive this lead?", description: lead.name }))) return;
    try {
      await transitionLeadStatus(lead, "archived");
      toast.success("Lead archived");
    } catch {
      toast.error("Couldn't archive the lead, please try again");
    }
  }

  async function handleAssign(lead: Lead, staffId: string | null) {
    try {
      await assignLead(lead, staffId);
      toast.success(staffId ? "Lead assigned" : "Lead unassigned");
    } catch {
      toast.error("Couldn't update the assignment, please try again");
    }
  }

  async function handleSaveFields(lead: Lead, fields: Partial<Lead>) {
    try {
      await updateLeadFields(lead, fields);
      toast.success("Lead details updated");
    } catch {
      toast.error("Couldn't save those changes, please try again");
    }
  }

  function handleAddNote(lead: Lead, text: string) {
    addLeadNote(lead, text);
  }

  // J/K in the detail panel move to the next/previous row in the currently
  // filtered table order without closing -- looks up detailLead fresh each
  // call rather than closing over a stale index, since the filtered list can
  // itself change while the panel is open (another tab's edit, a filter
  // tweak).
  function handleNavigateDetail(direction: "prev" | "next") {
    if (!detailLead) return;
    const index = filtered.findIndex((l) => l.id === detailLead.id);
    if (index === -1) return;
    const nextIndex = direction === "next" ? index + 1 : index - 1;
    const nextLead = filtered[nextIndex];
    if (nextLead) setDetailLead(nextLead);
  }

  // ── Bulk actions (selected rows only; Convert is deliberately excluded --
  // conversion needs per-lead judgement, per the Phase 3 spec) ─────────────
  async function handleBulkAssign(staffId: string | null) {
    const results = await Promise.allSettled(
      selectedLeads.map((lead) => assignLead(lead, staffId)),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) {
      toast.error(`${failed} of ${selectedLeads.length} lead(s) couldn't be updated`);
    } else {
      toast.success(`${selectedLeads.length} lead(s) ${staffId ? "assigned" : "unassigned"}`);
    }
    setSelectedIds(new Set());
  }

  async function handleBulkArchive() {
    if (
      !(await confirm({
        title: `Archive ${selectedLeads.length} lead(s)?`,
        description: "Only leads that can legally move to Archived will be changed.",
      }))
    )
      return;
    const eligible = selectedLeads.filter((lead) => isLegalLeadTransition(lead.status, "archived"));
    const results = await Promise.allSettled(
      eligible.map((lead) => transitionLeadStatus(lead, "archived")),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) {
      toast.error(`${failed} of ${eligible.length} lead(s) couldn't be archived`);
    } else {
      toast.success(`${eligible.length} lead(s) archived`);
    }
    setSelectedIds(new Set());
  }

  async function handleBulkLost(reason: LostReason) {
    const eligible = selectedLeads.filter((lead) => isLegalLeadTransition(lead.status, "lost"));
    const results = await Promise.allSettled(eligible.map((lead) => markLeadLost(lead, reason)));
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) {
      toast.error(`${failed} of ${eligible.length} lead(s) couldn't be marked lost`);
    } else {
      toast.success(`${eligible.length} lead(s) marked lost`);
    }
    setSelectedIds(new Set());
    setBulkLostOpen(false);
  }

  async function handleBulkMarkTest() {
    await markLeadsTest(selectedLeads, true);
    toast.success(`${selectedLeads.length} lead(s) marked as test`);
    setSelectedIds(new Set());
  }

  const newLeads = visibleLeads.filter((l) => l.status === "new");
  const newCount = newLeads.length;
  const oldestNew = newLeads.reduce<Lead | null>(
    (oldest, l) => (!oldest || l.createdAt < oldest.createdAt ? l : oldest),
    null,
  );
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const recentResponseMinutes = visibleLeads
    .filter((l) => l.firstResponseAt && l.firstResponseAt >= sevenDaysAgo)
    .map((l) => l.responseMinutes ?? 0)
    .sort((a, b) => a - b);
  const medianResponseMinutes =
    recentResponseMinutes.length === 0
      ? null
      : recentResponseMinutes.length % 2 === 1
        ? recentResponseMinutes[(recentResponseMinutes.length - 1) / 2]
        : Math.round(
            (recentResponseMinutes[recentResponseMinutes.length / 2 - 1] +
              recentResponseMinutes[recentResponseMinutes.length / 2]) /
              2,
          );

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

        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <button
            onClick={() => setSearchParam("status", ["new"])}
            className="rounded-xl border border-border bg-card p-4 text-left shadow-card hover:border-primary/40"
          >
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Unactioned
            </div>
            <div className="mt-1 text-2xl font-bold">{newCount}</div>
          </button>
          <div className="rounded-xl border border-border bg-card p-4 shadow-card">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Oldest waiting
            </div>
            <div className="mt-1 text-2xl font-bold">
              {oldestNew ? formatRelativeAge(oldestNew.createdAt, now) : "—"}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-card">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Median first response · 7d
            </div>
            <div className="mt-1 text-2xl font-bold">
              {medianResponseMinutes === null ? "—" : formatMinutes(medianResponseMinutes)}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card shadow-card">
          <div className="flex flex-col gap-3 p-4 border-b border-border">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex flex-1 items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm">
                <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                <input
                  className="flex-1 bg-transparent outline-none"
                  placeholder="Search by name, email, phone, vehicle, notes…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
              </div>
              <select
                className="min-h-9 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                value={typeFilter}
                onChange={(e) =>
                  setSearchParam(
                    "type",
                    e.target.value === "All" ? undefined : (e.target.value as LeadType),
                  )
                }
              >
                <option value="All">All Types</option>
                <option value="contact">Contact</option>
                <option value="booking">Booking Request</option>
              </select>
              <select
                className="min-h-9 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                value={sourceFilter}
                onChange={(e) =>
                  setSearchParam("source", e.target.value === "All" ? undefined : e.target.value)
                }
              >
                <option value="All">All Sources</option>
                {sourceOptions.map((s) => (
                  <option key={s} value={s}>
                    {sourceLabel(s)}
                  </option>
                ))}
              </select>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className={BUTTON}>
                    Service{serviceFilter.length > 0 ? ` (${serviceFilter.length})` : ""}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>Service</DropdownMenuLabel>
                  {serviceOptions.map((s) => (
                    <DropdownMenuCheckboxItem
                      key={s}
                      checked={serviceFilter.includes(s)}
                      onSelect={(e) => e.preventDefault()}
                      onCheckedChange={() => toggleArrayParam("service", s)}
                    >
                      {s}
                    </DropdownMenuCheckboxItem>
                  ))}
                  {serviceOptions.length === 0 && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">No services yet</div>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className={BUTTON}>
                    Assigned{assignedFilter.length > 0 ? ` (${assignedFilter.length})` : ""}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>Assigned to</DropdownMenuLabel>
                  <DropdownMenuCheckboxItem
                    checked={assignedFilter.includes(UNASSIGNED)}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={() => toggleArrayParam("assignedTo", UNASSIGNED)}
                  >
                    Unassigned
                  </DropdownMenuCheckboxItem>
                  {staffList.map((s) => (
                    <DropdownMenuCheckboxItem
                      key={s.id}
                      checked={assignedFilter.includes(s.id)}
                      onSelect={(e) => e.preventDefault()}
                      onCheckedChange={() => toggleArrayParam("assignedTo", s.id)}
                    >
                      {s.name}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={showTest}
                  onChange={(e) => setSearchParam("showTest", e.target.checked ? true : undefined)}
                  className="h-4 w-4"
                />
                Show test leads
              </label>
              {hasActiveFilters && (
                <button onClick={clearFilters} className={cn(BUTTON, "text-muted-foreground")}>
                  Clear filters
                </button>
              )}
            </div>

            <ToggleGroup
              type="multiple"
              value={statusFilter}
              onValueChange={(next: string[]) =>
                setSearchParam("status", next.length > 0 ? (next as LeadStatus[]) : undefined)
              }
              className="flex-wrap justify-start"
            >
              {LEAD_STATUSES.map((s) => (
                <ToggleGroupItem
                  key={s}
                  value={s}
                  aria-label={`Filter by ${s}`}
                  className="rounded-full border border-input px-3 py-1 text-xs font-medium capitalize data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
                >
                  {s} · {visibleLeads.filter((l) => l.status === s).length}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>

            <div className="flex flex-wrap items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Received</span>
                <input
                  type="date"
                  value={receivedFrom}
                  onChange={(e) => setSearchParam("receivedFrom", e.target.value || undefined)}
                  className="rounded-md border border-input bg-background px-2 py-1"
                />
                <span className="text-muted-foreground">–</span>
                <input
                  type="date"
                  value={receivedTo}
                  onChange={(e) => setSearchParam("receivedTo", e.target.value || undefined)}
                  className="rounded-md border border-input bg-background px-2 py-1"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Requested</span>
                <input
                  type="date"
                  value={requestedFrom}
                  onChange={(e) => setSearchParam("requestedFrom", e.target.value || undefined)}
                  className="rounded-md border border-input bg-background px-2 py-1"
                />
                <span className="text-muted-foreground">–</span>
                <input
                  type="date"
                  value={requestedTo}
                  onChange={(e) => setSearchParam("requestedTo", e.target.value || undefined)}
                  className="rounded-md border border-input bg-background px-2 py-1"
                />
              </div>
            </div>
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
                    onQuote={() => setQuotingLead(l)}
                    onLost={() => setLostLead(l)}
                    onDuplicate={() => setDuplicateLead(l)}
                    onAssign={(staffId) => handleAssign(l, staffId)}
                    onArchive={() => handleArchive(l)}
                    onOpen={() => setDetailLead(l)}
                    selected={selectedIds.has(l.id)}
                    onToggleSelect={() => toggleSelect(l.id)}
                  />
                ))}
                {filtered.length === 0 && (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    {filterableLeads.length === 0 ? (
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
                  <th className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && selectedIds.size === filtered.length}
                      onChange={toggleSelectAll}
                      aria-label="Select all leads"
                      className="h-4 w-4"
                    />
                  </th>
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
                        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(l.id)}
                            onChange={() => toggleSelect(l.id)}
                            aria-label={`Select ${l.name}`}
                            className="h-4 w-4"
                          />
                        </td>
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
                            onQuote={() => setQuotingLead(l)}
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
                        <td colSpan={9} className="text-center py-10 text-muted-foreground">
                          {filterableLeads.length === 0 ? (
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

        {selectedIds.size > 0 && (
          <div className="fixed inset-x-0 bottom-4 z-20 mx-auto flex w-fit max-w-[calc(100%-2rem)] flex-wrap items-center gap-2 rounded-xl border border-border bg-charcoal px-4 py-3 text-charcoal-foreground shadow-elevated">
            <span className="text-sm font-semibold">{selectedIds.size} selected</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={BUTTON}>Assign</button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuRadioGroup value="" onValueChange={(v) => handleBulkAssign(v || null)}>
                  <DropdownMenuRadioItem value="">Unassigned</DropdownMenuRadioItem>
                  {staffList.map((s) => (
                    <DropdownMenuRadioItem key={s.id} value={s.id}>
                      {s.name}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <button onClick={() => setBulkLostOpen(true)} className={BUTTON}>
              Mark Lost
            </button>
            <button onClick={handleBulkArchive} className={BUTTON}>
              Archive
            </button>
            <button onClick={handleBulkMarkTest} className={BUTTON}>
              Mark as Test
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-xs font-medium text-charcoal-foreground/70 hover:text-charcoal-foreground"
            >
              Clear
            </button>
          </div>
        )}

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
          onChooseJob={() => {
            if (!convertingLead) return;
            setJobConvertLead(convertingLead);
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
        <JobSheet
          open={jobConvertLead !== null}
          onOpenChange={(v) => !v && setJobConvertLead(null)}
          convertLead={jobConvertLead ? { lead: jobConvertLead } : undefined}
        />
        <QuoteDialog
          lead={quotingLead}
          onOpenChange={(v) => !v && setQuotingLead(null)}
          onSubmit={handleQuote}
        />
        <BulkLostDialog
          open={bulkLostOpen}
          count={selectedLeads.length}
          onOpenChange={setBulkLostOpen}
          onSubmit={handleBulkLost}
        />
        <LeadDetailPanel
          lead={detailLead}
          staffList={staffList}
          services={services}
          onOpenChange={(v) => !v && setDetailLead(null)}
          onNavigate={handleNavigateDetail}
          actions={{
            onTransition: handleTransition,
            onConvert: (lead) => {
              setDetailLead(null);
              setConvertingLead(lead);
            },
            onQuote: (lead) => {
              setDetailLead(null);
              setQuotingLead(lead);
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
            onSaveFields: handleSaveFields,
            onAddNote: handleAddNote,
          }}
        />
      </div>
    </TooltipProvider>
  );
}
