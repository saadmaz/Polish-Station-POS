import { Bell, Search, Plus, MapPin } from "lucide-react";
import { useEffect, useState } from "react";

export function TopBar() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(t);
  }, []);

  return (
    <header className="flex h-14 items-center gap-4 border-b border-border bg-background px-5">
      <div className="flex items-center gap-2 text-sm">
        <MapPin className="h-4 w-4 text-primary" />
        <span className="font-semibold">Polish Station</span>
        <span className="text-muted-foreground">/ Colombo 05 — Main</span>
      </div>

      <div className="mx-4 flex-1 max-w-md">
        <div className="flex items-center gap-2 rounded-md border border-input bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground">
          <Search className="h-4 w-4" />
          <span>Search customers, bookings, invoices…</span>
          <kbd className="ml-auto rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11px]">
            ⌘K
          </kbd>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button className="hidden md:inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent">
          <Plus className="h-4 w-4" /> Walk-In
        </button>
        <button className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-red hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Booking
        </button>
        <button aria-label="Notifications" className="relative rounded-md p-2 hover:bg-accent">
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
            3
          </span>
        </button>
        <div
          suppressHydrationWarning
          className="hidden lg:block border-l border-border pl-3 text-right text-xs leading-tight min-w-[80px]"
        >
          <div className="font-mono font-semibold">
            {now ? now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--"}
          </div>
          <div className="text-muted-foreground">
            {now
              ? now.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })
              : ""}
          </div>
        </div>
      </div>
    </header>
  );
}
