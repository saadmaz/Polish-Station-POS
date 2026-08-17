import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Delete, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useStaffList, type PublicStaff } from "@/lib/use-staff-list";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sign in · Polish Station OS" },
      { name: "description", content: "Staff login for Polish Station." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Login,
});

const PIN_LEN = 4;

function Login() {
  const { staff: active, loading: authLoading, mustChangePin, login } = useAuth();
  const { staffList, staffLoading } = useStaffList();
  const navigate = useNavigate();

  const [picked, setPicked] = useState<PublicStaff | null>(null);
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [locked, setLocked] = useState(0); // countdown seconds
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState<Date | null>(null);

  const trapRef = useRef<HTMLInputElement>(null);

  const ready = username.trim().length >= 3 && locked === 0 && !busy;

  function pick(staff: PublicStaff) {
    setPicked(staff);
    setUsername(staff.username);
    setPin("");
    setError(null);
  }

  function changeUser() {
    setPicked(null);
    setUsername("");
    setPin("");
    setError(null);
    setLocked(0);
  }

  // Clock
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Lockout countdown
  useEffect(() => {
    if (locked === 0) return;
    const t = setInterval(() => setLocked((l) => Math.max(0, l - 1)), 1000);
    return () => clearInterval(t);
  }, [locked]);

  // Focus the hidden keyboard trap as soon as a name is picked, so a physical
  // keyboard can drive the PIN pad without an extra click.
  useEffect(() => {
    if (picked) trapRef.current?.focus();
  }, [picked]);

  // While Firebase checks for an existing session, show nothing to prevent flash
  if (authLoading) return null;
  if (active) return <Navigate to={mustChangePin ? "/change-pin" : "/dashboard"} />;

  function pressDigit(d: string) {
    if (!ready || pin.length >= PIN_LEN) return;
    const next = pin + d;
    setPin(next);
    if (next.length === PIN_LEN) void tryLogin(next);
  }

  function backspace() {
    if (!ready) return;
    setPin((p) => p.slice(0, -1));
  }

  function clearPin() {
    if (!ready) return;
    setPin("");
  }

  function fail(message: string) {
    setError(message);
    setShake(true);
    setTimeout(() => {
      setPin("");
      setShake(false);
      trapRef.current?.focus();
    }, 600);
  }

  async function tryLogin(value: string) {
    setBusy(true);
    setError(null);

    const err = await login(username.trim(), value);

    if (!err) {
      // The auth provider decides where to land; a first login with an
      // admin-issued PIN must change it before reaching the app.
      navigate({ to: "/dashboard" });
      return;
    }

    setBusy(false);

    if (err.code === "locked") {
      setLocked(err.remainingSec);
      fail(`Too many attempts, locked for ${err.remainingSec}s`);
    } else if (err.code === "inactive") {
      fail("This account has been deactivated");
    } else if (err.code === "unknown") {
      fail("Couldn't reach the server, check your connection");
    } else {
      // Deliberately does not say which of the two was wrong.
      fail("Incorrect username or PIN");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!ready) return;
    if (/^\d$/.test(e.key)) pressDigit(e.key);
    else if (e.key === "Backspace") backspace();
    else if (e.key === "Delete" || e.key === "Escape") clearPin();
    else return; // let Tab, Shift, etc. behave normally
    e.preventDefault();
  }

  return (
    <div className="brushed-charcoal min-h-screen flex flex-col">
      <div className="flex-1 grid place-items-center px-4 py-10">
        <div className="w-full max-w-[440px] rounded-2xl bg-card text-card-foreground p-7 shadow-elevated border border-border">
          {/* Logo */}
          <div className="flex items-center justify-center gap-2.5 mb-1">
            <img
              src="/Logo/PS Logo Icon.png"
              alt="Polish Station"
              className="h-11 w-11 shrink-0 object-contain"
            />
            <div className="leading-tight">
              <div className="text-[10px] font-bold tracking-[0.28em] text-muted-foreground">
                POLISH STATION
              </div>
              <div className="text-base font-extrabold tracking-wide">OPERATIONS OS</div>
            </div>
          </div>
          <p className="text-center text-xs text-muted-foreground mb-5">
            {picked ? "Enter your 4-digit PIN" : "Who's clocking in?"}
          </p>

          {!picked ? (
            <StaffPicker staffList={staffList} loading={staffLoading} onPick={pick} />
          ) : (
            <>
              {/* Selected staff + change-user */}
              <button
                type="button"
                onClick={changeUser}
                disabled={busy}
                className="mb-5 flex w-full items-center gap-3 rounded-lg border border-input bg-background px-3 py-2.5 text-left transition-colors hover:border-primary/40 disabled:opacity-50"
              >
                <ArrowLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
                <Avatar staff={picked} className="h-8 w-8 text-xs" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{picked.name}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">Not you?</span>
              </button>

              {/* Hidden keyboard trap: lets a physical keyboard drive the PIN pad */}
              <input
                ref={trapRef}
                type="tel"
                inputMode="numeric"
                aria-hidden="true"
                tabIndex={-1}
                onKeyDown={handleKeyDown}
                onChange={() => {}}
                value=""
                className="sr-only"
              />

              {/* PIN dots */}
              <button
                type="button"
                onClick={() => trapRef.current?.focus()}
                aria-label="PIN entry"
                className={cn(
                  "flex w-full justify-center gap-4 mb-5 cursor-default",
                  shake && "animate-shake",
                )}
              >
                {Array.from({ length: PIN_LEN }).map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "h-4 w-4 rounded-full border-2 transition-colors",
                      shake
                        ? "border-primary bg-primary"
                        : i < pin.length
                          ? "border-foreground bg-foreground"
                          : "border-border bg-transparent",
                    )}
                  />
                ))}
              </button>

              {/* Error / lockout banner */}
              {error && (
                <div
                  role="alert"
                  className="mb-3 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-center text-xs font-semibold text-primary"
                >
                  {locked > 0 ? `Too many attempts, try again in ${locked}s` : error}
                </div>
              )}

              {/* Numpad */}
              <div className="grid grid-cols-3 gap-2.5">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                  <NumKey key={d} onClick={() => pressDigit(d)} disabled={!ready}>
                    {d}
                  </NumKey>
                ))}
                <NumKey onClick={clearPin} disabled={!ready} ghost>
                  C
                </NumKey>
                <NumKey onClick={() => pressDigit("0")} disabled={!ready}>
                  0
                </NumKey>
                <NumKey onClick={backspace} disabled={!ready} ghost>
                  {busy ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Delete className="h-5 w-5" />
                  )}
                </NumKey>
              </div>

              <p className="mt-4 text-center text-[11px] text-muted-foreground">
                Forgot your PIN? Ask a Manager or Admin to reset it.
              </p>
            </>
          )}
        </div>
      </div>

      <div
        suppressHydrationWarning
        className="pb-6 text-center font-mono text-xs text-white/40 min-h-[20px]"
      >
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
      type="button"
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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

function Avatar({ staff, className }: { staff: PublicStaff; className?: string }) {
  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-display font-bold text-white",
        className,
      )}
      style={{ backgroundColor: staff.color }}
    >
      {initials(staff.name)}
    </div>
  );
}

function StaffPicker({
  staffList,
  loading,
  onPick,
}: {
  staffList: PublicStaff[];
  loading: boolean;
  onPick: (staff: PublicStaff) => void;
}) {
  if (loading) {
    return (
      <div className="mb-2 grid place-items-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (staffList.length === 0) {
    return (
      <p className="mb-2 text-center text-xs text-muted-foreground py-10">
        No staff accounts yet. Ask an Admin to add one from Settings.
      </p>
    );
  }

  return (
    <div className="mb-2 grid grid-cols-2 gap-2.5 max-h-90 overflow-y-auto pr-0.5">
      {staffList.map((staff) => (
        <button
          key={staff.id}
          type="button"
          onClick={() => onPick(staff)}
          className="flex items-center gap-2.5 rounded-lg border border-input bg-background p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-muted/50 active:scale-[0.98]"
        >
          <Avatar staff={staff} className="h-9 w-9 text-sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{staff.name}</span>
            <span className="block truncate text-[11px] text-muted-foreground">{staff.role}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
