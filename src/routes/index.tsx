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
    <div className="brushed-charcoal relative min-h-screen flex flex-col">
      <div className="relative flex-1 grid place-items-center px-4 py-10">
        <div className="login-card-enter relative w-full max-w-[440px] overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-elevated">
          {/* Brand accent bar */}
          <div className="h-[3px] w-full bg-primary" />

          <div className="p-7 sm:p-8">
            {/* Logo */}
            <div className="mb-1 flex flex-col items-center gap-2.5">
              <img
                src="/Logo/PS Logo Icon.png"
                alt="Polish Station"
                className="h-12 w-12 shrink-0 object-contain"
              />
              <div className="text-center leading-tight">
                <div className="text-[10px] font-bold tracking-[0.32em] text-muted-foreground">
                  POLISH STATION
                </div>
                <div className="text-lg font-extrabold tracking-wide">OPERATIONS OS</div>
              </div>
            </div>

            <div className="mx-auto my-4 h-px w-14 bg-border" />

            <p className="mb-6 text-center text-[13px] text-muted-foreground">
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
                  className="group mb-6 flex w-full items-center gap-3 rounded-xl border border-border bg-background px-3.5 py-3 text-left transition-colors hover:border-primary/40 disabled:opacity-50"
                >
                  <ArrowLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <Avatar staff={picked} className="h-9 w-9 text-xs" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {picked.name}
                  </span>
                  <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
                    Not you?
                  </span>
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
                    "mb-6 flex w-full justify-center gap-4 cursor-default",
                    shake && "animate-shake",
                  )}
                >
                  {Array.from({ length: PIN_LEN }).map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "h-3.5 w-3.5 rounded-full border-2 transition-colors",
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
                    className="mb-4 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2.5 text-center text-xs font-semibold text-primary"
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

                <p className="mt-5 text-center text-[11px] text-muted-foreground">
                  Forgot your PIN? Ask a Manager or Admin to reset it.
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      <div
        suppressHydrationWarning
        className="pb-6 text-center font-mono text-xs text-white/40 min-h-5"
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
        @keyframes loginCardEnter { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        .login-card-enter { animation: loginCardEnter 0.35s ease-out; }
        @keyframes tileEnter { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }
        .tile-enter { animation: tileEnter 0.25s ease-out backwards; }
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
        "grid h-14 place-items-center rounded-xl font-display text-xl font-semibold transition-colors active:scale-95 disabled:opacity-40 disabled:active:scale-100",
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
      {staffList.map((staff, i) => (
        <button
          key={staff.id}
          type="button"
          onClick={() => onPick(staff)}
          style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
          className="tile-enter flex items-center gap-2.5 rounded-xl border border-border bg-background p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-muted/50 active:scale-[0.98]"
        >
          <Avatar staff={staff} className="h-9 w-9 text-sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{staff.name}</span>
            <span className="block truncate text-[11px] text-muted-foreground">
              @{staff.username}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
