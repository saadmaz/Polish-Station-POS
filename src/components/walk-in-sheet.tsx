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

interface WalkInSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EMPTY = { name: "", phone: "", plate: "", serviceId: "" };

export function WalkInSheet({ open, onOpenChange }: WalkInSheetProps) {
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
      toast.success("Walk-in created", {
        description: `${form.name} — ${svc?.name ?? ""} added to the queue.`,
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
          <SheetTitle>New Walk-In</SheetTitle>
          <SheetDescription>Add a walk-in customer to the queue.</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 gap-5 py-4">
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

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Phone</label>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="+94 77 000 0000"
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
