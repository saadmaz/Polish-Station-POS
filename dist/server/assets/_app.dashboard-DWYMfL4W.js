import { t as require_jsx_runtime } from "./jsx-runtime-DqHqdqSU.js";
import { r as createLucideIcon, t as cn } from "./utils-CkbI-8f8.js";
import { t as TriangleAlert } from "./triangle-alert--aJ_Ghea.js";
import { a as JOBS, r as INVENTORY, t as BOOKINGS } from "./mock-data-DAOLHDOp.js";
import { n as statusVariant, t as StatusChip } from "./status-chip-DRv2wCFu.js";
import { t as PageHeader } from "./page-header-DOu5wNGM.js";
/**
* @license lucide-react v0.575.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var RefreshCw = createLucideIcon("refresh-cw", [
	["path", {
		d: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",
		key: "v9h5vc"
	}],
	["path", {
		d: "M21 3v5h-5",
		key: "1q7to0"
	}],
	["path", {
		d: "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",
		key: "3uifl3"
	}],
	["path", {
		d: "M8 16H3v5",
		key: "1cv678"
	}]
]);
/**
* @license lucide-react v0.575.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var TrendingDown = createLucideIcon("trending-down", [["path", {
	d: "M16 17h6v-6",
	key: "t6n2it"
}], ["path", {
	d: "m22 17-8.5-8.5-5 5L2 7",
	key: "x473p"
}]]);
/**
* @license lucide-react v0.575.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var TrendingUp = createLucideIcon("trending-up", [["path", {
	d: "M16 7h6v6",
	key: "box55l"
}], ["path", {
	d: "m22 7-8.5 8.5-5-5L2 17",
	key: "1t1m79"
}]]);
//#endregion
//#region src/routes/_app.dashboard.tsx?tsr-split=component
var import_jsx_runtime = require_jsx_runtime();
var KPIS = [
	{
		label: "Revenue Today",
		value: "LKR 184,200",
		delta: 12.4,
		up: true
	},
	{
		label: "Jobs Completed",
		value: "14",
		delta: 6,
		up: true
	},
	{
		label: "In Progress",
		value: "5",
		delta: -1,
		up: false
	},
	{
		label: "Upcoming (4h)",
		value: "8",
		delta: 3,
		up: true
	},
	{
		label: "Avg Duration",
		value: "1h 42m",
		delta: -8.2,
		up: true
	},
	{
		label: "Outstanding",
		value: "LKR 26,500",
		delta: 2,
		up: false
	}
];
function Sparkline({ up }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
		viewBox: "0 0 70 22",
		className: "h-6 w-20",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("polyline", {
			points: up ? "0,18 10,14 20,16 30,10 40,12 50,6 60,8 70,3" : "0,4 10,8 20,6 30,12 40,10 50,15 60,13 70,18",
			fill: "none",
			stroke: up ? "var(--success)" : "var(--primary)",
			strokeWidth: "1.5"
		})
	});
}
function Dashboard() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "p-6",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHeader, {
				title: "Operations Dashboard",
				subtitle: "Live snapshot · auto-refreshing every 30s",
				actions: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					className: "inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RefreshCw, { className: "h-3.5 w-3.5" }), " Refresh"]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6",
				children: KPIS.map((k) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "rounded-xl border border-border bg-card p-4 shadow-card",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-[11px] uppercase tracking-wider text-muted-foreground font-semibold",
							children: k.label
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "mt-1.5 font-display text-xl font-bold",
							children: k.value
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-2 flex items-center justify-between",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: cn("flex items-center gap-1 text-xs font-semibold", k.up ? "text-success" : "text-primary"),
								children: [
									k.up ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TrendingUp, { className: "h-3 w-3" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TrendingDown, { className: "h-3 w-3" }),
									Math.abs(k.delta),
									"%"
								]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sparkline, { up: k.up })]
						})
					]
				}, k.label))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid grid-cols-1 lg:grid-cols-5 gap-6",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "lg:col-span-3 rounded-xl border border-border bg-card shadow-card",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center justify-between px-5 py-3 border-b border-border",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "font-display text-base font-bold",
							children: "Live Job Board"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "text-xs text-muted-foreground",
							children: [JOBS.length, " active"]
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "divide-y divide-border",
						children: JOBS.slice(0, 6).map((j) => {
							const overdue = j.elapsedMin > j.estimateMin;
							return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-center gap-3 px-5 py-3 hover:bg-muted/40",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "font-mono text-[11px] text-muted-foreground w-14",
										children: j.id
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex-1 min-w-0",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "text-sm font-semibold truncate",
											children: j.customer
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "text-xs text-muted-foreground truncate",
											children: [
												j.vehicle,
												" · ",
												j.service
											]
										})]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "text-xs text-muted-foreground hidden md:block",
										children: j.tech
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "text-xs text-muted-foreground w-14 text-right hidden sm:block",
										children: j.bay
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: cn("font-mono text-xs w-14 text-right", overdue ? "text-primary font-bold" : "text-muted-foreground"),
										children: [j.elapsedMin, "m"]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, {
										variant: statusVariant(j.status),
										children: j.status
									})
								]
							}, j.id);
						})
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "lg:col-span-2 space-y-6",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-xl border border-border bg-card shadow-card",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "px-5 py-3 border-b border-border",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
								className: "font-display text-base font-bold",
								children: "Today's Timeline"
							})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "p-4 space-y-1.5 max-h-[260px] overflow-auto",
							children: BOOKINGS.map((b) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-center gap-3",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-mono text-xs w-12 text-muted-foreground",
									children: b.time
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex-1 rounded-md border border-border px-2.5 py-1.5 bg-background",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "text-xs font-semibold truncate",
										children: b.customer
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "text-[11px] text-muted-foreground truncate",
										children: b.service
									})]
								})]
							}, b.id))
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-xl border border-border bg-card shadow-card",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center gap-2 px-5 py-3 border-b border-border",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TriangleAlert, { className: "h-4 w-4 text-primary" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
								className: "font-display text-base font-bold",
								children: "Inventory Alerts"
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "divide-y divide-border",
							children: INVENTORY.filter((i) => i.stock <= i.reorder).map((i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-center justify-between px-5 py-2.5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "text-sm font-medium",
									children: i.name
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "text-[11px] text-muted-foreground font-mono",
									children: i.sku
								})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, {
									variant: i.stock === 0 ? "danger" : "warning",
									children: i.stock === 0 ? "Out" : `${i.stock} ${i.unit}`
								})]
							}, i.id))
						})]
					})]
				})]
			})
		]
	});
}
//#endregion
export { Dashboard as component };
