import { a as __toESM, n as require_react, t as require_jsx_runtime } from "./jsx-runtime-DqHqdqSU.js";
import { r as createLucideIcon, t as cn } from "./utils-CkbI-8f8.js";
import { t as ChevronRight } from "./chevron-right-_3FgaiGr.js";
import { t as Plus } from "./plus-D-lqgJ1T.js";
import { t as BOOKINGS } from "./mock-data-DAOLHDOp.js";
import { n as statusVariant, t as StatusChip } from "./status-chip-DRv2wCFu.js";
import { t as PageHeader } from "./page-header-DOu5wNGM.js";
/**
* @license lucide-react v0.575.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var ChevronLeft = createLucideIcon("chevron-left", [["path", {
	d: "m15 18-6-6 6-6",
	key: "1wnfg3"
}]]);
//#endregion
//#region src/routes/_app.bookings.tsx?tsr-split=component
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var HOURS = Array.from({ length: 11 }, (_, i) => 8 + i);
function Bookings() {
	const [view, setView] = (0, import_react.useState)("day");
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "p-6",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHeader, {
			title: "Bookings",
			subtitle: "Schedule appointments and walk-ins",
			actions: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "inline-flex rounded-md border border-input bg-background p-0.5 text-xs font-medium",
				children: [
					"day",
					"week",
					"list"
				].map((v) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					onClick: () => setView(v),
					className: cn("rounded-md px-3 py-1.5 capitalize", view === v ? "bg-charcoal text-charcoal-foreground" : "text-muted-foreground hover:text-foreground"),
					children: v
				}, v))
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
				className: "inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-red hover:bg-primary/90",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-4 w-4" }), " New Booking"]
			})] })
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "rounded-xl border border-border bg-card shadow-card",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center justify-between px-5 py-3 border-b border-border",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center gap-3",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								className: "rounded-md p-1.5 hover:bg-muted",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronLeft, { className: "h-4 w-4" })
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "font-display font-bold",
								children: "Today · Wed, Jun 17"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								className: "rounded-md p-1.5 hover:bg-muted",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronRight, { className: "h-4 w-4" })
							})
						]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "text-xs text-muted-foreground",
						children: "5 bays · 6 staff on shift"
					})]
				}),
				view === "day" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "grid grid-cols-[60px_repeat(5,1fr)] divide-x divide-border",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-10 border-b border-border" }), HOURS.map((h) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "h-16 border-b border-border px-2 py-1 text-[11px] font-mono text-muted-foreground",
						children: [String(h).padStart(2, "0"), ":00"]
					}, h))] }), Array.from({ length: 5 }).map((_, bay) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "relative",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "h-10 border-b border-border bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
							children: ["Bay ", bay + 1]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "relative",
							children: [HOURS.map((h) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-16 border-b border-border" }, h)), BOOKINGS.filter((_, i) => i % 5 === bay).map((b, idx) => {
								const [h, m] = b.time.split(":").map(Number);
								const startPx = (h - 8) * 64 + m / 60 * 64;
								const heightPx = Math.max(28, b.durationMin / 60 * 64 - 4);
								return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "absolute left-1.5 right-1.5 rounded-md border-l-[3px] border-primary bg-primary/8 px-2 py-1.5 hover:bg-primary/15 cursor-pointer overflow-hidden",
									style: {
										top: startPx,
										height: heightPx
									},
									title: `${b.customer} — ${b.service}`,
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "text-[11px] font-bold truncate",
											children: b.customer
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "text-[10px] text-muted-foreground truncate",
											children: b.service
										}),
										heightPx > 50 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "text-[10px] text-muted-foreground mt-0.5",
											children: [
												b.tech,
												" · ",
												idx % 2 === 0 ? "60m" : "30m"
											]
										})
									]
								}, b.id);
							})]
						})]
					}, bay))]
				}),
				view === "list" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
					className: "w-full text-sm",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
						className: "bg-charcoal text-charcoal-foreground text-[11px] uppercase tracking-wider",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "text-left px-5 py-2.5",
								children: "Time"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "text-left px-3 py-2.5",
								children: "Customer"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "text-left px-3 py-2.5",
								children: "Vehicle"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "text-left px-3 py-2.5",
								children: "Service"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "text-left px-3 py-2.5",
								children: "Tech"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "text-left px-3 py-2.5",
								children: "Status"
							})
						] })
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", {
						className: "divide-y divide-border",
						children: BOOKINGS.map((b) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
							className: "hover:bg-muted/40",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									className: "px-5 py-3 font-mono text-xs",
									children: b.time
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									className: "px-3 py-3 font-medium",
									children: b.customer
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									className: "px-3 py-3 text-muted-foreground",
									children: b.vehicle
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									className: "px-3 py-3",
									children: b.service
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									className: "px-3 py-3 text-muted-foreground",
									children: b.tech
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									className: "px-3 py-3",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, {
										variant: statusVariant(b.status),
										children: b.status
									})
								})
							]
						}, b.id))
					})]
				}),
				view === "week" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "overflow-x-auto",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "grid grid-cols-[60px_repeat(7,minmax(120px,1fr))] divide-x divide-border min-w-[900px]",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-10 border-b border-border" }), HOURS.map((h) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "h-14 border-b border-border px-2 py-1 text-[11px] font-mono text-muted-foreground",
							children: [String(h).padStart(2, "0"), ":00"]
						}, h))] }), [
							"Mon",
							"Tue",
							"Wed",
							"Thu",
							"Fri",
							"Sat",
							"Sun"
						].map((day, dayIdx) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "relative",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "h-10 border-b border-border bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
								children: [
									day,
									" ",
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-foreground/60 normal-case font-mono",
										children: 15 + dayIdx
									})
								]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "relative",
								children: [HOURS.map((h) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-14 border-b border-border" }, h)), BOOKINGS.filter((_, i) => (i + dayIdx) % 7 < 3).slice(0, 3).map((b) => {
									const [h, m] = b.time.split(":").map(Number);
									return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "absolute left-1 right-1 rounded-md border-l-[3px] border-primary bg-primary/10 px-1.5 py-1 hover:bg-primary/20 cursor-pointer overflow-hidden",
										style: {
											top: (h - 8) * 56 + m / 60 * 56,
											height: Math.max(24, b.durationMin / 60 * 56 - 4)
										},
										title: `${b.customer} — ${b.service}`,
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "text-[10px] font-bold truncate",
											children: b.customer
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "text-[10px] text-muted-foreground truncate",
											children: b.service
										})]
									}, b.id + day);
								})]
							})]
						}, day))]
					})
				})
			]
		})]
	});
}
//#endregion
export { Bookings as component };
