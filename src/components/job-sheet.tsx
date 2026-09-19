// Create/edit form for job intake — modeled directly on booking-sheet.tsx
// (same plate/VIN lookup, same phone-autofill, same ad hoc validation style,
// no schema library). Two things it adds that no create form in this app has
// needed before: a body type (drives which SVG diagram a later inspection
// phase loads) and a supervisor/technician picker sourced from
// useStaffList — Booking's `tech` field is still free text, this is the
// first form to actually resolve a real staffId.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { todayBusinessDate } from "@/lib/business-day";
import { useStaffList } from "@/lib/use-staff-list";
import { parseVehicleDescription } from "@/lib/vehicle";
import { formatDate } from "@/lib/date-format";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Search, Loader2, CheckCircle2, AlertCircle, Calendar, Plus, X } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import type { Job } from "@/lib/job";
import type { Lead, Service } from "@/lib/db";
import { reconcileServiceIds } from "@/lib/lead";

// Local Y-M-D, not d.toISOString().slice(0, 10): that converts to UTC first,
// which silently rolls the date back by one for any positive-UTC-offset
// timezone (including Sri Lanka, where this business operates) — same fix,
// same pitfall, as _app.leads.tsx's own copy for its date picker.
function toLocalYMD(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface JobSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // When set, the sheet edits this job instead of creating a new one.
  editing?: Job;
  // When set, submitting creates the job via convertLeadToJob (Customer
  // find/create + Job + lead status, atomically) instead of plain addJob --
  // mirrors booking-sheet.tsx's convertLead. Mutually exclusive with
  // `editing`: a lead conversion always creates a brand-new job.
  convertLead?: { lead: Lead };
  // Fired once a brand-new job is created (either path — plain addJob or
  // convertLead), after the sheet has already closed itself. Not called for
  // `editing`. Lets a caller (e.g. the inspection picker) chain straight
  // into the next step with the real, saved Job rather than guessing at it
  // from form state.
  onCreated?: (job: Job) => void;
}

const BODY_TYPES = [
  { value: "sedan", label: "Sedan" },
  { value: "hatchback", label: "Hatchback" },
  { value: "suv", label: "SUV" },
  { value: "double_cab", label: "Double Cab" },
  { value: "van", label: "Van" },
  { value: "coupe", label: "Coupe" },
] as const;

const today = todayBusinessDate();
const HOURS = Array.from({ length: 20 }, (_, i) => {
  const h = 8 + Math.floor(i / 2);
  const m = i % 2 === 0 ? "00" : "30";
  return `${String(h).padStart(2, "0")}:${m}`;
});

const EMPTY = {
  name: "",
  phone: "",
  email: "",
  address: "",
  plate: "",
  vehicleDescription: "",
  vehicleColour: "",
  bodyType: "sedan" as (typeof BODY_TYPES)[number]["value"],
  mileage: "",
  vin: "",
  services: [{ name: "", price: 0 }] as { name: string; price: number }[],
  date: today,
  time: "09:00",
  bay: "",
  supervisorId: "",
  technicianIds: [] as string[],
  notes: "",
};

// ─── REGO / VIN lookup (copied verbatim from booking-sheet.tsx) ───────────────

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/i;

