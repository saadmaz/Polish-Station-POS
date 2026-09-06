// Step-up re-authentication: re-proves the signed-in user's own PIN before a
// sensitive action (deleting a record, changing another user's access,
// exporting data), even inside an already auto-resumed session -- an
// unattended unlocked tablet alone shouldn't be enough for either.
//
//   const { requireStepUp, StepUpDialog } = useStepUpAuth();
//   ...
//   async function handleDelete() {
//     if (!(await confirm({ title: `Delete "${item.name}"?` }))) return;
//     if (!(await requireStepUp())) return;
//     deleteItem(item.id);
//   }
//   return <>{StepUpDialog}...</>;
//
// One hook call per component covers every step-up gate it needs, same as
// useConfirm (src/hooks/use-confirm.tsx) -- each call to `requireStepUp()`
// reuses the single dialog.
import { useCallback, useEffect, useRef, useState } from "react";
import { auth as firebaseAuth } from "@/lib/firebase";
import { verifyStepUpPinFn } from "@/server/auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const PIN_LEN = 4;
const STEP_UP_TIMEOUT_MS = 20_000;

class StepUpSessionExpiredError extends Error {}

function withStepUpTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timed out")), STEP_UP_TIMEOUT_MS),
    ),
  ]);
}

export function useStepUpAuth() {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  const settle = useCallback((ok: boolean) => {
    setOpen(false);
    setPin("");
    setError(null);
    setBusy(false);
    resolveRef.current?.(ok);
    resolveRef.current = null;
  }, []);

  const requireStepUp = useCallback((): Promise<boolean> => {
    setPin("");
    setError(null);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const submit = useCallback(
    async (value: string) => {
      setBusy(true);
      setError(null);
      try {
        // The whole round trip -- including the client-side getIdToken()
        // call, not just the server request -- must sit under one timeout.
        // getIdToken() can itself stall (a flaky connection, the SDK stuck
        // silently refreshing an expired token) with no timeout of its own,
        // which used to leave `busy` stuck true forever: pressDigit() and
        // backspace() both bail out while busy, so the keypad looked dead
        // with no way back short of dismissing the whole dialog.
        const result = await withStepUpTimeout(
          (async () => {
            const idToken = await firebaseAuth.currentUser?.getIdToken();
            if (!idToken) throw new StepUpSessionExpiredError();
            return verifyStepUpPinFn({ data: { idToken, pin: value } });
          })(),
        );
        if (result.success) {
          settle(true);
        } else {
          setError("Incorrect PIN");
          setBusy(false);
          setPin("");
        }
      } catch (err) {
        setError(
          err instanceof StepUpSessionExpiredError
            ? "Your session has expired. Sign in again."
            : "Couldn't reach the server, check your connection",
        );
        setBusy(false);
        setPin("");
      }
    },
    [settle],
  );

  const pressDigit = useCallback(
    (d: string) => {
      if (busy || pin.length >= PIN_LEN) return;
      const next = pin + d;
      setPin(next);
      if (next.length === PIN_LEN) void submit(next);
    },
    [busy, pin, submit],
  );

  const backspace = useCallback(() => {
    if (busy) return;
    setPin((p) => p.slice(0, -1));
  }, [busy]);

  // The dialog only ever exposed an on-screen keypad -- no <input> and no
  // keydown handler -- so a physical keyboard did nothing at all. Listen
  // globally rather than putting a keydown handler on the dialog content:
  // Radix's focus trap moves focus into DialogContent, but wherever focus
  // lands, the event still bubbles to window, so this catches digits/
  // backspace regardless of which element inside the dialog is focused.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        pressDigit(e.key);
      } else if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        backspace();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, pressDigit, backspace]);

  const StepUpDialog = (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) settle(false);
      }}
    >
      <DialogContent className="max-w-[300px]">
        <DialogHeader>
          <DialogTitle>Confirm your PIN</DialogTitle>
          <DialogDescription>Re-enter your PIN to continue.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-1">
          <div className="flex gap-3">
            {Array.from({ length: PIN_LEN }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-3 w-3 rounded-full border-2 transition-colors",
                  i < pin.length
                    ? "border-foreground bg-foreground"
                    : "border-border bg-transparent",
                )}
              />
            ))}
          </div>
          {error && <p className="text-xs font-medium text-destructive">{error}</p>}
          <div className="grid w-full grid-cols-3 gap-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => pressDigit(d)}
                disabled={busy}
                className="h-11 rounded-lg bg-muted text-base font-semibold transition-colors hover:bg-muted/70 disabled:opacity-40"
              >
                {d}
              </button>
            ))}
            <div />
            <button
              type="button"
              onClick={() => pressDigit("0")}
              disabled={busy}
              className="h-11 rounded-lg bg-muted text-base font-semibold transition-colors hover:bg-muted/70 disabled:opacity-40"
            >
              0
            </button>
            <button
              type="button"
              onClick={backspace}
              disabled={busy}
              className="h-11 rounded-lg bg-muted text-base font-semibold transition-colors hover:bg-muted/70 disabled:opacity-40"
            >
              ⌫
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  return { requireStepUp, StepUpDialog };
}
