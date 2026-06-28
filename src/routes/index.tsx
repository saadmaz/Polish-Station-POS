import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Delete, Loader2 } from "lucide-react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth, type StaffProfile } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sign in — Polish Station OS" },
      { name: "description", content: "Staff login for Polish Station." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PinLogin,
});

const PIN_LEN = 4;

function PinLogin() {
  const { staff: active, loading: authLoading, login } = useAuth();
  const navigate = useNavigate();

  // Staff list loaded from Firestore (public collection — no auth required)
  const [staffList,    setStaffList]    = useState<StaffProfile[]>([]);
  const [staffLoading, setStaffLoading] = useState(true);

  const [selected, setSelected] = useState<StaffProfile | null>(null);
  const [pin,      setPin]      = useState("");
  const [error,    setError]    = useState(false);
  const [locked,   setLocked]   = useState(0); // countdown seconds
  const [busy,     setBusy]     = useState(false);
  const [now,      setNow]      = useState<Date | null>(null);

  const trapRef = useRef<HTMLInputElement>(null);

  // Clock
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Lockout countdown
  useEffect(() => {
    if (locked === 0) return;
    const t = setInterval(() => setLocked(l => Math.max(0, l - 1)), 1000);
    return () => clearInterval(t);
  }, [locked]);

  // Auto-focus keyboard trap when staff is selected
  useEffect(() => {
    if (selected) trapRef.current?.focus();
  }, [selected]);

  // Load staff list from Firestore
  useEffect(() => {
    getDocs(collection(db, "staff_public"))
      .then(snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as StaffProfile));
        setStaffList(list);
      })
      .catch(err => console.error("Failed to load staff list:", err))
      .finally(() => setStaffLoading(false));
  }, []);

  // While Firebase checks for an existing session, show nothing to prevent flash
  if (authLoading) return null;
  if (active) return <Navigate to="/dashboard" />;

  function pressDigit(d: string) {
    if (!selected || locked > 0 || busy) return;
    if (pin.length >= PIN_LEN) return;
    const next = pin + d;
    setPin(next);
    if (next.length === PIN_LEN) void tryLogin(next);
  }

  function backspace() {
    if (!selected || locked > 0 || busy) return;
    setPin(p => p.slice(0, -1));
  }

  function clearPin() {
    if (!selected || locked > 0 || busy) return;
    setPin("");
  }

  async function tryLogin(value: string) {
    if (!selected) return;
    setBusy(true);

    const err = await login(selected.id, value);

    if (!err) {
      // Success — onAuthStateChanged in AuthProvider will set staff and trigger redirect
      navigate({ to: "/dashboard" });
      return;
    }

    if (err.code === "locked") {
      setLocked(err.remainingSec);
    }

    setError(true);
    setTimeout(() => {
      setPin("");
      setError(false);
      trapRef.current?.focus();
    }, 600);

    setBusy(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (locked > 0 || busy || !selected) return;
    if (/^\d$/.test(e.key))                 pressDigit(e.key);
    else if (e.key === "Backspace")          backspace();
    else if (e.key === "Delete" || e.key === "Escape") clearPin();
    e.preventDefault();
  }

  return (
    <div className="brushed-charcoal min-h-screen flex flex-col">
      <div className="flex-1 grid place-items-center px-4 py-10">
        <div className="w-full max-w-[440px] rounded-2xl bg-card text-card-foreground p-7 shadow-elevated border border-border">

          {/* Logo */}
          <div className="flex items-center justify-center gap-2.5 mb-1">
            <div className="grid h-11 w-11 place-items-center rounded-lg gradient-brand shadow-red">
              <span className="font-display text-lg font-black text-primary-foreground">PS</span>
            </div>
            <div className="leading-tight">
              <div className="text-[10px] font-bold tracking-[0.28em] text-muted-foreground">
                POLISH STATION
              </div>
              <div className="text-base font-extrabold tracking-wide">OPERATIONS OS</div>
            </div>
          </div>
          <p className="text-center text-xs text-muted-foreground mb-5">
            Select your name, then enter your 4-digit PIN
          </p>

          {/* Hidden keyboard trap */}
          <input
            ref={trapRef}
            type="tel"
            inputMode="numeric"
            aria-hidden="true"
            tabIndex={selected ? 0 : -1}
            onKeyDown={handleKeyDown}
            onChange={() => {}}
            value=""
            className="sr-only"
          />

          {/* Staff selector */}
          <div className="-mx-1 mb-5 overflow-x-auto">
            {staffLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="flex gap-2 px-1 pb-1">
                {staffList.map(s => {
                  const isSel = selected?.id === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => {
                        setSelected(s);
                        setPin("");
                        setError(false);
                      }}
                      className={cn(
                        "flex shrink-0 w-[68px] flex-col items-center gap-1.5 rounded-lg p-2 transition-all",
                        isSel ? "bg-accent ring-2 ring-primary" : "hover:bg-muted",
                      )}
                    >
                      <div
                        className="grid h-11 w-11 place-items-center rounded-full text-sm font-bold text-primary-foreground"
                        style={{ background: s.color }}
                      >
                        {s.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="text-[11px] font-medium leading-tight text-center truncate w-full">
                        {s.name}
                      </div>
                      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
                        {s.role}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* PIN dots */}
          <div className={cn("flex justify-center gap-4 mb-5", error && "animate-shake")}>
            {Array.from({ length: PIN_LEN }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-4 w-4 rounded-full border-2 transition-colors",
                  error
                    ? "border-primary bg-primary"
                    : i < pin.length
                      ? "border-foreground bg-foreground"
                      : "border-border bg-transparent",
                )}
              />
            ))}
          </div>

          {/* Lockout banner */}
          {locked > 0 && (
            <div className="mb-3 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-center text-xs font-semibold text-primary">
              Too many attempts — try again in {locked}s
            </div>
          )}

          {/* Numpad */}
          <div className="grid grid-cols-3 gap-2.5">
            {["1","2","3","4","5","6","7","8","9"].map(d => (
              <NumKey key={d} onClick={() => pressDigit(d)} disabled={!selected || locked > 0 || busy}>
                {d}
              </NumKey>
            ))}
            <NumKey onClick={clearPin} disabled={!selected || locked > 0 || busy} ghost>
              C
            </NumKey>
            <NumKey onClick={() => pressDigit("0")} disabled={!selected || locked > 0 || busy}>
              0
            </NumKey>
            <NumKey onClick={backspace} disabled={!selected || locked > 0 || busy} ghost>
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Delete className="h-5 w-5" />}
            </NumKey>
          </div>

          <p className="mt-4 text-center text-[11px] text-muted-foreground">
            Forgot your PIN? Ask a Manager or Admin to reset it.
          </p>
        </div>
      </div>

      <div
        suppressHydrationWarning
        className="pb-6 text-center font-mono text-xs text-white/40 min-h-[20px]"
      >
        {now
          ? now.toLocaleString([], {
              weekday: "short", day: "numeric", month: "short",
              hour: "2-digit", minute: "2-digit", second: "2-digit",
            })
          : ""}
      </div>

      <style>{`
        @keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-6px)} 75%{transform:translateX(6px)} }
        .animate-shake { animation: shake 0.35s ease-in-out; }
      `}</style>
    </div>
  );
}

function NumKey({
  children, onClick, disabled, ghost,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  ghost?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "grid h-14 place-items-center rounded-lg font-display text-xl font-semibold transition-all active:scale-95 disabled:opacity-40 disabled:active:scale-100",
        ghost
          ? "bg-muted text-muted-foreground hover:bg-muted/70"
          : "bg-charcoal text-charcoal-foreground hover:bg-charcoal/90",
      )}
    >
      {children}
    </button>
  );
}
