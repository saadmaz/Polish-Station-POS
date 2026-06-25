import { i as useAuth, r as STAFF } from "./auth-BDKp4kVI.js";
import { t as cn } from "./utils-C_uf36nf.js";
import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "@tanstack/react-router";
import { jsx, jsxs } from "react/jsx-runtime";
import { Delete, Loader2 } from "lucide-react";
//#region src/routes/index.tsx?tsr-split=component
function PinLogin() {
	const { staff: active, login } = useAuth();
	const navigate = useNavigate();
	const [selected, setSelected] = useState(null);
	const [pin, setPin] = useState("");
	const [error, setError] = useState(false);
	const [fails, setFails] = useState(0);
	const [locked, setLocked] = useState(0);
	const [busy, setBusy] = useState(false);
	const [now, setNow] = useState(null);
	useEffect(() => {
		setNow(/* @__PURE__ */ new Date());
		const t = setInterval(() => setNow(/* @__PURE__ */ new Date()), 1e3);
		return () => clearInterval(t);
	}, []);
	useEffect(() => {
		if (locked === 0) return;
		const t = setInterval(() => setLocked((l) => Math.max(0, l - 1)), 1e3);
		return () => clearInterval(t);
	}, [locked]);
	if (active) return /* @__PURE__ */ jsx(Navigate, { to: "/dashboard" });
	const pinLen = 5;
	function press(d) {
		if (!selected || locked > 0 || busy) return;
		if (pin.length >= pinLen) return;
		const next = pin + d;
		setPin(next);
		if (next.length === pinLen) tryLogin(next);
	}
	function tryLogin(value) {
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
	return /* @__PURE__ */ jsxs("div", {
		className: "brushed-charcoal min-h-screen flex flex-col",
		children: [
			/* @__PURE__ */ jsx("div", {
				className: "flex-1 grid place-items-center px-4 py-10",
				children: /* @__PURE__ */ jsxs("div", {
					className: "w-full max-w-[440px] rounded-2xl bg-card text-card-foreground p-7 shadow-elevated border border-border",
					children: [
						/* @__PURE__ */ jsxs("div", {
							className: "flex items-center justify-center gap-2.5 mb-1",
							children: [/* @__PURE__ */ jsx("div", {
								className: "grid h-11 w-11 place-items-center rounded-lg gradient-brand shadow-red",
								children: /* @__PURE__ */ jsx("span", {
									className: "font-display text-lg font-black text-primary-foreground",
									children: "PS"
								})
							}), /* @__PURE__ */ jsxs("div", {
								className: "leading-tight",
								children: [/* @__PURE__ */ jsx("div", {
									className: "text-[10px] font-bold tracking-[0.28em] text-muted-foreground",
									children: "POLISH STATION"
								}), /* @__PURE__ */ jsx("div", {
									className: "text-base font-extrabold tracking-wide",
									children: "OPERATIONS OS"
								})]
							})]
						}),
						/* @__PURE__ */ jsx("p", {
							className: "text-center text-xs text-muted-foreground mb-5",
							children: "Tap your name, then enter your PIN"
						}),
						/* @__PURE__ */ jsx("div", {
							className: "-mx-1 mb-5 overflow-x-auto",
							children: /* @__PURE__ */ jsx("div", {
								className: "flex gap-2 px-1 pb-1",
								children: STAFF.map((s) => {
									return /* @__PURE__ */ jsxs("button", {
										onClick: () => {
											setSelected(s);
											setPin("");
											setError(false);
										},
										className: cn("flex shrink-0 w-[72px] flex-col items-center gap-1.5 rounded-lg p-2 transition-all", selected?.id === s.id ? "bg-accent ring-2 ring-primary" : "hover:bg-muted"),
										children: [
											/* @__PURE__ */ jsx("div", {
												className: "grid h-12 w-12 place-items-center rounded-full text-sm font-bold text-primary-foreground",
												style: { background: s.color },
												children: s.name.split(" ").map((p) => p[0]).join("")
											}),
											/* @__PURE__ */ jsx("div", {
												className: "text-[11px] font-medium leading-tight text-center truncate w-full",
												children: s.name.split(" ")[0]
											}),
											/* @__PURE__ */ jsx("div", {
												className: "text-[9px] uppercase tracking-wider text-muted-foreground",
												children: s.role
											})
										]
									}, s.id);
								})
							})
						}),
						/* @__PURE__ */ jsx("div", {
							className: cn("flex justify-center gap-3 mb-5", error && "animate-shake"),
							children: Array.from({ length: pinLen }).map((_, i) => /* @__PURE__ */ jsx("div", { className: cn("h-3.5 w-3.5 rounded-full border-2 transition-colors", error ? "border-primary bg-primary" : i < pin.length ? "border-foreground bg-foreground" : "border-border bg-transparent") }, i))
						}),
						locked > 0 && /* @__PURE__ */ jsxs("div", {
							className: "mb-3 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-center text-xs font-semibold text-primary",
							children: [
								"Locked out — try again in ",
								locked,
								"s"
							]
						}),
						/* @__PURE__ */ jsxs("div", {
							className: "grid grid-cols-3 gap-2.5",
							children: [
								[
									"1",
									"2",
									"3",
									"4",
									"5",
									"6",
									"7",
									"8",
									"9"
								].map((d) => /* @__PURE__ */ jsx(NumKey, {
									onClick: () => press(d),
									disabled: !selected || locked > 0 || busy,
									children: d
								}, d)),
								/* @__PURE__ */ jsx(NumKey, {
									onClick: () => setPin(""),
									disabled: !selected || locked > 0 || busy,
									ghost: true,
									children: "C"
								}),
								/* @__PURE__ */ jsx(NumKey, {
									onClick: () => press("0"),
									disabled: !selected || locked > 0 || busy,
									children: "0"
								}),
								/* @__PURE__ */ jsx(NumKey, {
									onClick: () => setPin((p) => p.slice(0, -1)),
									disabled: !selected || locked > 0 || busy,
									ghost: true,
									children: busy ? /* @__PURE__ */ jsx(Loader2, { className: "h-5 w-5 animate-spin" }) : /* @__PURE__ */ jsx(Delete, { className: "h-5 w-5" })
								})
							]
						}),
						/* @__PURE__ */ jsxs("div", {
							className: "mt-4 flex items-center justify-between text-[11px] text-muted-foreground",
							children: [/* @__PURE__ */ jsx("button", {
								className: "hover:text-foreground",
								children: "Forgot PIN?"
							}), /* @__PURE__ */ jsx("button", {
								className: "hover:text-foreground",
								children: "Guest Checkout →"
							})]
						}),
						/* @__PURE__ */ jsxs("div", {
							className: "mt-3 rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-center text-[10px] text-muted-foreground",
							children: [
								"Demo PIN for all roles:",
								" ",
								/* @__PURE__ */ jsx("span", {
									className: "font-mono font-bold text-foreground",
									children: "12345"
								})
							]
						})
					]
				})
			}),
			/* @__PURE__ */ jsx("div", {
				suppressHydrationWarning: true,
				className: "pb-6 text-center font-mono text-xs text-white/40 min-h-[20px]",
				children: now ? now.toLocaleString([], {
					weekday: "short",
					day: "numeric",
					month: "short",
					hour: "2-digit",
					minute: "2-digit",
					second: "2-digit"
				}) : ""
			}),
			/* @__PURE__ */ jsx("style", { children: `
        @keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-6px)} 75%{transform:translateX(6px)} }
        .animate-shake { animation: shake 0.35s ease-in-out; }
      ` })
		]
	});
}
function NumKey({ children, onClick, disabled, ghost }) {
	return /* @__PURE__ */ jsx("button", {
		onClick,
		disabled,
		className: cn("grid h-14 place-items-center rounded-lg font-display text-xl font-semibold transition-all active:scale-95 disabled:opacity-40 disabled:active:scale-100", ghost ? "bg-muted text-muted-foreground hover:bg-muted/70" : "bg-charcoal text-charcoal-foreground hover:bg-charcoal/90"),
		children
	});
}
//#endregion
export { PinLogin as component };
