import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { useStaffList } from "@/lib/use-staff-list";
import { useAuth } from "@/lib/auth";
import { isManagerOrAbove } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { ChevronLeft, ChevronRight, Trash2, X } from "lucide-react";
import type { RotaShift } from "@/lib/db";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/staff")({
  head: () => ({ meta: [{ title: "Staff · Polish Station OS" }] }),
  component: StaffPage,
});

function StaffPage() {
  const { staffList } = useStaffList();

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="Staff" subtitle={`${staffList.length} team members`} />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
        {staffList.map((s) => (
          <div
            key={s.id}
            className="rounded-xl border border-border bg-card p-4 shadow-card hover:shadow-elevated transition-shadow"
          >
            <div className="flex items-center gap-3">
              <div
                className="grid h-12 w-12 place-items-center rounded-full font-bold text-primary-foreground"
                style={{ background: s.color }}
              >
                {s.name
                  .split(" ")
                  .map((p) => p[0])
                  .join("")}
              </div>
              <div className="flex-1">
                <div className="font-display font-bold">{s.name}</div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider">
                  {s.role}
                </div>
              </div>
            </div>
            <div className="mt-3 flex justify-between text-[11px] text-muted-foreground border-t border-border pt-3">
              <span>
                User · <span className="font-mono">{s.username || "—"}</span>
              </span>
              <span>Shift · 08:00 – 18:00</span>
            </div>
          </div>
        ))}
      </div>

      <RotaPanel />
    </div>
  );
}

