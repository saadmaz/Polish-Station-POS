import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Loader2, LogIn } from "lucide-react";
import { STAFF, useAuth, type Staff } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sign in — Polish Station OS" },
      { name: "description", content: "Staff login for Polish Station." },
    ],
  }),
  component: Login,
});

function Login() {
  const { staff: active, login } = useAuth();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Staff | null>(null);
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState(false);
  const [fails, setFails] = useState(0);
  const [locked, setLocked] = useState(0);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (selected && inputRef.current) {
      inputRef.current.focus();
    }
  }, [selected]);

  if (active) return <Navigate to="/dashboard" />;

  function selectStaff(s: Staff) {
    setSelected(s);
    setPassword("");
    setError(false);
  }

  function tryLogin() {
    if (!selected || locked > 0 || busy || !password) return;
    setBusy(true);
    setTimeout(() => {
      if (password === selected.password) {
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
          setPassword("");
          setError(false);
          inputRef.current?.focus();
        }, 600);
      }
      setBusy(false);
    }, 250);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") tryLogin();
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
            Select your name, then enter your password
          </p>

          {/* Staff selector */}
          <div className="-mx-1 mb-5 overflow-x-auto">
            <div className="flex gap-2 px-1 pb-1">
              {STAFF.map((s) => {
                const isSel = selected?.id === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => selectStaff(s)}
                    className={cn(
                      "flex shrink-0 w-[72px] flex-col items-center gap-1.5 rounded-lg p-2 transition-all",
                      isSel ? "bg-accent ring-2 ring-primary" : "hover:bg-muted",
                    )}
                  >
                    <div
                      className="grid h-12 w-12 place-items-center rounded-full text-sm font-bold text-primary-foreground"
                      style={{ background: s.color }}
                    >
                      {s.name
                        .split(" ")
                        .map((p) => p[0])
                        .join("")}
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

          {/* Password field */}
          <div className={cn("mb-4", error && "animate-shake")}>
            <div className="relative">
              <input
                ref={inputRef}
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={!selected || locked > 0 || busy}
                placeholder={selected ? `Password for ${selected.name.split(" ")[0]}` : "Select a staff member first"}
                className={cn(
                  "w-full rounded-lg border px-4 py-3 pr-10 text-sm font-medium bg-background transition-colors outline-none",
                  "placeholder:text-muted-foreground/60",
                  "disabled:opacity-40 disabled:cursor-not-allowed",
                  error
                    ? "border-primary text-primary focus:ring-2 focus:ring-primary/30"
                    : "border-border focus:border-primary focus:ring-2 focus:ring-primary/20",
                )}
                autoComplete="current-password"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPw((v) => !v)}
                disabled={!selected || locked > 0}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {error && (
              <p className="mt-1.5 text-xs text-primary font-medium px-1">
                Incorrect password{fails >= 2 ? ` — ${3 - fails} attempt${3 - fails === 1 ? "" : "s"} left` : ""}
              </p>
            )}
          </div>

          {locked > 0 && (
            <div className="mb-3 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-center text-xs font-semibold text-primary">
              Locked out — try again in {locked}s
            </div>
          )}

          {/* Sign in button */}
          <button
            onClick={tryLogin}
            disabled={!selected || !password || locked > 0 || busy}
            className={cn(
              "w-full flex items-center justify-center gap-2 rounded-lg py-3 font-semibold text-sm transition-all",
              "bg-charcoal text-charcoal-foreground hover:bg-charcoal/90",
              "disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]",
            )}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogIn className="h-4 w-4" />
            )}
            Sign In
          </button>

          <div className="mt-4 flex items-center justify-between text-[11px] text-muted-foreground">
            <button className="hover:text-foreground">Forgot password?</button>
            <button className="hover:text-foreground">Guest Checkout →</button>
          </div>

          {/* Demo credentials */}
          <div className="mt-3 rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-[10px] text-muted-foreground space-y-0.5">
            <div className="font-semibold text-foreground mb-1">Demo passwords by role</div>
            {[
              { role: "Admin", pw: "admin@ps" },
              { role: "Manager", pw: "mgr@ps" },
              { role: "Advisor", pw: "advisor@ps" },
              { role: "Cashier", pw: "cashier@ps" },
              { role: "Technician", pw: "tech@ps" },
            ].map(({ role, pw }) => (
              <div key={role} className="flex justify-between">
                <span className="uppercase tracking-wider">{role}</span>
                <span className="font-mono font-bold text-foreground">{pw}</span>
              </div>
            ))}
          </div>
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
