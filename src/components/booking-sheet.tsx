import { useState } from "react";
import { toast } from "sonner";
import { SERVICES } from "@/lib/mock-data";
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
const EMPTY = { name: "", phone: "", plate: "", serviceId: "", date: today, time: "09:00" };

const HOURS = Array.from({ length: 20 }, (_, i) => {
  const h = 8 + Math.floor(i / 2);
  const m = i % 2 === 0 ? "00" : "30";
  return `${String(h).padStart(2, "0")}:${m}`;
});

export function BookingSheet({ open, onOpenChange }: BookingSheetProps) {
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);

  function set(field: keyof typeof EMPTY, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.serviceId) return;
    setSubmitting(true);
    setTimeout(() => {
      const svc = SERVICES.find((s) => s.id === form.serviceId);
      toast.success("Booking confirmed", {
        description: `${form.name} — ${svc?.name ?? ""} on ${form.date} at ${form.time}.`,
      });
      setForm(EMPTY);
      setSubmitting(false);
      onOpenChange(false);
    }, 600);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle>New Booking</SheetTitle>
          <SheetDescription>Schedule an appointment for a customer.</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 gap-5 py-4">
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
            <label className="text-sm font-medium">Phone</label>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="+94 71 000 0000"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Plate Number</label>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="e.g. WP CAR-1234"
              value={form.plate}
              onChange={(e) => set("plate", e.target.value)}
            />
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
              {SERVICES.map((s) => (
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