// ─── Weekly Rota ──────────────────────────────────────────────────────────────

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfWeek(d: Date): Date {
  const day = d.getDay(); // 0 = Sun
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(d.getDate() + mondayOffset);
  return monday;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

interface EditingCell {
  staffId: string;
  staffName: string;
  date: string;
  shift: RotaShift | null;
}

function RotaPanel() {
  const { rotaShiftsList, addRotaShift, updateRotaShift, deleteRotaShift } = useStore();
  const { staffList } = useStaffList();
  const { staff } = useAuth();
  const canManage = isManagerOrAbove(staff?.role);

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const todayYMD = toYMD(new Date());

  const [editing, setEditing] = useState<EditingCell | null>(null);

  function shiftFor(staffId: string, date: string): RotaShift | undefined {
    return rotaShiftsList.find((s) => s.staffId === staffId && s.date === date);
  }

  function handleSave(data: { startTime: string; endTime: string; notes: string }) {
    if (!editing) return;
    if (editing.shift) {
      updateRotaShift({ ...editing.shift, ...data });
    } else {
      addRotaShift({
        staffId: editing.staffId,
        staffName: editing.staffName,
        date: editing.date,
        ...data,
      });
    }
    setEditing(null);
  }

  function handleDelete() {
    if (!editing?.shift) return;
    deleteRotaShift(editing.shift.id);
    setEditing(null);
  }

  return (
    <div className="mt-6 rounded-xl border border-border bg-card shadow-card">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <h2 className="font-display text-base font-bold">Weekly Rota</h2>
        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={() => setWeekStart((w) => addDays(w, -7))}
            className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-muted-foreground">
            {days[0].toLocaleDateString([], { day: "numeric", month: "short" })} –{" "}
            {days[6].toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}
          </span>
          <button
            onClick={() => setWeekStart((w) => addDays(w, 7))}
            className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Mobile: one card per staff member, days scroll horizontally within
          the card so the staff name never competes with the table for
          width the way a full 8-column table would. */}
      <div className="divide-y divide-border md:hidden">
        {staffList.map((s) => (
          <div key={s.id} className="p-4">
            <div className="mb-2 text-sm font-medium">{s.name}</div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {days.map((d, i) => {
                const ymd = toYMD(d);
                const shift = shiftFor(s.id, ymd);
                return (
                  <div
                    key={ymd}
                    className={cn(
                      "w-20 shrink-0 rounded-md border p-1.5 text-center",
                      ymd === todayYMD ? "border-primary/30 bg-primary/5" : "border-border",
                    )}
                  >
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {DAY_LABELS[i]} {d.getDate()}
                    </div>
                    {shift ? (
                      <button
                        onClick={() =>
                          canManage &&
                          setEditing({ staffId: s.id, staffName: s.name, date: ymd, shift })
                        }
                        disabled={!canManage}
                        className="mt-1 min-h-9 w-full rounded-md bg-primary/10 px-1 py-1.5 font-mono text-[11px] text-primary hover:bg-primary/20 disabled:cursor-default"
                      >
                        {shift.startTime}–{shift.endTime}
                      </button>
                    ) : canManage ? (
                      <button
                        onClick={() =>
                          setEditing({ staffId: s.id, staffName: s.name, date: ymd, shift: null })
                        }
                        className="mt-1 min-h-9 w-full rounded-md border border-dashed border-input py-1.5 text-xs text-muted-foreground hover:bg-accent"
                      >
                        +
                      </button>
                    ) : (
                      <span className="mt-1 block py-1.5 text-xs text-muted-foreground">—</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {staffList.length === 0 && (
          <div className="px-5 py-6 text-center text-sm text-muted-foreground">
            No staff on file
          </div>
        )}
      </div>

      {/* Tablet/desktop: full grid table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="bg-charcoal text-charcoal-foreground text-[11px] uppercase tracking-wider">
            <tr>
              <th className="text-left px-5 py-2.5">Staff</th>
              {days.map((d, i) => (
                <th key={toYMD(d)} className="text-center px-2 py-2.5">
                  {DAY_LABELS[i]} {d.getDate()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {staffList.map((s) => (
              <tr key={s.id}>
                <td className="px-5 py-2.5 font-medium whitespace-nowrap">{s.name}</td>
                {days.map((d) => {
                  const ymd = toYMD(d);
                  const shift = shiftFor(s.id, ymd);
                  return (
                    <td
                      key={ymd}
                      className={cn(
                        "px-1.5 py-1.5 text-center",
                        ymd === todayYMD && "bg-primary/5",
                      )}
                    >
                      {shift ? (
                        <button
                          onClick={() =>
                            canManage &&
                            setEditing({ staffId: s.id, staffName: s.name, date: ymd, shift })
                          }
                          disabled={!canManage}
                          className="w-full rounded-md bg-primary/10 px-2 py-1 font-mono text-xs text-primary hover:bg-primary/20 disabled:cursor-default"
                        >
                          {shift.startTime}–{shift.endTime}
                        </button>
                      ) : canManage ? (
                        <button
                          onClick={() =>
                            setEditing({ staffId: s.id, staffName: s.name, date: ymd, shift: null })
                          }
                          className="w-full rounded-md border border-dashed border-input py-1 text-xs text-muted-foreground hover:bg-accent"
                        >
                          +
                        </button>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {staffList.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-6 text-center text-muted-foreground">
                  No staff on file
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <RotaShiftModal
          staffName={editing.staffName}
          date={editing.date}
          shift={editing.shift}
          onSave={handleSave}
          onDelete={editing.shift ? handleDelete : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function RotaShiftModal({
  staffName,
  date,
  shift,
  onSave,
  onDelete,
  onClose,
}: {
  staffName: string;
  date: string;
  shift: RotaShift | null;
  onSave: (data: { startTime: string; endTime: string; notes: string }) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [startTime, setStartTime] = useState(shift?.startTime ?? "08:00");
  const [endTime, setEndTime] = useState(shift?.endTime ?? "18:00");
  const [notes, setNotes] = useState(shift?.notes ?? "");
  const valid = startTime !== "" && endTime !== "" && startTime < endTime;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl bg-card border border-border shadow-elevated p-6 mx-4">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-display text-lg font-bold">{staffName}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-2 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          {new Date(date).toLocaleDateString([], {
            weekday: "long",
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </p>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Start</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">End</label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <div className="mb-4">
          <label className="text-xs font-medium text-muted-foreground">Notes</label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional"
            className="mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="flex gap-2">
          {onDelete && (
            <button
              onClick={onDelete}
              aria-label="Remove shift"
              className="rounded-md border border-input px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
              title="Remove shift"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Cancel
          </button>
          <button
            onClick={() => valid && onSave({ startTime, endTime, notes })}
            disabled={!valid}
            className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-red hover:bg-primary/90 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