async function decodeVIN(vin: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${encodeURIComponent(vin)}?format=json`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    const get = (label: string): string =>
      (data.Results as Array<{ Variable: string; Value: string | null }>)?.find(
        (r) => r.Variable === label,
      )?.Value ?? "";
    const year = get("Model Year");
    const make = get("Make");
    const model = get("Model");
    if (!make || !model) return null;
    return [year, make, model].filter(Boolean).join(" ");
  } catch {
    return null;
  }
}

// ─── Multi-service intake ───────────────────────────────────────────────────
// A job doesn't always map to one catalog service -- an inspection referral,
// a custom request, or several distinct jobs done in one visit all need a
// typed name and its own price rather than being forced to pick a single
// fixed-catalog item. Job's flat serviceId/serviceName/category/durationMin/
// price fields still get derived from this list on every save (same
// best-effort catalog-match-for-category, fallback-to-Exterior, sum-the-rest
// convention src/lib/job-linking.ts's matchServiceInfo already uses for POS
// walk-in sales) so every existing reader of those fields keeps working
// unchanged; the real itemized list lives in the new `services` array.
const FALLBACK_CATEGORY: Service["category"] = "Exterior";

function deriveServiceFields(
  rows: { name: string; price: number }[],
  catalog: Service[],
): Pick<Job, "services" | "serviceId" | "serviceName" | "category" | "durationMin" | "price"> {
  const cleaned = rows.map((r) => ({ name: r.name.trim(), price: r.price })).filter((r) => r.name);
  const first = cleaned[0];
  const matchedFirst = first ? catalog.find((s) => s.name === first.name) : undefined;
  const durationMin = cleaned.reduce(
    (sum, r) => sum + (catalog.find((s) => s.name === r.name)?.durationMin ?? 0),
    0,
  );
  return {
    services: cleaned,
    serviceId: matchedFirst?.id ?? "",
    serviceName:
      cleaned.length > 1 ? `${first.name} +${cleaned.length - 1} more` : (first?.name ?? ""),
    category: matchedFirst?.category ?? FALLBACK_CATEGORY,
    durationMin,
    price: cleaned.reduce((sum, r) => sum + r.price, 0),
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function JobSheet({ open, onOpenChange, editing, convertLead, onCreated }: JobSheetProps) {
  const { services, customers, bays, addJob, updateJobAsync, convertLeadToJob } = useStore();
  const { staffList } = useStaffList();
  const [form, setForm] = useState(EMPTY);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [lookupState, setLookupState] = useState<
    "idle" | "loading" | "found" | "not-found" | "error"
  >("idle");
  const [lookupSuggestion, setLookupSuggestion] = useState<{
    name?: string;
    phone?: string;
    vehicleDescription?: string;
    vehicleColour?: string;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        name: editing.customerSnapshot?.name ?? editing.customerName,
        phone: editing.customerSnapshot?.phone ?? "",
        email: editing.customerSnapshot?.email ?? "",
        address: editing.customerSnapshot?.address ?? "",
        plate: editing.vehicle?.plate ?? "",
        vehicleDescription: [editing.vehicle?.make, editing.vehicle?.model]
          .filter(Boolean)
          .join(" "),
        vehicleColour: editing.vehicle?.colour ?? "",
        bodyType: editing.vehicle?.bodyType ?? "sedan",
        mileage: editing.vehicle?.mileage != null ? String(editing.vehicle.mileage) : "",
        vin: editing.vehicle?.vin ?? "",
        // Older jobs (created before per-line services existed) fall back to
        // a single row rebuilt from the flat serviceName/price they already
        // have, so editing one doesn't silently lose its price.
        services:
          editing.services && editing.services.length > 0
            ? editing.services
            : [{ name: editing.serviceName, price: editing.price }],
        date: editing.date,
        time: editing.time,
        bay: editing.bay,
        supervisorId: editing.schedule?.supervisorId ?? "",
        technicianIds: editing.schedule?.technicianIds ?? [],
        notes: editing.notes,
      });
    } else if (convertLead) {
      const lead = convertLead.lead;
      // Only prefill serviceId when the lead's service resolves to a real
      // catalog id -- website-sourced leads carry the site's own label
      // strings (e.g. "Paint Correction"), which never match a services doc
      // id, so those are left for staff to pick manually instead of
      // silently mis-selecting the wrong service.
      const [firstServiceId] = reconcileServiceIds(lead);
      const matchedService = services.find((s) => s.id === firstServiceId);
      setForm({
        ...EMPTY,
        name: lead.name,
        phone: lead.phone ?? "",
        vehicleDescription: lead.vehicle ?? "",
        services: [{ name: matchedService?.name ?? "", price: matchedService?.price ?? 0 }],
        notes: lead.notes ?? "",
      });
    } else {
      setForm(EMPTY);
    }
    setLookupState("idle");
    setLookupSuggestion(null);
  }, [open, editing, convertLead, services]);

  function set<K extends keyof typeof EMPTY>(field: K, value: (typeof EMPTY)[K]) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handlePhone(value: string) {
    set("phone", value);
    const match = customers.find((c) => c.phone.replace(/\s/g, "") === value.replace(/\s/g, ""));
    if (match) {
      setForm((f) => ({
        ...f,
        phone: value,
        name: match.name,
        email: match.email || f.email,
        plate: match.vehicles[0]?.plate ?? f.plate,
        vehicleDescription: match.vehicles[0]?.model ?? f.vehicleDescription,
        vehicleColour: match.vehicles[0]?.color ?? f.vehicleColour,
      }));
      setLookupState("idle");
      setLookupSuggestion(null);
    }
  }

  function handlePlateChange(value: string) {
    const upper = value.toUpperCase();
    set("plate", upper);
    setLookupState("idle");
    setLookupSuggestion(null);
    if (!upper || upper.length < 4) return;

    for (const c of customers) {
      const match = c.vehicles.find(
        (v) => v.plate.replace(/\s/g, "").toUpperCase() === upper.replace(/\s/g, ""),
      );
      if (match) {
        setLookupState("found");
        setLookupSuggestion({
          name: c.name,
          phone: c.phone,
          vehicleDescription: match.model,
          vehicleColour: match.color,
        });
        return;
      }
    }
  }

  async function handleVINLookup() {
    const plate = form.plate.replace(/\s/g, "");
    if (!VIN_RE.test(plate)) {
      toast.error("Enter a valid 17-character VIN to decode");
      return;
    }
    setLookupState("loading");
    setLookupSuggestion(null);
    const result = await decodeVIN(plate);
    if (result) {
      setLookupState("found");
      setLookupSuggestion({ vehicleDescription: result });
      set("vin", plate);
    } else {
      setLookupState("not-found");
    }
  }

  function applySuggestion() {
    if (!lookupSuggestion) return;
    setForm((f) => ({
      ...f,
      name: lookupSuggestion.name ?? f.name,
      phone: lookupSuggestion.phone ?? f.phone,
      vehicleDescription: lookupSuggestion.vehicleDescription ?? f.vehicleDescription,
      vehicleColour: lookupSuggestion.vehicleColour ?? f.vehicleColour,
    }));
    setLookupState("idle");
    setLookupSuggestion(null);
  }

  function updateServiceRow(index: number, patch: Partial<{ name: string; price: number }>) {
    setForm((f) => ({
      ...f,
      services: f.services.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));
  }

  // Picking a catalog entry just prefills that row's name/price -- both stay
  // freely editable afterward, since the whole point is not forcing an exact
  // catalog match.
  function quickFillFromCatalog(index: number, serviceId: string) {
    const svc = services.find((s) => s.id === serviceId);
    if (svc) updateServiceRow(index, { name: svc.name, price: svc.price });
  }

  function addServiceRow() {
    setForm((f) => ({ ...f, services: [...f.services, { name: "", price: 0 }] }));
  }

  function removeServiceRow(index: number) {
    setForm((f) => ({ ...f, services: f.services.filter((_, i) => i !== index) }));
  }

  function toggleTechnician(staffId: string) {
    setForm((f) => ({
      ...f,
      technicianIds: f.technicianIds.includes(staffId)
        ? f.technicianIds.filter((id) => id !== staffId)
        : [...f.technicianIds, staffId],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const hasService = form.services.some((r) => r.name.trim());
    if (!form.name.trim() || !hasService || !form.date || !form.time) return;
    const derived = deriveServiceFields(form.services, services);

    const customer = customers.find(
      (c) =>
        c.phone.replace(/\s/g, "") === form.phone.replace(/\s/g, "") ||
        c.name.toLowerCase() === form.name.toLowerCase(),
    );

    const { make, model, year } = parseVehicleDescription(form.vehicleDescription);
    const technicianNames = form.technicianIds
      .map((id) => staffList.find((s) => s.id === id)?.name)
      .filter((n): n is string => !!n);

    const jobData = {
      customerId: customer?.id ?? null,
      customerName: form.name.trim(),
      customerSnapshot: {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        address: form.address.trim(),
      },
      vehicle: {
        plate: form.plate.trim().toUpperCase(),
        make,
        model,
        year,
        colour: form.vehicleColour.trim(),
        bodyType: form.bodyType,
        mileage: form.mileage.trim() ? Number(form.mileage) : null,
        vin: form.vin.trim(),
      },
      ...derived,
      date: form.date,
      time: form.time,
      tech: technicianNames.join(", "),
      bay: form.bay || "—",
      notes: form.notes,
      schedule: {
        supervisorId: form.supervisorId || null,
        technicianIds: form.technicianIds,
      },
    };

    setSubmitting(true);
    try {
      if (editing) {
        // Awaited on purpose (updateJobAsync, not the fire-and-forget
        // updateJob every other caller uses) — this is the one place a
        // rejected write must actually surface as an error instead of
        // showing "Job updated" and closing the sheet regardless.
        await updateJobAsync({
          ...editing,
          ...jobData,
          estimate: editing.estimate ?? { isProvisional: true, quoteVersion: 1 },
        });
        toast.success("Job updated");
      } else if (convertLead) {
        let newJob: Job;
        try {
          newJob = await convertLeadToJob(convertLead.lead, {
            ...jobData,
            estimate: { isProvisional: true, quoteVersion: 1 },
          });
          toast.success("Job created", {
            description: `${form.name}: ${derived.serviceName} on ${form.date} at ${form.time}`,
          });
        } catch (err) {
          const name = err instanceof Error ? err.name : "";
          toast.error(
            name === "LeadAlreadyConvertedError"
              ? "This lead was already converted"
              : "Couldn't create the job, please try again",
          );
          return;
        }
        setForm(EMPTY);
        onOpenChange(false);
        onCreated?.(newJob);
        return;
      } else {
        const newJob = await addJob({
          ...jobData,
          estimate: { isProvisional: true, quoteVersion: 1 },
        });
        toast.success("Job created", {
          description: `${form.name}: ${derived.serviceName} on ${form.date} at ${form.time}`,
        });
        setForm(EMPTY);
        onOpenChange(false);
        onCreated?.(newJob);
        return;
      }
      setForm(EMPTY);
      onOpenChange(false);
    } catch {
      toast.error("Couldn't save the job, please try again");
    } finally {
      setSubmitting(false);
    }
  }

  const isVIN = VIN_RE.test(form.plate.replace(/\s/g, ""));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md flex flex-col overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {editing ? `Edit Job · ${editing.id}` : convertLead ? "Create Job" : "New Job"}
          </SheetTitle>
          <SheetDescription>
            {editing
              ? "Update the job intake details."
              : convertLead
                ? `Converting lead: ${convertLead.lead.name}`
                : "Log a vehicle in for work."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 gap-4 py-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Phone</label>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="+94 71 000 0000"
              value={form.phone}
              onChange={(e) => handlePhone(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Customer Name *</label>
            <input
              required
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="e.g. Marcus Fernando"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Plate / VIN</label>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm uppercase placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="WP CAR-1234 or 17-char VIN"
                value={form.plate}
                onChange={(e) => handlePlateChange(e.target.value)}
              />
              {isVIN && (
                <button
                  type="button"
                  onClick={handleVINLookup}
                  disabled={lookupState === "loading"}
                  className="flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
                  title="Decode VIN via NHTSA"
                >
                  {lookupState === "loading" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Search className="h-3.5 w-3.5" />
                  )}
                  Decode
                </button>
              )}
            </div>

            {lookupState === "found" && lookupSuggestion && (
              <div className="flex items-start justify-between gap-2 rounded-md bg-success/10 border border-success/30 px-3 py-2">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success mt-0.5 shrink-0" />
                  <div className="text-xs text-success">
                    {lookupSuggestion.name && (
                      <div className="font-semibold">{lookupSuggestion.name}</div>
                    )}
                    {lookupSuggestion.vehicleDescription && (
                      <div>
                        {lookupSuggestion.vehicleDescription}
                        {lookupSuggestion.vehicleColour
                          ? ` · ${lookupSuggestion.vehicleColour}`
                          : ""}
                      </div>
                    )}
                    {lookupSuggestion.phone && (
                      <div className="font-mono">{lookupSuggestion.phone}</div>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={applySuggestion}
                  className="shrink-0 rounded-md bg-success/20 text-success px-2 py-1 text-[11px] font-semibold hover:bg-success/30"
                >
                  Apply
                </button>
              </div>
            )}
            {lookupState === "not-found" && (
              <div className="flex items-center gap-2 rounded-md bg-muted border border-border px-3 py-2 text-xs text-muted-foreground">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                No record found for this VIN
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Vehicle</label>
              <input
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Toyota Aqua 2018"
                value={form.vehicleDescription}
                onChange={(e) => set("vehicleDescription", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Colour</label>
              <input
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Pearl White"
                value={form.vehicleColour}
                onChange={(e) => set("vehicleColour", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Body Type</label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.bodyType}
                onChange={(e) => set("bodyType", e.target.value as (typeof EMPTY)["bodyType"])}
              >
                {BODY_TYPES.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Mileage (km)</label>
              <input
                type="number"
                min={0}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="e.g. 84000"
                value={form.mileage}
                onChange={(e) => set("mileage", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Services *</label>
              <span className="font-mono text-xs font-semibold text-muted-foreground">
                Total {formatCurrency(form.services.reduce((sum, r) => sum + (r.price || 0), 0))}
              </span>
            </div>
            <div className="space-y-2">
              {form.services.map((row, i) => (
                <div key={i} className="flex flex-col gap-1.5 sm:flex-row sm:items-start">
                  <div className="flex-1 space-y-1">
                    <input
                      required={i === 0}
                      placeholder="Type a service, or pick from catalog below…"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      value={row.name}
                      onChange={(e) => updateServiceRow(i, { name: e.target.value })}
                    />
                    <select
                      className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      value=""
                      onChange={(e) => e.target.value && quickFillFromCatalog(i, e.target.value)}
                    >
                      <option value="">Quick-fill from catalog…</option>
                      {services.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} · {formatCurrency(s.price)} ({s.durationMin}m)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      placeholder="Price"
                      className="w-32 shrink-0 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring sm:w-28"
                      value={row.price}
                      onChange={(e) => updateServiceRow(i, { price: Number(e.target.value) })}
                    />
                    <button
                      type="button"
                      onClick={() => removeServiceRow(i)}
                      disabled={form.services.length === 1}
                      aria-label="Remove service"
                      className="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-primary disabled:opacity-30 sm:mt-1"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addServiceRow}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> Add another service
            </button>
            <p className="text-[11px] text-muted-foreground">
              Printed on the job card as provisional until confirmed.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Date *</label>
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
                    {form.date ? (
                      formatDate(form.date)
                    ) : (
                      <span className="text-muted-foreground">Pick a date</span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  // z-[60], not the default z-50 shared with Dialog — this
                  // picker always opens from inside this Sheet, and Radix
                  // ties equal z-index to DOM order, which resolves in the
                  // Sheet's favor otherwise (same fix as leads.tsx's own
                  // date popover).
                  className="z-[60] w-auto p-0"
                  align="start"
                >
                  <CalendarPicker
                    mode="single"
                    selected={form.date ? new Date(`${form.date}T00:00:00`) : undefined}
                    disabled={{ before: new Date(`${today}T00:00:00`) }}
                    onSelect={(d) => {
                      if (d) set("date", toLocalYMD(d));
                      setDatePickerOpen(false);
                    }}
                    autoFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Time *</label>
              <select
                required
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.time}
                onChange={(e) => set("time", e.target.value)}
              >
                {HOURS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Bay</label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={form.bay}
              onChange={(e) => set("bay", e.target.value)}
            >
              <option value="">TBA</option>
              {bays.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Assigned Supervisor</label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={form.supervisorId}
              onChange={(e) => set("supervisorId", e.target.value)}
            >
              <option value="">Unassigned</option>
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.role})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Assigned Technician(s)</label>
            <div className="max-h-36 overflow-y-auto rounded-md border border-input bg-background p-2 space-y-1">
              {staffList.length === 0 && (
                <p className="px-1 py-1 text-xs text-muted-foreground">No staff on file</p>
              )}
              {staffList.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted cursor-pointer"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input accent-primary"
                    checked={form.technicianIds.includes(s.id)}
                    onChange={() => toggleTechnician(s.id)}
                  />
                  {s.name} <span className="text-xs text-muted-foreground">({s.role})</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Notes</label>
            <textarea
              rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              placeholder="Special instructions…"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>

          <SheetFooter className="mt-auto pt-4">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex-1 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-red hover:bg-primary/90 disabled:opacity-60"
            >
              {submitting ? "Saving…" : editing ? "Save Changes" : "Create Job"}
            </button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
