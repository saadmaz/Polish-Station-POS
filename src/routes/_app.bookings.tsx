import { createFileRoute } from "@tanstack/react-router";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { BOOKINGS } from "@/lib/mock-data";
import { StatusChip, statusVariant } from "@/components/status-chip";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { useState } from "react";

export const Route = createFileRoute("/_app/bookings")({
  head: () => ({ meta: [{ title: "Bookings — Polish Station OS" }] }),
  component: Bookings,
});

const HOURS = Array.from({ length: 11 }, (_, i) => 8 + i); // 8..18

function Bookings() {
  const [view, setView] = useState<"day" | "week" | "list">("day");
  return (
    <div className="p-6">
      <PageHeader
        title="Bookings"
        subtitle="Schedule appointments and walk-ins"
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
            <button className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-red hover:bg-primary/90">
              <Plus className="h-4 w-4" /> New Booking
            </button>
          </>
        }
      />

      <div className="rounded-xl border border-border bg-card shadow-card">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex items-center gap-3">
            <button className="rounded-md p-1.5 hover:bg-muted">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="font-display font-bold">Today · Wed, Jun 17</div>
            <button className="rounded-md p-1.5 hover:bg-muted">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="text-xs text-muted-foreground">5 bays · 6 staff on shift</div>
        </div>

        {view === "day" && (
          <div className="grid grid-cols-[60px_repeat(5,1fr)] divide-x divide-border">
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
            {Array.from({ length: 5 }).map((_, bay) => (
              <div key={bay} className="relative">
                <div className="h-10 border-b border-border bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Bay {bay + 1}
                </div>
                <div className="relative">
                  {HOURS.map((h) => (
                    <div key={h} className="h-16 border-b border-border" />
                  ))}
                  {BOOKINGS.filter((_, i) => i % 5 === bay).map((b, idx) => {
                    const [h, m] = b.time.split(":").map(Number);
                    const startPx = (h - 8) * 64 + (m / 60) * 64;
                    const heightPx = Math.max(28, (b.durationMin / 60) * 64 - 4);
                    return (
                      <div
                        key={b.id}
                        className="absolute left-1.5 right-1.5 rounded-md border-l-[3px] border-primary bg-primary/8 px-2 py-1.5 hover:bg-primary/15 cursor-pointer overflow-hidden"
                        style={{ top: startPx, height: heightPx }}
                        title={`${b.customer} — ${b.service}`}
                      >
                        <div className="text-[11px] font-bold truncate">{b.customer}</div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {b.service}
                        </div>
                        {heightPx > 50 && (
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {b.tech} · {idx % 2 === 0 ? "60m" : "30m"}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {view === "list" && (
          <table className="w-full text-sm">
            <thead className="bg-charcoal text-charcoal-foreground text-[11px] uppercase tracking-wider">
              <tr>
                <th className="text-left px-5 py-2.5">Time</th>
                <th className="text-left px-3 py-2.5">Customer</th>
                <th className="text-left px-3 py-2.5">Vehicle</th>
                <th className="text-left px-3 py-2.5">Service</th>
                <th className="text-left px-3 py-2.5">Tech</th>
                <th className="text-left px-3 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {BOOKINGS.map((b) => (
                <tr key={b.id} className="hover:bg-muted/40">
                  <td className="px-5 py-3 font-mono text-xs">{b.time}</td>
                  <td className="px-3 py-3 font-medium">{b.customer}</td>
                  <td className="px-3 py-3 text-muted-foreground">{b.vehicle}</td>
                  <td className="px-3 py-3">{b.service}</td>
                  <td className="px-3 py-3 text-muted-foreground">{b.tech}</td>
                  <td className="px-3 py-3">
                    <StatusChip variant={statusVariant(b.status)}>{b.status}</StatusChip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

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
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, dayIdx) => (
                <div key={day} className="relative">
                  <div className="h-10 border-b border-border bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {day}{" "}
                    <span className="text-foreground/60 normal-case font-mono">{15 + dayIdx}</span>
                  </div>
                  <div className="relative">
                    {HOURS.map((h) => (
                      <div key={h} className="h-14 border-b border-border" />
                    ))}
                    {BOOKINGS.filter((_, i) => (i + dayIdx) % 7 < 3)
                      .slice(0, 3)
                      .map((b) => {
                        const [h, m] = b.time.split(":").map(Number);
                        const startPx = (h - 8) * 56 + (m / 60) * 56;
                        const heightPx = Math.max(24, (b.durationMin / 60) * 56 - 4);
                        return (
                          <div
                            key={b.id + day}
                            className="absolute left-1 right-1 rounded-md border-l-[3px] border-primary bg-primary/10 px-1.5 py-1 hover:bg-primary/20 cursor-pointer overflow-hidden"
                            style={{ top: startPx, height: heightPx }}
                            title={`${b.customer} — ${b.service}`}
                          >
                            <div className="text-[10px] font-bold truncate">{b.customer}</div>
                            <div className="text-[10px] text-muted-foreground truncate">
                              {b.service}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
