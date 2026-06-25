import { a as __toESM, n as require_react, t as require_jsx_runtime } from "./jsx-runtime-DqHqdqSU.js";
import { n as useNavigate, t as Navigate } from "./useNavigate-CBff4ktO.js";
import { i as useAuth, r as STAFF } from "./auth-CgulVzRe.js";
import { r as createLucideIcon, t as cn } from "./utils-CkbI-8f8.js";
/**
* @license lucide-react v0.575.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var Delete = createLucideIcon("delete", [
	["path", {
		d: "M10 5a2 2 0 0 0-1.344.519l-6.328 5.74a1 1 0 0 0 0 1.481l6.328 5.741A2 2 0 0 0 10 19h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z",
		key: "1yo7s0"
	}],
	["path", {
		d: "m12 9 6 6",
		key: "anjzzh"
	}],
	["path", {
		d: "m18 9-6 6",
		key: "1fp51s"
	}]
]);
/**
* @license lucide-react v0.575.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var LoaderCircle = createLucideIcon("loader-circle", [["path", {
	d: "M21 12a9 9 0 1 1-6.219-8.56",
	key: "13zald"
}]]);
//#endregion
//#region src/routes/index.tsx?tsr-split=component
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function PinLogin() {
	const { staff: active, login } = useAuth();
	const navigate = useNavigate();
	const [selected, setSelected] = (0, import_react.useState)(null);
	const [pin, setPin] = (0, import_react.useState)("");
	const [error, setError] = (0, import_react.useState)(false);
	const [fails, setFails] = (0, import_react.useState)(0);
	const [locked, setLocked] = (0, import_react.useState)(0);
	const [busy, setBusy] = (0, import_react.useState)(false);
	const [now, setNow] = (0, import_react.useState)(null);
	(0, import_react.useEffect)(() => {
		setNow(/* @__PURE__ */ new Date());
		const t = setInterval(() => setNow(/* @__PURE__ */ new Date()), 1e3);
		return () => clearInterval(t);
	}, []);
	(0, import_react.useEffect)(() => {
		if (locked === 0) return;
		const t = setInterval(() => setLocked((l) => Math.max(0, l - 1)), 1e3);
		return () => clearInterval(t);
	}, [locked]);
	if (active) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Navigate, { to: "/dashboard" });
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
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "brushed-charcoal min-h-screen flex flex-col",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "flex-1 grid place-items-center px-4 py-10",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "w-full max-w-[440px] rounded-2xl bg-card text-card-foreground p-7 shadow-elevated border border-border",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center justify-center gap-2.5 mb-1",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "grid h-11 w-11 place-items-center rounded-lg gradient-brand shadow-red",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-display text-lg font-black text-primary-foreground",
									children: "PS"
								})
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "leading-tight",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "text-[10px] font-bold tracking-[0.28em] text-muted-foreground",
									children: "POLISH STATION"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "text-base font-extrabold tracking-wide",
									children: "OPERATIONS OS"
								})]
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-center text-xs text-muted-foreground mb-5",
							children: "Tap your name, then enter your PIN"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "-mx-1 mb-5 overflow-x-auto",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "flex gap-2 px-1 pb-1",
								children: STAFF.map((s) => {
									return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
										onClick: () => {
											setSelected(s);
											setPin("");
											setError(false);
										},
										className: cn("flex shrink-0 w-[72px] flex-col items-center gap-1.5 rounded-lg p-2 transition-all", selected?.id === s.id ? "bg-accent ring-2 ring-primary" : "hover:bg-muted"),
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
												className: "grid h-12 w-12 place-items-center rounded-full text-sm font-bold text-primary-foreground",
												style: { background: s.color },
												children: s.name.split(" ").map((p) => p[0]).join("")
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
												className: "text-[11px] font-medium leading-tight text-center truncate w-full",
												children: s.name.split(" ")[0]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
												className: "text-[9px] uppercase tracking-wider text-muted-foreground",
												children: s.role
											})
										]
									}, s.id);
								})
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: cn("flex justify-center gap-3 mb-5", error && "animate-shake"),
							children: Array.from({ length: pinLen }).map((_, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: cn("h-3.5 w-3.5 rounded-full border-2 transition-colors", error ? "border-primary bg-primary" : i < pin.length ? "border-foreground bg-foreground" : "border-border bg-transparent") }, i))
						}),
						locked > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mb-3 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-center text-xs font-semibold text-primary",
							children: [
								"Locked out — try again in ",
								locked,
								"s"
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
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
								].map((d) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NumKey, {
									onClick: () => press(d),
									disabled: !selected || locked > 0 || busy,
									children: d
								}, d)),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NumKey, {
									onClick: () => setPin(""),
									disabled: !selected || locked > 0 || busy,
									ghost: true,
									children: "C"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NumKey, {
									onClick: () => press("0"),
									disabled: !selected || locked > 0 || busy,
									children: "0"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NumKey, {
									onClick: () => setPin((p) => p.slice(0, -1)),
									disabled: !selected || locked > 0 || busy,
									ghost: true,
									children: busy ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, { className: "h-5 w-5 animate-spin" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Delete, { className: "h-5 w-5" })
								})
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-4 flex items-center justify-between text-[11px] text-muted-foreground",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								className: "hover:text-foreground",
								children: "Forgot PIN?"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								className: "hover:text-foreground",
								children: "Guest Checkout →"
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-3 rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-center text-[10px] text-muted-foreground",
							children: [
								"Demo PIN for all roles:",
								" ",
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-mono font-bold text-foreground",
									children: "12345"
								})
							]
						})
					]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
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
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("style", { children: `
        @keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-6px)} 75%{transform:translateX(6px)} }
        .animate-shake { animation: shake 0.35s ease-in-out; }
      ` })
		]
	});
}
function NumKey({ children, onClick, disabled, ghost }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		onClick,
		disabled,
		className: cn("grid h-14 place-items-center rounded-lg font-display text-xl font-semibold transition-all active:scale-95 disabled:opacity-40 disabled:active:scale-100", ghost ? "bg-muted text-muted-foreground hover:bg-muted/70" : "bg-charcoal text-charcoal-foreground hover:bg-charcoal/90"),
		children
	});
}
//#endregion
export { PinLogin as component };
