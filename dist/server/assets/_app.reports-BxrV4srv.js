import { t as require_jsx_runtime } from "./jsx-runtime-DqHqdqSU.js";
import { r as createLucideIcon } from "./utils-CkbI-8f8.js";
import { t as Download } from "./download-fCrjt3G2.js";
import { t as PageHeader } from "./page-header-DOu5wNGM.js";
/**
* @license lucide-react v0.575.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var Printer = createLucideIcon("printer", [
	["path", {
		d: "M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2",
		key: "143wyd"
	}],
	["path", {
		d: "M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6",
		key: "1itne7"
	}],
	["rect", {
		x: "6",
		y: "14",
		width: "12",
		height: "8",
		rx: "1",
		key: "1ue0tg"
	}]
]);
//#endregion
//#region src/routes/_app.reports.tsx?tsr-split=component
var import_jsx_runtime = require_jsx_runtime();
var REPORTS = [
	{
		name: "Revenue Summary",
		desc: "By category, payment method, avg invoice value",
		metric: "LKR 1.42M",
		delta: "+18% MoM"
	},
	{
		name: "Job Performance",
		desc: "Completion rate, avg duration, overdue %, rework",
		metric: "284 jobs",
		delta: "92% on-time"
	},
	{
		name: "Booking Analytics",
		desc: "Cancellations, no-shows, conversion, peak hours",
		metric: "318 bookings",
		delta: "11% no-show"
	},
	{
		name: "Customer Report",
		desc: "New vs returning, retention, top spenders, tiers",
		metric: "67% returning",
		delta: "+12 new"
	},
	{
		name: "Inventory Report",
		desc: "Stock movement, consumption, COGS, waste",
		metric: "LKR 184k COGS",
		delta: "13% of rev"
	},
	{
		name: "Staff Report",
		desc: "Jobs per tech, revenue, commission, punctuality",
		metric: "6 active",
		delta: "94% attendance"
	},
	{
		name: "Financial P&L",
		desc: "Revenue, COGS, gross margin, discounts given",
		metric: "62% margin",
		delta: "+3pts MoM"
	}
];
function Reports() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "p-6",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHeader, {
			title: "Reports",
			subtitle: "Period · Last 30 days",
			actions: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
					className: "rounded-md border border-input bg-background px-3 py-1.5 text-sm",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { children: "Last 30 days" }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { children: "This Month" }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { children: "Last Month" }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { children: "Custom" })
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					className: "inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Printer, { className: "h-4 w-4" }), " Print"]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					className: "inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-red hover:bg-primary/90",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Download, { className: "h-4 w-4" }), " Export PDF"]
				})
			] })
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4",
			children: REPORTS.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "rounded-xl border border-border bg-card p-5 shadow-card hover:shadow-elevated cursor-pointer transition-shadow",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "flex justify-between items-start",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
						className: "font-display font-bold",
						children: r.name
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-xs text-muted-foreground mt-1 max-w-[80%]",
						children: r.desc
					})] })
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-4 flex items-end justify-between",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "font-display text-2xl font-extrabold text-primary",
						children: r.metric
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "text-[11px] text-success font-semibold mt-0.5",
						children: r.delta
					})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
						viewBox: "0 0 80 28",
						className: "h-10 w-24",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("polyline", {
							points: "0,22 10,18 20,20 30,14 40,16 50,8 60,11 70,5 80,7",
							fill: "none",
							stroke: "var(--primary)",
							strokeWidth: "1.5"
						})
					})]
				})]
			}, r.name))
		})]
	});
}
//#endregion
export { Reports as component };
