import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, MonitorSmartphone, Plus, ShieldOff, WifiOff } from "lucide-react";
import { auth as firebaseAuth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { isDeviceEnrolled, getDeviceId, completeDeviceEnrollment } from "@/lib/offline-auth";
import { enrollDeviceFn, revokeDeviceFn, listDevicesFn, type DeviceRow } from "@/server/devices";
import { formatDateTime } from "@/lib/date-format";
import { StatusChip } from "@/components/status-chip";
import { cn } from "@/lib/utils";

async function idToken(): Promise<string | null> {
  return (await firebaseAuth.currentUser?.getIdToken()) ?? null;
}

export function DevicesPanel() {
  const { staff: me } = useAuth();
  const [rows, setRows] = useState<DeviceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("");
  const [enrolledHere, setEnrolledHere] = useState(isDeviceEnrolled());

  const canManage = !!me && isAdmin(me.role);

  const load = useCallback(async () => {
    try {
      const token = await idToken();
      if (!token) return;
      const res = await listDevicesFn({ data: { idToken: token } });
      if (res.success) setRows(res.devices);
      else toast.error("Couldn't load devices. Check your permissions.");
    } catch {
      toast.error("Couldn't load devices. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function enrollThisTill() {
    if (!label.trim()) return;
    setBusy(true);
    try {
      const token = await idToken();
      if (!token) {
        toast.error("Session expired. Sign in again.");
        return;
      }
      const res = await enrollDeviceFn({ data: { idToken: token, label: label.trim() } });
      if (res.success) {
        completeDeviceEnrollment(res.deviceId);
        setEnrolledHere(true);
        setLabel("");
        toast.success(`"${label.trim()}" enrolled for offline login`);
        void load();
      } else {
        toast.error("You don't have permission to enroll a device.");
      }
    } catch {
      toast.error("Enrollment failed. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(row: DeviceRow) {
    setBusy(true);
    try {
      const token = await idToken();
      if (!token) {
        toast.error("Session expired. Sign in again.");
        return;
      }
      const res = await revokeDeviceFn({ data: { idToken: token, deviceId: row.id } });
      if (res.success) {
        toast.success(`"${row.label}" revoked`);
        void load();
      } else {
        toast.error("Couldn't revoke that device.");
      }
    } catch {
      toast.error("Revoke failed. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  const thisDeviceId = getDeviceId();

  return (
    <>
      <div className="mb-5 border-b border-border pb-4">
        <h2 className="font-display text-lg font-bold">Devices</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Tills enrolled here can sign a staff member in with their PIN even with no network at all,
          once that person has logged in online on this specific till at least once. Everything else
          &mdash; sales, invoices, PIN changes &mdash; still needs a real connection.
        </p>
      </div>

      {canManage && (
        <div className="mb-5 flex flex-col gap-2 rounded-lg border border-dashed border-input p-4 sm:flex-row sm:items-end">
          <label className="flex-1 block">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {enrolledHere ? "Enroll another till" : "Enroll this till"}
            </span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Front Counter"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <button
            onClick={enrollThisTill}
            disabled={busy || !label.trim()}
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-red hover:bg-primary/90 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Enroll
          </button>
        </div>
      )}

      {!enrolledHere && (
        <div className="mb-5 flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-400">
          <WifiOff className="h-4 w-4 shrink-0" />
          This till itself isn't enrolled yet &mdash; offline PIN login won't work here until it is.
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No tills enrolled yet.</p>
      ) : (
        <div className="divide-y divide-border">
          {rows.map((row) => (
            <div
              key={row.id}
              className={cn(
                "flex items-center justify-between gap-3 py-3",
                row.revoked && "opacity-50",
              )}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <MonitorSmartphone className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 truncate text-sm font-medium">
                    {row.label}
                    {row.id === thisDeviceId && (
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        (this till)
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Enrolled {formatDateTime(row.enrolledAt)}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StatusChip variant={row.revoked ? "neutral" : "success"}>
                  {row.revoked ? "Revoked" : "Active"}
                </StatusChip>
                {canManage && !row.revoked && (
                  <button
                    title="Revoke"
                    aria-label={`Revoke ${row.label}`}
                    onClick={() => revoke(row)}
                    disabled={busy}
                    className="grid h-9 w-9 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary hover:border-primary/40 disabled:opacity-30"
                  >
                    <ShieldOff className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
