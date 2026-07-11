import { useState } from "react";
import { Bell, AlertTriangle, Clock, CheckCircle2, Package } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

interface Notification {
  id: string;
  type: "warning" | "info" | "success";
  title: string;
  description: string;
  read: boolean;
}

const ICON = { warning: AlertTriangle, info: Clock, success: CheckCircle2 };
const ICON_CLASS = { warning: "text-amber-500", info: "text-primary", success: "text-emerald-500" };

function useNotifications(): Notification[] {
  const { inventory, jobs, bookings } = useStore();
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const notes: Notification[] = [];

  // Low / out-of-stock
  inventory.forEach((item) => {
    if (item.stock === 0) {
      notes.push({
        id: `oos-${item.id}`,
        type: "warning",
        title: "Out of stock",
        description: `${item.name} (${item.sku}) — reorder qty: ${item.reorder}`,
        read: false,
      });
    } else if (item.stock <= item.reorder) {
      notes.push({
        id: `low-${item.id}`,
        type: "warning",
        title: "Low stock",
        description: `${item.name} — ${item.stock} ${item.unit} remaining (reorder at ${item.reorder})`,
        read: false,
      });
    }
  });

  // Jobs awaiting QC
  jobs
    .filter((j) => j.status === "Awaiting QC")
    .forEach((j) => {
      notes.push({
        id: `qc-${j.id}`,
        type: "info",
        title: "Awaiting QC",
        description: `${j.id} · ${j.customerName} — ${j.serviceName} ready for inspection`,
        read: false,
      });
    });

  // Overdue in-bay jobs
  jobs
    .filter((j) => j.status === "In Bay" && j.elapsedMin > j.estimateMin)
    .forEach((j) => {
      const over = j.elapsedMin - j.estimateMin;
      notes.push({
        id: `ovr-${j.id}`,
        type: "warning",
        title: "Overdue job",
        description: `${j.id} · ${j.customerName} — ${over}m over estimate (${j.serviceName})`,
        read: false,
      });
    });

  // Bookings due in next 30 min
  bookings
    .filter((b) => b.date === todayStr && b.status === "Confirmed")
    .forEach((b) => {
      const [h, m] = b.time.split(":").map(Number);
      const bMin = h * 60 + m;
      const diff = bMin - nowMin;
      if (diff >= 0 && diff <= 30) {
        notes.push({
          id: `bk-${b.id}`,
          type: "info",
          title: "Upcoming booking",
          description: `${b.id} · ${b.customerName} at ${b.time} — ${b.serviceName}`,
          read: false,
        });
      }
    });

  return notes;
}

export function NotificationsPopover() {
  const generated = useNotifications();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const notifications = generated.filter((n) => !dismissed.has(n.id));
  const unread = notifications.length;

  function dismiss(id: string) {
    setDismissed((s) => new Set([...s, id]));
  }
  function dismissAll() {
    setDismissed(new Set(generated.map((n) => n.id)));
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button aria-label="Notifications" className="relative rounded-md p-2 hover:bg-accent">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 && (
            <button
              onClick={dismissAll}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Dismiss all
            </button>
          )}
        </div>

        <div className="divide-y divide-border max-h-96 overflow-y-auto">
          {notifications.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">All caught up!</p>
          )}
          {notifications.map((n) => {
            const Icon =
              n.title.startsWith("Low stock") || n.title === "Out of stock"
                ? Package
                : ICON[n.type];
            return (
              <button
                key={n.id}
                onClick={() => dismiss(n.id)}
                className={cn(
                  "flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/60 transition-colors",
                  "bg-primary/5",
                )}
              >
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", ICON_CLASS[n.type])} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{n.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground leading-snug">
                    {n.description}
                  </p>
                </div>
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
              </button>
            );
          })}
        </div>

        {notifications.length > 0 && (
          <div className="border-t border-border px-4 py-2.5">
            <span className="text-xs text-muted-foreground">
              {unread} active alert{unread !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
