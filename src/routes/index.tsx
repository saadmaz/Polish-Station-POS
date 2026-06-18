import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Delete, Loader2 } from "lucide-react";
import { STAFF, useAuth, type Staff } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sign in — Polish Station OS" },
      { name: "description", content: "PIN login for Polish Station staff." },
    ],
  }),
  component: PinLogin,
});

function PinLogin() {
  const { staff: active, login } = useAuth();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Staff | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [fails, setFails] = useState(0);
  const [locked, setLocked] = useState(0);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (locked === 0) return;
    const t = setInterval(() => setLocked((l) => Math.max(0, l - 1)), 1000);
    return () => clearInterval(t);
  }, [locked]);

  if (active) return <Navigate to="/dashboard" />;

  const pinLen = 5;

  function press(d: string) {
    if (!selected || locked > 0 || busy) return;
    if (pin.length >= pinLen) return;
    const next = pin + d;
    setPin(next);
    if (next.length === pinLen) tryLogin(next);
  }

  function tryLogin(value: string) {
    if (!selected) return;
    setBusy(true);
    setTimeout(() => {
      if (value === selected.pin) {
        login(selected);
        navigate({ to: "/dashboard" });
      } else {
        setError(true);
        setFails((f) => {
          const nf = f + 1;
          if (nf >= 3) setLocked(60);
          return nf;
        });
        setTimeout(() => {
          setPin("");
          setError(false);
        }, 600);
      }
      setBusy(false);
    }, 250);
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
            Tap your name, then enter your PIN
          </p>

          {/* Staff selector */}
          <div className="-mx-1 mb-5 overflow-x-auto">
            <div className="flex gap-2 px-1 pb-1">
              {STAFF.map((s) => {
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
                      "flex shrink-0 w-[72px] flex-col items-center gap-1.5 rounded-lg p-2 transition-all",
                      isSel ? "bg-accent ring-2 ring-primary" : "hover:bg-muted",
                    )}
                  >
                    <div
                      className="grid h-12 w-12 place-items-center rounded-full text-sm font-bold text-primary-foreground"
                      style={{ background: s.color }}
                    >
                      {s.name.split(" ").map((p) => p[0]).join("")}
                    </div>
                    <div className="text-[11px] font-medium leading-tight text-center truncate w-full">
                      {s.name.split(" ")[0]}
                    </div>
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
                      {s.role}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* PIN dots */}
          <div className={cn("flex justify-center gap-3 mb-5", error && "animate-shake")}>
            {Array.from({ length: pinLen }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-3.5 w-3.5 rounded-full border-2 transition-colors",
                  error
                    ? "border-primary bg-primary"
                    : i < pin.length
                      ? "border-foreground bg-foreground"
                      : "border-border bg-transparent",
                )}
              />
            ))}
          </div>

          {locked > 0 && (
            <div className="mb-3 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-center text-xs font-semibold text-primary">
              Locked out — try again in {locked}s
            </div>
          )}

          {/* Numpad */}
          <div className="grid grid-cols-3 gap-2.5">
            {["1","2","3","4","5","6","7","8","9"].map((d) => (
              <NumKey key={d} onClick={() => press(d)} disabled={!selected || locked > 0 || busy}>
                {d}
              </NumKey>
            ))}
            <NumKey onClick={() => setPin("")} disabled={!selected || locked > 0 || busy} ghost>
              C
            </NumKey>
            <NumKey onClick={() => press("0")} disabled={!selected || locked > 0 || busy}>
              0
            </NumKey>
            <NumKey
              onClick={() => setPin((p) => p.slice(0, -1))}
              disabled={!selected || locked > 0 || busy}
              ghost
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Delete className="h-5 w-5" />}
            </NumKey>
          </div>

          <div className="mt-4 flex items-center justify-between text-[11px] text-muted-foreground">
            <button className="hover:text-foreground">Forgot PIN?</button>
            <button className="hover:text-foreground">Guest Checkout →</button>
          </div>
          <div className="mt-3 rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-center text-[10px] text-muted-foreground">
            Demo PIN for all roles: <span className="font-mono font-bold text-foreground">12345</span>
          </div>
        </div>
      </div>
      <div suppressHydrationWarning className="pb-6 text-center font-mono text-xs text-white/40 min-h-[20px]">
        {now
          ? now.toLocaleString([], {
              weekday: "short",
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
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
  children,
  onClick,
  disabled,
  ghost,
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
