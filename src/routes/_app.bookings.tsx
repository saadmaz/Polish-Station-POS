import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  LogIn,
  X,
  Trash2,
  CheckCircle2,
  Banknote,
  Globe,
  Copy,
  Check,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { BookingSheet } from "@/components/booking-sheet";
import { StatusChip, statusVariant } from "@/components/status-chip";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import type { Booking, BookingStatus } from "@/lib/db";

export const Route = createFileRoute("/_app/bookings")({
  head: () => ({ meta: [{ title: "Bookings — Polish Station OS" }] }),
  component: Bookings,
});

const HOURS = Array.from({ length: 11 }, (_, i) => 8 + i); // 8..18

const CAT_COLORS: Record<string, string> = {
  Exterior: "var(--info)",
  Interior: "var(--success)",
  "Full Detail": "var(--primary)",
  "Paint Protection": "var(--warning)",
  Coating: "var(--charcoal)",
};

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

// ─── Booking detail popover ───────────────────────────────────────────────────

function BookingCard({
  booking,
  onCheckin,
  onCancel,
  onDelete,
  onMarkDepositPaid,
}: {
  booking: Booking;
  onCheckin: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onMarkDepositPaid: () => void;
}) {
  const hasDeposit = booking.depositStatus && booking.depositStatus !== "none";
  const depositPaid = booking.depositStatus === "paid";
  const depositRequired = booking.depositStatus === "required";

  return (
    <div
      className="absolute inset-0 z-10 rounded-xl border border-border bg-card shadow-elevated p-4 space-y-3 overflow-y-auto"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="font-semibold">{booking.customerName}</div>
          <div className="text-xs text-muted-foreground font-mono">{booking.plate}</div>
        </div>
        <button onClick={onDelete} className="text-muted-foreground hover:text-primary p-1">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="text-sm space-y-1">
        <div>
          <span className="text-muted-foreground">Service:</span> {booking.serviceName}
        </div>
        <div>
          <span className="text-muted-foreground">Time:</span> {booking.time} ·{" "}
          {booking.durationMin}m
        </div>
        <div>
          <span className="text-muted-foreground">Tech:</span> {booking.tech}
        </div>
        <div>
          <span className="text-muted-foreground">Price:</span> LKR {booking.price.toLocaleString()}
        </div>
        {booking.notes && (
          <div>
            <span className="text-muted-foreground">Notes:</span> {booking.notes}
          </div>
        )}
      </div>

      {/* Deposit status */}
      {hasDeposit && (
        <div
          className={cn(
            "flex items-center justify-between rounded-md px-3 py-2 text-xs",
            depositPaid
              ? "bg-success/10 border border-success/30 text-success"
              : "bg-warning/10 border border-warning/30 text-warning",
          )}
        >
          <div className="flex items-center gap-1.5">
            <Banknote className="h-3.5 w-3.5" />
            <span className="font-semibold">
              Deposit LKR {(booking.depositAmount ?? 0).toLocaleString()}
            </span>
            <span>·</span>
            <span>{depositPaid ? "Paid" : "Required"}</span>
          </div>
          {depositPaid && <CheckCircle2 className="h-3.5 w-3.5" />}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {/* Mark deposit paid */}
        {depositRequired && (
          <button
            onClick={onMarkDepositPaid}
            className="flex items-center justify-center gap-1.5 w-full rounded-md bg-warning/10 border border-warning/30 text-warning py-1.5 text-xs font-semibold hover:bg-warning/20"
          >
            <Banknote className="h-3.5 w-3.5" /> Mark Deposit Received
          </button>
        )}

        {(booking.status === "Confirmed" || booking.status === "Pending") && (
          <button
            onClick={onCheckin}
            className="flex items-center justify-center gap-1.5 w-full rounded-md bg-success/10 border border-success/30 text-success py-1.5 text-xs font-semibold hover:bg-success/20"
          >
            <LogIn className="h-3.5 w-3.5" /> Check In → Create Job
          </button>
        )}
        {booking.status !== "Cancelled" && booking.status !== "Checked-In" && (
          <button
            onClick={onCancel}
            className="w-full rounded-md border border-border py-1.5 text-xs text-muted-foreground hover:text-primary hover:border-primary/40"
          >
            Cancel Booking
          </button>
        )}
        <button
          onClick={onDelete}
          className="flex items-center justify-center gap-1 w-full rounded-md border border-border py-1.5 text-xs text-muted-foreground hover:text-primary hover:border-primary/40"
        >
          <Trash2 className="h-3 w-3" /> Delete
        </button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function Bookings() {
  const { bookings, updateBooking, deleteBooking, checkinBooking, markDepositPaid } = useStore();
  const [view, setView] = useState<"day" | "week" | "list">("day");
  const [currentDate, setCurrentDate] = useState(new Date().toISOString().slice(0, 10));
  const [bookingOpen, setBookingOpen] = useState(false);
  const [activeCard, setActiveCard] = useState<string | null>(null);
  const [widgetOpen, setWidgetOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const widgetUrl = typeof window !== "undefined" ? `${window.location.origin}/book` : "/book";
  const embedCode = `<iframe src="${widgetUrl}?embed=true" width="100%" height="720" frameborder="0" style="border-radius:12px;border:1px solid #e5e7eb;"></iframe>`;

  function copyEmbed() {
    navigator.clipboard.writeText(embedCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const todayBookings = bookings
    .filter((b) => b.date === currentDate)
    .sort((a, b) => a.time.localeCompare(b.time));

  // Week dates
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(currentDate + "T00:00:00");
    const day = d.getDay(); // 0=Sun
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((day + 6) % 7) + i);
    return monday.toISOString().slice(0, 10);
  });

  function handleStatusChange(id: string, status: BookingStatus) {
    const b = bookings.find((x) => x.id === id);
    if (!b) return;
    updateBooking({ ...b, status });
    toast.success(`Booking ${status.toLowerCase()}`);
    setActiveCard(null);
  }

  function handleCheckin(id: string) {
    checkinBooking(id);
    toast.success("Checked in — job added to queue");
    setActiveCard(null);
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this booking?")) return;
    deleteBooking(id);
    toast.error("Booking deleted");
    setActiveCard(null);
  }

  function handleMarkDepositPaid(id: string) {
    markDepositPaid(id);
    toast.success("Deposit marked as received");
  }

  // Day view calendar grid
  function DayGrid({ date }: { date: string }) {
    const dayBookings = bookings.filter((b) => b.date === date);
    const bays = ["Bay 1", "Bay 2", "Bay 3", "Bay 4", "Bay 5"];
    const byBay: Record<string, Booking[]> = {};
    bays.forEach((bay) => {
      byBay[bay] = [];
    });
    dayBookings.forEach((b) => {
      const bay = b.bay && b.bay !== "—" ? b.bay : "Bay 1";
      if (!byBay[bay]) byBay[bay] = [];
      byBay[bay].push(b);
    });
    // unassigned bookings go into the first available bay column
    const unassigned = dayBookings.filter((b) => !b.bay || b.bay === "—");
    unassigned.forEach((b) => {
      byBay["Bay 1"].push(b);
    });

    return (
      <div className="grid grid-cols-[60px_repeat(5,1fr)] divide-x divide-border overflow-x-auto">
        <div>
          <div className="h-10 border-b border-border" />
          {HOURS.map((h) => (
            <div
              key={h}
              className="h-16 border-b border-border px-2 py-1 text-[11px] font-mono text-muted-foreground"
            >
              {String(h).padStart(2, "0")}:00
            </div>
          ))}
        </div>
        {bays.map((bay) => (
          <div key={bay} className="relative">
            <div className="h-10 border-b border-border bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {bay}
            </div>
            <div className="relative">
              {HOURS.map((h) => (
                <div key={h} className="h-16 border-b border-border" />
              ))}
              {byBay[bay]?.map((b) => {
                const [h, m] = b.time.split(":").map(Number);
                const startPx = (h - 8) * 64 + (m / 60) * 64;
                const heightPx = Math.max(28, (b.durationMin / 60) * 64 - 4);
                const color = CAT_COLORS[b.category] ?? "var(--primary)";
                const isActive = activeCard === b.id;
                return (
                  <div
                    key={b.id}
                    className={cn(
                      "absolute left-1.5 right-1.5 rounded-md border-l-[3px] bg-card px-2 py-1.5 cursor-pointer overflow-hidden hover:shadow-card transition-shadow",
                      b.status === "Cancelled" && "opacity-40",
                    )}
                    style={{
                      top: startPx,
                      height: isActive ? "auto" : heightPx,
                      minHeight: heightPx,
                      borderLeftColor: color,
                      zIndex: isActive ? 20 : 1,
                    }}
                    onClick={() => setActiveCard(isActive ? null : b.id)}
                  >
                    {isActive ? (
                      <BookingCard
                        booking={b}
                        onCheckin={() => handleCheckin(b.id)}
                        onCancel={() => handleStatusChange(b.id, "Cancelled")}
                        onDelete={() => handleDelete(b.id)}
                        onMarkDepositPaid={() => handleMarkDepositPaid(b.id)}
                      />
                    ) : (
                      <>
                        <div className="text-[11px] font-bold truncate">{b.customerName}</div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {b.serviceName}
                        </div>
                        {heightPx > 44 && (
                          <div className="text-[10px] text-muted-foreground">{b.tech}</div>
                        )}
                        {b.status === "Checked-In" && (
                          <CheckCircle2 className="absolute top-1 right-1 h-3 w-3 text-success" />
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Bookings"
        subtitle={`${todayBookings.length} bookings for ${formatDate(currentDate)}`}
        actions={
          <>
            <div className="inline-flex rounded-md border border-input bg-background p-0.5 text-xs font-medium">
              {(["day", "week", "list"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    "rounded-md px-3 py-1.5 capitalize",
                    view === v
                      ? "bg-charcoal text-charcoal-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
            <button
              onClick={() => setWidgetOpen(true)}
              className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <Globe className="h-4 w-4" /> Online Widget
            </button>
            <button
              onClick={() => setBookingOpen(true)}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-red hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" /> New Booking
            </button>
          </>
        }
      />

      <div
        className="rounded-xl border border-border bg-card shadow-card overflow-hidden"
        onClick={() => setActiveCard(null)}
      >
        {/* Date nav */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCurrentDate((d) => addDays(d, view === "week" ? -7 : -1))}
              className="rounded-md p-1.5 hover:bg-muted"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="font-display font-bold">{formatDate(currentDate)}</div>
            <button
              onClick={() => setCurrentDate((d) => addDays(d, view === "week" ? 7 : 1))}
              className="rounded-md p-1.5 hover:bg-muted"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCurrentDate(new Date().toISOString().slice(0, 10))}
              className="text-xs text-muted-foreground hover:text-foreground border border-input rounded-md px-2 py-1"
            >
              Today
            </button>
          </div>
          <div className="text-xs text-muted-foreground">{bookings.length} total bookings</div>
        </div>

        {/* Day view */}
        {view === "day" && <DayGrid date={currentDate} />}

        {/* Week view */}
        {view === "week" && (
          <div className="overflow-x-auto">
            <div className="grid grid-cols-[60px_repeat(7,minmax(120px,1fr))] divide-x divide-border min-w-[900px]">
              <div>
                <div className="h-10 border-b border-border" />
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="h-14 border-b border-border px-2 py-1 text-[11px] font-mono text-muted-foreground"
                  >
                    {String(h).padStart(2, "0")}:00
                  </div>
                ))}
              </div>
              {weekDates.map((date) => {
                const dayBookings = bookings.filter((b) => b.date === date);
                const isToday = date === new Date().toISOString().slice(0, 10);
                return (
                  <div key={date} className="relative">
                    <div
                      className={cn(
                        "h-10 border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wider",
                        isToday
                          ? "bg-primary/10 text-primary"
                          : "bg-muted/40 text-muted-foreground",
                      )}
                    >
                      {new Date(date + "T00:00:00").toLocaleDateString([], {
                        weekday: "short",
                        day: "numeric",
                      })}
                    </div>
                    <div className="relative">
                      {HOURS.map((h) => (
                        <div key={h} className="h-14 border-b border-border" />
                      ))}
                      {dayBookings.map((b) => {
                        const [h, m] = b.time.split(":").map(Number);
                        const startPx = (h - 8) * 56 + (m / 60) * 56;
                        const heightPx = Math.max(24, (b.durationMin / 60) * 56 - 4);
                        const color = CAT_COLORS[b.category] ?? "var(--primary)";
                        return (
                          <div
                            key={b.id}
                            className="absolute left-1 right-1 rounded-md border-l-[3px] bg-card px-1.5 py-1 cursor-pointer overflow-hidden hover:shadow-card"
                            style={{ top: startPx, height: heightPx, borderLeftColor: color }}
                            title={`${b.customerName} — ${b.serviceName}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveCard(b.id === activeCard ? null : b.id);
                              setCurrentDate(date);
                              setView("day");
                            }}
                          >
                            <div className="text-[10px] font-bold truncate">{b.customerName}</div>
                            <div className="text-[10px] text-muted-foreground truncate">
                              {b.serviceName}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* List view */}
        {view === "list" && (
          <table className="w-full text-sm">
            <thead className="bg-charcoal text-charcoal-foreground text-[11px] uppercase tracking-wider">
              <tr>
                <th className="text-left px-5 py-2.5">Time</th>
                <th className="text-left px-3 py-2.5">Customer</th>
                <th className="text-left px-3 py-2.5">Vehicle</th>
                <th className="text-left px-3 py-2.5">Service</th>
                <th className="text-left px-3 py-2.5">Tech</th>
                <th className="text-right px-3 py-2.5">Price</th>
                <th className="text-left px-3 py-2.5">Deposit</th>
                <th className="text-left px-3 py-2.5">Status</th>
                <th className="w-28 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {bookings
                .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
                .map((b) => (
                  <tr key={b.id} className="hover:bg-muted/40">
                    <td className="px-5 py-3 font-mono text-xs">
                      <div>{b.date}</div>
                      <div className="text-muted-foreground">{b.time}</div>
                    </td>
                    <td className="px-3 py-3 font-medium">{b.customerName}</td>
                    <td className="px-3 py-3">
                      <div className="font-mono text-xs">{b.plate}</div>
                      <div className="text-muted-foreground text-xs">{b.vehicleModel}</div>
                    </td>
                    <td className="px-3 py-3">{b.serviceName}</td>
                    <td className="px-3 py-3 text-muted-foreground">{b.tech}</td>
                    <td className="px-3 py-3 text-right font-mono font-semibold">
                      LKR {b.price.toLocaleString()}
                    </td>
                    <td className="px-3 py-3">
                      {b.depositStatus && b.depositStatus !== "none" && (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                            b.depositStatus === "paid"
                              ? "bg-success/10 text-success"
                              : "bg-warning/10 text-warning",
                          )}
                        >
                          <Banknote className="h-3 w-3" />
                          {b.depositStatus === "paid" ? "Dep. Paid" : "Dep. Req."}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <StatusChip variant={statusVariant(b.status)}>{b.status}</StatusChip>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        {b.depositStatus === "required" && (
                          <button
                            onClick={() => handleMarkDepositPaid(b.id)}
                            className="rounded p-1.5 text-warning hover:bg-warning/10"
                            title="Mark deposit received"
                          >
                            <Banknote className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {(b.status === "Confirmed" || b.status === "Pending") && (
                          <button
                            onClick={() => handleCheckin(b.id)}
                            className="inline-flex items-center gap-1 rounded-md bg-success/10 border border-success/30 text-success px-2 py-1 text-xs font-semibold hover:bg-success/20"
                            title="Check In"
                          >
                            <LogIn className="h-3 w-3" /> Check In
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(b.id)}
                          className="rounded p-1.5 text-muted-foreground hover:text-primary hover:bg-muted"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              {bookings.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-muted-foreground">
                    No bookings yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <BookingSheet open={bookingOpen} onOpenChange={setBookingOpen} />

      {/* Online Widget modal */}
      {widgetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setWidgetOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-elevated"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-display font-bold text-foreground">Online Booking Widget</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Share the link or embed the widget on your website.
                </p>
              </div>
              <button
                onClick={() => setWidgetOpen(false)}
                className="rounded-md p-1.5 hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Direct Link
                </label>
                <div className="flex gap-2">
                  <a
                    href={widgetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 truncate rounded-lg border border-input bg-muted/40 px-3 py-2 text-sm text-foreground hover:bg-muted"
                  >
                    {widgetUrl}
                  </a>
                  <a
                    href={widgetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-input bg-background px-3 py-2 text-xs font-medium hover:bg-muted"
                  >
                    <Globe className="h-3.5 w-3.5" /> Open
                  </a>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Embed Code (iFrame)
                </label>
                <div className="relative rounded-lg border border-input bg-muted/40 p-3 font-mono text-xs text-muted-foreground">
                  <pre className="whitespace-pre-wrap break-all">{embedCode}</pre>
                  <button
                    onClick={copyEmbed}
                    className="absolute top-2 right-2 flex items-center gap-1 rounded-md bg-background border border-input px-2 py-1 text-xs font-medium hover:bg-muted"
                  >
                    {copied ? (
                      <Check className="h-3 w-3 text-success" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Paste this snippet into your website's HTML to embed the booking form.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
