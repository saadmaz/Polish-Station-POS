import { useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";

interface BookingSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const today = new Date().toISOString().slice(0, 10);
const HOURS = Array.from({ length: 20 }, (_, i) => {
  const h = 8 + Math.floor(i / 2);
  const m = i % 2 === 0 ? "00" : "30";
  return `${String(h).padStart(2, "0")}:${m}`;
});

const EMPTY = { name: "", phone: "", plate: "", vehicleModel: "", serviceId: "", date: today, time: "09:00", tech: "", bay: "", notes: "" };

export function BookingSheet({ open, onOpenChange }: BookingSheetProps) {
  const { services, customers, addBooking } = useStore();
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);

  function set(field: keyof typeof EMPTY, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handlePhone(value: string) {
    set("phone", value);
    const match = customers.find((c) => c.phone.replace(/\s/g, "") === value.replace(/\s/g, ""));
    if (match) {
      setForm((f) => ({ ...f, phone: value, name: match.name, plate: match.vehicles[0]?.plate ?? f.plate, vehicleModel: match.vehicles[0]?.model ?? f.vehicleModel }));
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.serviceId || !form.date || !form.time) return;
    const svc = services.find((s) => s.id === form.serviceId);
    if (!svc) return;

    const customer = customers.find(
      (c) => c.phone.replace(/\s/g, "") === form.phone.replace(/\s/g, "") || c.name.toLowerCase() === form.name.toLowerCase(),
    );

    setSubmitting(true);
    addBooking({
      customerId: customer?.id ?? null,
      customerName: form.name.trim(),
      phone: form.phone.trim(),
      plate: form.plate.trim().toUpperCase(),
      vehicleModel: form.vehicleModel.trim(),
      serviceId: svc.id,
      serviceName: svc.name,
      category: svc.category,
      durationMin: svc.durationMin,
      price: svc.price,
      date: form.date,
      time: form.time,
      tech: form.tech || "—",
      bay: form.bay || "—",
      status: "Confirmed",
      notes: form.notes,
    });

    toast.success("Booking confirmed", {
      description: `${form.name} — ${svc.name} on ${form.date} at ${form.time}`,
    });
    setForm(EMPTY);
    setSubmitting(false);
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md flex flex-col overflow-y-auto">
        <SheetHeader>
          <SheetTitle>New Booking</SheetTitle>
          <SheetDescription>Schedule an appointment for a customer.</SheetDescription>
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Plate</label>
              <input
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm uppercase placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="WP CAR-1234"
                value={form.plate}
                onChange={(e) => set("plate", e.target.value.toUpperCase())}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Vehicle</label>
              <input
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Toyota Aqua"
                value={form.vehicleModel}
                onChange={(e) => set("vehicleModel", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Service *</label>
            <select
              required
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={form.serviceId}
              onChange={(e) => set("serviceId", e.target.value)}
            >
              <option value="">Select a service…</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — Rs {s.price.toLocaleString()} ({s.durationMin}m)
                </option>
              ))}
            </select>
          </div>

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
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

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
                {["Bay 1", "Bay 2", "Bay 3", "Bay 4", "Bay 5"].map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
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
              {submitting ? "Confirming…" : "Confirm Booking"}
            </button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
