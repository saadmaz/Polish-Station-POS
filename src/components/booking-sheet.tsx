import { useRef, useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { todayBusinessDate } from "@/lib/business-day";
import { computeRequiredDeposit } from "@/lib/booking-rules";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Search, Loader2, CheckCircle2, AlertCircle, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/currency";

interface BookingSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const today = todayBusinessDate();
const HOURS = Array.from({ length: 20 }, (_, i) => {
  const h = 8 + Math.floor(i / 2);
  const m = i % 2 === 0 ? "00" : "30";
  return `${String(h).padStart(2, "0")}:${m}`;
});

const EMPTY = {
  name: "",
  phone: "",
  plate: "",
  vehicleModel: "",
  vehicleColor: "",
  serviceId: "",
  date: today,
  time: "09:00",
  tech: "",
  bay: "",
  notes: "",
};

// ─── REGO / VIN lookup ────────────────────────────────────────────────────────

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

// ─── Component ────────────────────────────────────────────────────────────────

export function BookingSheet({ open, onOpenChange }: BookingSheetProps) {
  const { services, customers, addBooking, bays, bookingRules } = useStore();
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  // Set only after the server rejects a submission for being outside policy
  // (lead time / max advance) -- staff can retype the same details with a
  // reason and resubmit rather than the sheet just failing silently.
  const [rejection, setRejection] = useState<"outside_lead_time" | "outside_advance_window" | null>(
    null,
  );
  const [overrideReason, setOverrideReason] = useState("");

  // Plate lookup state
  const [lookupState, setLookupState] = useState<
    "idle" | "loading" | "found" | "not-found" | "error"
  >("idle");
  const [lookupSuggestion, setLookupSuggestion] = useState<{
    name?: string;
    phone?: string;
    vehicleModel?: string;
    vehicleColor?: string;
  } | null>(null);
  const lookupRef = useRef<AbortController | null>(null);

  function set<K extends keyof typeof EMPTY>(field: K, value: (typeof EMPTY)[K]) {
    // A rejection (and its override reason) is tied to the exact date/time/
    // service that was rejected -- changing any of them makes it stale.
    if (field === "date" || field === "time" || field === "serviceId") {
      setRejection(null);
      setOverrideReason("");
    }
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
        plate: match.vehicles[0]?.plate ?? f.plate,
        vehicleModel: match.vehicles[0]?.model ?? f.vehicleModel,
        vehicleColor: match.vehicles[0]?.color ?? f.vehicleColor,
      }));
      setLookupState("idle");
      setLookupSuggestion(null);
    }
  }

  // Auto-lookup when plate changes: check internal customer records first
  function handlePlateChange(value: string) {
    const upper = value.toUpperCase();
    set("plate", upper);
    setLookupState("idle");
    setLookupSuggestion(null);

    if (!upper || upper.length < 4) return;

    // Internal lookup: find any customer with this plate
    for (const c of customers) {
      const match = c.vehicles.find(
        (v) => v.plate.replace(/\s/g, "").toUpperCase() === upper.replace(/\s/g, ""),
      );
      if (match) {
        setLookupState("found");
        setLookupSuggestion({
          name: c.name,
          phone: c.phone,
          vehicleModel: match.model,
          vehicleColor: match.color,
        });
        return;
      }
    }
  }

  // Explicit VIN decode (NHTSA), triggered by button
  async function handleVINLookup() {
    const plate = form.plate.replace(/\s/g, "");
    if (!VIN_RE.test(plate)) {
      toast.error("Enter a valid 17-character VIN to decode");
      return;
    }
    lookupRef.current?.abort();
    setLookupState("loading");
    setLookupSuggestion(null);
    const result = await decodeVIN(plate);
    if (result) {
      setLookupState("found");
      setLookupSuggestion({ vehicleModel: result });
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
      vehicleModel: lookupSuggestion.vehicleModel ?? f.vehicleModel,
      vehicleColor: lookupSuggestion.vehicleColor ?? f.vehicleColor,
    }));
    setLookupState("idle");
    setLookupSuggestion(null);
  }

  function handleServiceChange(serviceId: string) {
    set("serviceId", serviceId);
  }

  const REJECTION_LABEL: Record<"outside_lead_time" | "outside_advance_window", string> = {
    outside_lead_time:
      "This time is inside the minimum lead-time window (Settings → Booking Rules).",
    outside_advance_window:
      "This date is beyond the maximum advance-booking window (Settings → Booking Rules).",
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.serviceId || !form.date || !form.time) return;
    const svc = services.find((s) => s.id === form.serviceId);
    if (!svc) return;

    const customer = customers.find(
      (c) =>
        c.phone.replace(/\s/g, "") === form.phone.replace(/\s/g, "") ||
        c.name.toLowerCase() === form.name.toLowerCase(),
    );

    setSubmitting(true);
    const result = await addBooking({
      customerId: customer?.id ?? null,
      customerName: form.name.trim(),
      phone: form.phone.trim(),
      plate: form.plate.trim().toUpperCase(),
      vehicleModel: form.vehicleModel.trim(),
      serviceId: svc.id,
      date: form.date,
      time: form.time,
      // Unlike bay (below), tech has no fallback-routing logic anywhere that
      // depends on this exact sentinel -- store the real value (possibly
      // empty) and let the UI decide how to display "no tech assigned"
      // (audit B7: baking "—" into stored data, vs. a blank cell elsewhere
      // for the same "no value" condition, made neither displayed dash
      // trustworthy).
      tech: form.tech,
      bay: form.bay || "—",
      notes: form.notes,
      ...(rejection && overrideReason.trim() ? { overrideReason: overrideReason.trim() } : {}),
    });
    setSubmitting(false);

    if (!result.success) {
      if (result.error === "outside_lead_time" || result.error === "outside_advance_window") {
        setRejection(result.error);
        return;
      }
      toast.error(
        result.error === "unauthorized"
          ? "You don't have permission to create bookings."
          : "Couldn't find that service. Please pick it again.",
      );
      return;
    }

    const deposit = result.booking.depositAmount;
    const depositNote = deposit ? ` · Deposit ${formatCurrency(deposit)} required` : "";

    toast.success("Booking confirmed", {
      description: `${form.name}: ${svc.name} on ${form.date} at ${form.time}${depositNote}`,
    });
    setForm(EMPTY);
    setRejection(null);
    setOverrideReason("");
    setLookupState("idle");
    setLookupSuggestion(null);
    onOpenChange(false);
  }

  const selectedService = services.find((s) => s.id === form.serviceId);
  const isVIN = VIN_RE.test(form.plate.replace(/\s/g, ""));
  const previewDeposit = selectedService
    ? computeRequiredDeposit(selectedService.price, bookingRules)
    : 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md flex flex-col overflow-y-auto">
        <SheetHeader>
          <SheetTitle>New Booking</SheetTitle>
          <SheetDescription>Schedule an appointment for a customer.</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 gap-4 py-4">
          {/* Phone: auto-fills customer */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Phone</label>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="+94 71 000 0000"
              value={form.phone}
              onChange={(e) => handlePhone(e.target.value)}
            />
          </div>

          {/* Customer name */}
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

          {/* Plate + Vehicle lookup */}
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

            {/* Lookup suggestion banner */}
            {lookupState === "found" && lookupSuggestion && (
              <div className="flex items-start justify-between gap-2 rounded-md bg-success/10 border border-success/30 px-3 py-2">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success mt-0.5 shrink-0" />
                  <div className="text-xs text-success">
                    {lookupSuggestion.name && (
                      <div className="font-semibold">{lookupSuggestion.name}</div>
                    )}
                    {lookupSuggestion.vehicleModel && (
                      <div>
                        {lookupSuggestion.vehicleModel}
                        {lookupSuggestion.vehicleColor ? ` · ${lookupSuggestion.vehicleColor}` : ""}
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

          {/* Vehicle model + color */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Vehicle</label>
              <input
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Toyota Aqua"
                value={form.vehicleModel}
                onChange={(e) => set("vehicleModel", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Colour</label>
              <input
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Pearl White"
                value={form.vehicleColor}
                onChange={(e) => set("vehicleColor", e.target.value)}
              />
            </div>
          </div>

          {/* Service */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Service *</label>
            <select
              required
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={form.serviceId}
              onChange={(e) => handleServiceChange(e.target.value)}
            >
              <option value="">Select a service…</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {formatCurrency(s.price)} ({s.durationMin}m)
                </option>
              ))}
            </select>
          </div>

          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Date *</label>
              <input
                required
                type="date"
                min={today}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.date}
                onChange={(e) => set("date", e.target.value)}
              />
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

          {/* Technician + Bay */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Technician</label>
              <input
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="TBA"
                value={form.tech}
                onChange={(e) => set("tech", e.target.value)}
              />
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
          </div>

          {/* Deposit -- computed from Settings → Booking Rules, not staff-entered */}
          {previewDeposit > 0 && (
            <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
              <div className="font-medium text-warning">
                Deposit required: {formatCurrency(previewDeposit)}
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                Per policy (Settings → Booking Rules). Balance due at pickup:{" "}
                {formatCurrency((selectedService?.price ?? 0) - previewDeposit)}
              </div>
            </div>
          )}

          {/* Lead-time/max-advance rejection: same submit, plus a mandatory reason */}
          {rejection && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 space-y-2">
              <div className="flex items-start gap-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{REJECTION_LABEL[rejection]}</span>
              </div>
              <label className="text-xs font-medium text-muted-foreground">
                Reason to book anyway *
              </label>
              <input
                required
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="e.g. Customer confirmed by phone, manager approved"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
              />
            </div>
          )}

          {/* Notes */}
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
              disabled={submitting || (rejection !== null && !overrideReason.trim())}
              className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-red hover:bg-primary/90 disabled:opacity-60"
            >
              {submitting ? "Confirming…" : rejection ? "Book Anyway" : "Confirm Booking"}
            </button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
