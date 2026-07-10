import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { KeyRound, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { auth as firebaseAuth } from "@/lib/firebase";
import { changeOwnPinFn } from "@/server/auth";

export const Route = createFileRoute("/change-pin")({
  head: () => ({
    meta: [
      { title: "Change PIN — Polish Station OS" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ChangePin,
});

// Deliberately outside the /_app layout: there is no sidebar and no way to
// navigate into the app while a forced PIN change is pending.
function ChangePin() {
  const { staff, loading, mustChangePin, logout, clearMustChangePin } = useAuth();
  const navigate = useNavigate();

  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return null;
  if (!staff) return <Navigate to="/" />;

  const complete = [currentPin, newPin, confirmPin].every((p) => /^\d{4}$/.test(p));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPin !== confirmPin) {
      setError("The two new PINs don't match");
      return;
    }

    setBusy(true);
    try {
      const idToken = await firebaseAuth.currentUser?.getIdToken(true);
      if (!idToken) {
        toast.error("Session expired — please sign in again");
        await logout();
        return;
      }

      const result = await changeOwnPinFn({ data: { idToken, currentPin, newPin } });

      if (result.success) {
        clearMustChangePin();
        toast.success("PIN updated");
        navigate({ to: "/dashboard" });
        return;
      }

      if (result.error === "wrong_pin") setError("Your current PIN is incorrect");
      else if (result.error === "weak_pin")
        setError("That PIN is too easy to guess — pick another");
      else if (result.error === "same_pin")
        setError("The new PIN must differ from your current one");
      else {
        toast.error("Session expired — please sign in again");
        await logout();
        return;
      }
    } catch {
      setError("Couldn't reach the server — check your connection");
    } finally {
      setBusy(false);
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
    }
  }

  return (
    <div className="brushed-charcoal min-h-screen grid place-items-center px-4 py-10">
      <div className="w-full max-w-[420px] rounded-2xl bg-card text-card-foreground p-7 shadow-elevated border border-border">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="grid h-10 w-10 place-items-center rounded-lg gradient-brand shadow-red">
            <KeyRound className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="leading-tight">
            <div className="font-display text-base font-extrabold">Change your PIN</div>
            <div className="text-xs text-muted-foreground">Signed in as {staff.name}</div>
          </div>
        </div>

        {mustChangePin && (
          <div className="mb-5 flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-400">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>
              Your PIN was issued by an administrator. Choose a new one before continuing.
            </span>
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <PinField label="Current PIN" value={currentPin} onChange={setCurrentPin} autoFocus />
          <PinField label="New PIN" value={newPin} onChange={setNewPin} />
          <PinField label="Confirm new PIN" value={confirmPin} onChange={setConfirmPin} />

          {error && (
            <div
              role="alert"
              className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-center text-xs font-semibold text-primary"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!complete || busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-red transition-opacity hover:bg-primary/90 disabled:opacity-40"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? "Updating…" : "Update PIN"}
          </button>
        </form>

        <button
          onClick={async () => {
            await logout();
            navigate({ to: "/" });
          }}
          className="mt-4 w-full text-center text-[11px] text-muted-foreground hover:text-foreground"
        >
          Sign out instead
        </button>
      </div>
    </div>
  );
}

function PinField({
  label,
  value,
  onChange,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
        {label}
      </label>
      <input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
        placeholder="••••"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-center font-mono text-xl tracking-[0.5em] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
    </div>
  );
}
