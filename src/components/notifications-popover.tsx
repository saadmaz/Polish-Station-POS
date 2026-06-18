import { useState } from "react";
import { Bell, AlertTriangle, Clock, CheckCircle2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface Notification {
  id: string;
  type: "warning" | "info" | "success";
  title: string;
  description: string;
  time: string;
  read: boolean;
}

const INITIAL: Notification[] = [
  {
    id: "n1",
    type: "info",
    title: "Check-in reminder",
    description: "B-207 · Senuri K. (Kia Sportage) due at 14:30",
    time: "5m ago",
    read: false,
  },
  {
    id: "n2",
    type: "warning",
    title: "Awaiting QC",
    description: "J-1044 · Priya J. — Full Detail complete, needs inspection",
    time: "12m ago",
    read: false,
  },
  {
    id: "n3",
    type: "warning",
    title: "Low stock",
    description: "Foam Cannon Snow Soap (FC-SS-5L) is out of stock",
    time: "1h ago",
    read: false,
  },
];

const ICON = {
  warning: AlertTriangle,
  info: Clock,
  success: CheckCircle2,
};

const ICON_CLASS = {
  warning: "text-amber-500",
  info: "text-primary",
  success: "text-emerald-500",
};

export function NotificationsPopover() {
  const [notifications, setNotifications] = useState(INITIAL);
  const unread = notifications.filter((n) => !n.read).length;

  function markRead(id: string) {
    setNotifications((ns) => ns.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }

  function markAllRead() {
    setNotifications((ns) => ns.map((n) => ({ ...n, read: true })));
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button aria-label="Notifications" className="relative rounded-md p-2 hover:bg-accent">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {unread}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 && (
            <button
              onClick={markAllRead}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Mark all read
            </button>
          )}
        </div>

        <div className="divide-y divide-border">
          {notifications.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">All caught up!</p>
          )}
          {notifications.map((n) => {
            const Icon = ICON[n.type];
            return (
              <button
                key={n.id}
                onClick={() => markRead(n.id)}
                className={cn(
                  "flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/60 transition-colors",
                  !n.read && "bg-primary/5",
                )}
              >
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", ICON_CLASS[n.type])} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">{n.title}</span>
                    <span className="text-[11px] text-muted-foreground shrink-0">{n.time}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground leading-snug">
                    {n.description}
                  </p>
                </div>
                {!n.read && (
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                )}
              </button>
            );
          })}
        </div>

        {notifications.length > 0 && (
          <div className="border-t border-border px-4 py-2.5">
            <button className="text-xs text-muted-foreground hover:text-foreground">
              View all activity →
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
