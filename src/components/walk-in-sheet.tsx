import { useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";

interface WalkInSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EMPTY = { name: "", phone: "", plate: "", vehicleModel: "", serviceId: "", tech: "", bay: "" };

export function WalkInSheet({ open, onOpenChange }: WalkInSheetProps) {
  const { services, customers, openShift, addJob } = useStore();
  const { staff } = useAuth();
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);

  function set(field: keyof typeof EMPTY, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  // Auto-fill customer details when phone matches a known customer
  function handlePhone(value: string) {
    set("phone", value);
    const match = customers.find((c) => c.phone.replace(/\s/g, "") === value.replace(/\s/g, ""));
    if (match) {
      setForm((f) => ({ ...f, phone: value, name: match.name, plate: match.vehicles[0]?.plate ?? f.plate, vehicleModel: match.vehicles[0]?.model ?? f.vehicleModel }));
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.serviceId) return;
    const svc = services.find((s) => s.id === form.serviceId);
    if (!svc) return;

    // Find matching customer id
    const customer = customers.find(
      (c) => c.phone.replace(/\s/g, "") === form.phone.replace(/\s/g, "") || c.name.toLowerCase() === form.name.toLowerCase(),
    );

    setSubmitting(true);
    addJob({
      customerName: form.name.trim(),
      customerId: customer?.id ?? null,
      phone: form.phone.trim(),
      plate: form.plate.trim().toUpperCase(),
      vehicleModel: form.vehicleModel.trim(),
      vehicleColor: "",
      serviceId: svc.id,
      serviceName: svc.name,
      category: svc.category,
      price: svc.price,
      tech: form.tech || staff?.name || "—",
      bay: form.bay || "—",
      status: "Queue",
      estimateMin: svc.durationMin,
      sessionId: openShift?.id ?? null,
      notes: "",
    });

    toast.success("Walk-in added to queue", {
      description: `${form.name} — ${svc.name} · LKR ${svc.price.toLocaleString()}`,
    });
    setForm(EMPTY);
    setSubmitting(false);
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle>New Walk-In</SheetTitle>
          <SheetDescription>Add a walk-in customer to the queue.</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 gap-4 py-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Phone</label>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="+94 77 000 0000"
              value={form.phone}
              onChange={(e) => handlePhone(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Customer Name *</label>
            <input
              required
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="e.g. Hasini Wijesuriya"
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
              <label className="text-sm font-medium">Technician</label>
              <input
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Auto-assigned"
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
                <option value="">Assign later</option>
                {["Bay 1", "Bay 2", "Bay 3", "Bay 4", "Bay 5"].map((b) => (
                  <option key={b} value={b}>{b}</option>
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
              {submitting ? "Adding…" : "Add to Queue"}
            </button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
