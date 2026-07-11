import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { toast } from "sonner";
import {
  KeyRound,
  Plus,
  Pencil,
  UserCheck,
  UserX,
  Loader2,
  ShieldCheck,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { db, auth as firebaseAuth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { StatusChip } from "@/components/status-chip";
import {
  createStaffFn,
  updateStaffFn,
  setStaffActiveFn,
  resetPinFn,
  deleteStaffFn,
  type StaffActionError,
} from "@/server/staff";
import {
  MODULES,
  ROLE_DEFAULT_PERMISSIONS,
  STAFF_ROLES,
  isSuperAdmin,
  rank,
  sanitizePermissions,
  type ModuleKey,
  type StaffRole,
} from "@/lib/permissions";
import { cn } from "@/lib/utils";

const INPUT =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

// The private staff docs — Manager+/Admin may read these under firestore.rules,
// and only Admin+ ever reaches this panel (settings module).
interface StaffRow {
  id: string;
  username: string;
  name: string;
  role: StaffRole;
  color: string;
  active: boolean;
  permissions: ModuleKey[];
}

const ERROR_TEXT: Record<StaffActionError, string> = {
  unauthorized: "Your session expired or you lack permission — sign in again.",
  forbidden: "You can't perform this action on a user at or above your own role.",
  not_found: "That user no longer exists.",
  username_taken: "That username is already taken.",
  name_taken: "Another active user already has that display name.",
  last_super_admin: "This is the last Super Admin — promote someone else first.",
  self_target: "You can't change your own role or deactivate yourself here.",
};

const PALETTE = [
  "oklch(0.55 0.21 27)",
  "oklch(0.60 0.13 240)",
  "oklch(0.65 0.16 145)",
  "oklch(0.78 0.15 75)",
  "oklch(0.65 0.14 320)",
  "oklch(0.60 0.15 280)",
  "oklch(0.55 0.15 190)",
  "oklch(0.50 0.18 30)",
];

async function idToken(): Promise<string | null> {
  // getIdToken() (not getIdToken(true)): return the cached ID token and only
  // hit the network to refresh when it's actually expired. Forcing a refresh
  // added a ~2-4s round-trip to securetoken.googleapis.com on every call for
  // no benefit — the server re-reads the caller's role from the staff doc and
  // never trusts the token claim, so a freshly-minted token buys nothing.
  return (await firebaseAuth.currentUser?.getIdToken()) ?? null;
}

export function AccessPanel() {
  const { staff: me } = useAuth();
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [resetTarget, setResetTarget] = useState<StaffRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StaffRow | null>(null);

  const load = useCallback(async () => {
    try {
      const snap = await getDocs(collection(db, "staff"));
      setRows(
        snap.docs
          .map((d) => {
            const v = d.data();
            return {
              id: d.id,
              username: (v.username as string) ?? "—",
              name: v.name as string,
              role: v.role as StaffRole,
              color: (v.color as string) ?? PALETTE[0],
              active: v.active !== false,
              permissions: sanitizePermissions(v.permissions),
            };
          })
          .sort((a, b) => rank(b.role) - rank(a.role) || a.name.localeCompare(b.name)),
      );
    } catch {
      toast.error("Couldn't load staff — check your permissions and connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // An Admin may act on strictly-lower roles; a SuperAdmin on anyone. Mirrors
  // the server's mayActOn — the server is authoritative, this only hides
  // buttons the user could not use anyway.
  const canActOn = useCallback(
    (row: StaffRow) => {
      if (!me) return false;
      if (row.id === me.id) return false;
      if (isSuperAdmin(me.role)) return true;
      return rank(me.role) > rank(row.role);
    },
    [me],
  );

  return (
    <>
      <div className="mb-5 flex items-start justify-between gap-4 border-b border-border pb-4">
        <div>
          <h2 className="font-display text-lg font-bold">Staff &amp; Access</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Create users, set roles, and choose exactly which sections each person can open.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-red hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Add User
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Stat label="Auth Type" value="Username + PIN" mono />
        <Stat label="Lockout Threshold" value="5 fails" />
        <Stat label="Session Timeout" value="15 min" />
        <Stat label="Lockout Duration" value="5 min" />
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
              <tr>
                <th className="text-left py-2">User</th>
                <th className="text-left py-2">Username</th>
                <th className="text-left py-2">Role</th>
                <th className="text-left py-2">Modules</th>
                <th className="text-left py-2">Status</th>
                <th className="text-right py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => {
                const actionable = canActOn(row);
                return (
                  <tr key={row.id} className={cn(!row.active && "opacity-50")}>
                    <td className="py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold text-primary-foreground"
                          style={{ background: row.color }}
                        >
                          {row.name
                            .split(" ")
                            .map((p) => p[0])
                            .join("")
                            .slice(0, 2)}
                        </span>
                        <span className="font-medium">{row.name}</span>
                        {row.id === me?.id && (
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            (you)
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 font-mono text-muted-foreground">{row.username}</td>
                    <td className="py-2.5">
                      <span className="inline-flex items-center gap-1">
                        {isSuperAdmin(row.role) && (
                          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                        )}
                        {row.role}
                      </span>
                    </td>
                    <td className="py-2.5 text-muted-foreground">
                      {isSuperAdmin(row.role)
                        ? "All"
                        : `${row.permissions.length} / ${MODULES.length}`}
                    </td>
                    <td className="py-2.5">
                      <StatusChip variant={row.active ? "success" : "neutral"}>
                        {row.active ? "Active" : "Disabled"}
                      </StatusChip>
                    </td>
                    <td className="py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <IconBtn
                          title="Edit"
                          onClick={() => setEditing(row)}
                          disabled={!actionable && row.id !== me?.id}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </IconBtn>
                        <IconBtn
                          title="Reset PIN"
                          onClick={() => setResetTarget(row)}
                          disabled={!actionable}
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                        </IconBtn>
                        <ActiveToggle row={row} disabled={!actionable} onDone={load} />
                        <IconBtn
                          title="Delete user"
                          onClick={() => setDeleteTarget(row)}
                          disabled={!actionable}
                          danger
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </IconBtn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <StaffDialog
          mode="create"
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            void load();
          }}
        />
      )}
      {editing && (
        <StaffDialog
          mode="edit"
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
      {resetTarget && (
        <ResetPinDialog
          row={resetTarget}
          onClose={() => setResetTarget(null)}
          onSaved={() => setResetTarget(null)}
        />
      )}
      {deleteTarget && (
        <DeleteDialog
          row={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            setDeleteTarget(null);
            void load();
          }}
        />
      )}
    </>
  );
}

// ── Delete confirmation ───────────────────────────────────────────────────────

function DeleteDialog({
  row,
  onClose,
  onDeleted,
}: {
  row: StaffRow;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function confirmDelete() {
    setBusy(true);
    try {
      const token = await idToken();
      if (!token) {
        toast.error("Session expired — sign in again.");
        return;
      }
      const res = await deleteStaffFn({ data: { idToken: token, targetStaffId: row.id } });
      if (res.success) {
        toast.success(`${row.name} deleted`);
        onDeleted();
      } else {
        toast.error(ERROR_TEXT[res.error]);
      }
    } catch {
      toast.error("Delete failed — check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-display text-base font-bold">Delete {row.name}?</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            This permanently removes the account and frees the username{" "}
            <span className="font-mono">{row.username}</span> for reuse. Any open session is signed
            out immediately. This can't be undone.
          </p>
        </div>
      </div>

      <div className="mt-5 flex gap-2">
        <button
          onClick={confirmDelete}
          disabled={busy}
          className="flex flex-1 items-center justify-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-white hover:bg-destructive/90 disabled:opacity-40"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Delete user
        </button>
        <button
          onClick={onClose}
          className="flex-1 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
}

// ── Activate / deactivate ─────────────────────────────────────────────────────

function ActiveToggle({
  row,
  disabled,
  onDone,
}: {
  row: StaffRow;
  disabled: boolean;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      const token = await idToken();
      if (!token) {
        toast.error("Session expired — sign in again.");
        return;
      }
      const res = await setStaffActiveFn({
        data: { idToken: token, targetStaffId: row.id, active: !row.active },
      });
      if (res.success) {
        toast.success(row.active ? `${row.name} disabled` : `${row.name} re-enabled`);
        onDone();
      } else {
        toast.error(ERROR_TEXT[res.error]);
      }
    } catch {
      toast.error("Action failed — check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <IconBtn
      title={row.active ? "Disable" : "Enable"}
      onClick={toggle}
      disabled={disabled || busy}
      danger={row.active}
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : row.active ? (
        <UserX className="h-3.5 w-3.5" />
      ) : (
        <UserCheck className="h-3.5 w-3.5" />
      )}
    </IconBtn>
  );
}

// ── Create / edit dialog ──────────────────────────────────────────────────────

function StaffDialog({
  mode,
  row,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  row?: StaffRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { staff: me } = useAuth();

  const [username, setUsername] = useState(row?.username ?? "");
  const [name, setName] = useState(row?.name ?? "");
  const [role, setRole] = useState<StaffRole>(row?.role ?? "Technician");
  const [color, setColor] = useState(row?.color ?? PALETTE[0]);
  const [pin, setPin] = useState("");
  const [perms, setPerms] = useState<Set<ModuleKey>>(
    () => new Set(row ? row.permissions : ROLE_DEFAULT_PERMISSIONS.Technician),
  );
  const [busy, setBusy] = useState(false);

  const superadmin = isSuperAdmin(role);

  // Only offer roles the current user may assign (never above their own).
  const assignableRoles = useMemo(
    () => STAFF_ROLES.filter((r) => me && (isSuperAdmin(me.role) || rank(r) <= rank(me.role))),
    [me],
  );

  // Picking a role pre-loads that role's default module set — the admin then
  // tweaks it. Editing keeps the user's current set unless the role changes.
  function pickRole(r: StaffRole) {
    setRole(r);
    setPerms(new Set(ROLE_DEFAULT_PERMISSIONS[r]));
  }

  function toggleModule(key: ModuleKey) {
    setPerms((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const usernameValid = /^[A-Za-z0-9_.-]{3,20}$/.test(username.trim());
  const pinValid = /^\d{4}$/.test(pin);
  const canSave =
    name.trim().length >= 2 && (mode === "edit" || (usernameValid && pinValid)) && !busy;

  async function save() {
    setBusy(true);
    try {
      const token = await idToken();
      if (!token) {
        toast.error("Session expired — sign in again.");
        return;
      }

      const permissions = superadmin ? MODULES.map((m) => m.key) : [...perms];

      const res =
        mode === "create"
          ? await createStaffFn({
              data: {
                idToken: token,
                username: username.trim(),
                name: name.trim(),
                role,
                color,
                pin,
                permissions,
              },
            })
          : await updateStaffFn({
              data: {
                idToken: token,
                targetStaffId: row!.id,
                name: name.trim(),
                role,
                color,
                permissions,
              },
            });

      if (res.success) {
        toast.success(mode === "create" ? `${name.trim()} created` : `${name.trim()} updated`);
        onSaved();
      } else {
        toast.error(ERROR_TEXT[res.error]);
      }
    } catch {
      toast.error("Save failed — check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <h3 className="font-display text-base font-bold mb-1">
        {mode === "create" ? "Add User" : `Edit ${row!.name}`}
      </h3>
      <p className="text-sm text-muted-foreground mb-4">
        {mode === "create"
          ? "The user signs in with this username and PIN, and must change the PIN on first login."
          : "Change role, colour, and module access. Username can't be changed here."}
      </p>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Display name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={INPUT}
              placeholder="e.g. Salman"
            />
          </Field>
          <Field label="Username">
            <input
              value={username}
              disabled={mode === "edit"}
              onChange={(e) => setUsername(e.target.value.replace(/[^A-Za-z0-9_.-]/g, ""))}
              className={cn(INPUT, "uppercase tracking-wide", mode === "edit" && "opacity-60")}
              placeholder="e.g. SALMAN"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Role">
            <select
              value={role}
              onChange={(e) => pickRole(e.target.value as StaffRole)}
              className={INPUT}
            >
              {assignableRoles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          {mode === "create" && (
            <Field label="Temporary PIN">
              <input
                type="text"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className={cn(INPUT, "font-mono tracking-[0.4em]")}
                placeholder="4 digits"
              />
            </Field>
          )}
        </div>

        <Field label="Colour">
          <div className="flex flex-wrap gap-2 pt-1">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={cn(
                  "h-7 w-7 rounded-full ring-2 ring-offset-2 ring-offset-background transition",
                  color === c ? "ring-primary" : "ring-transparent",
                )}
                style={{ background: c }}
                aria-label="colour"
              />
            ))}
          </div>
        </Field>

        <Field label="Module access">
          {superadmin ? (
            <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Super Admins always have access to every module.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-1.5 pt-1 sm:grid-cols-3">
              {MODULES.map((m) => (
                <label
                  key={m.key}
                  className="flex items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-muted/50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={perms.has(m.key)}
                    onChange={() => toggleModule(m.key)}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className="truncate">{m.label}</span>
                </label>
              ))}
            </div>
          )}
        </Field>
      </div>

      <div className="mt-5 flex gap-2">
        <button
          onClick={save}
          disabled={!canSave}
          className="flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {mode === "create" ? "Create user" : "Save changes"}
        </button>
        <button
          onClick={onClose}
          className="flex-1 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
}

// ── Reset PIN dialog ──────────────────────────────────────────────────────────

function ResetPinDialog({
  row,
  onClose,
  onSaved,
}: {
  row: StaffRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!/^\d{4}$/.test(pin)) return;
    setBusy(true);
    try {
      const token = await idToken();
      if (!token) {
        toast.error("Session expired — sign in again.");
        return;
      }
      const res = await resetPinFn({
        data: { idToken: token, targetStaffId: row.id, newPin: pin },
      });
      if (res.success) {
        toast.success(`PIN reset for ${row.name} — they'll set their own on next login`);
        onSaved();
      } else {
        toast.error(ERROR_TEXT[res.error]);
      }
    } catch {
      toast.error("Reset failed — check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <h3 className="font-display text-base font-bold mb-1">Reset PIN</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Set a temporary 4-digit PIN for <strong>{row.name}</strong>. They'll be forced to choose a
        new one the next time they sign in.
      </p>
      <input
        type="text"
        inputMode="numeric"
        maxLength={4}
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
        placeholder="••••"
        className="mb-4 w-full rounded-md border border-input bg-background px-3 py-2 text-center font-mono text-xl tracking-[0.5em] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        autoFocus
      />
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={pin.length !== 4 || busy}
          className="flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Reset PIN
        </button>
        <button
          onClick={onClose}
          className="flex-1 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
}

// ── Small building blocks ─────────────────────────────────────────────────────

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("text-xl font-bold", mono ? "font-mono" : "font-display")}>{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function IconBtn({
  title,
  onClick,
  disabled,
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "grid h-7 w-7 place-items-center rounded-md border border-border transition-colors disabled:opacity-30",
        danger
          ? "hover:bg-primary/10 hover:text-primary hover:border-primary/40"
          : "hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-background p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
