import { t as PageHeader } from "./page-header-CuwnNFAY.js";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { Download, Printer } from "lucide-react";
//#region src/routes/_app.reports.tsx?tsr-split=component
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
	return /* @__PURE__ */ jsxs("div", {
		className: "p-6",
		children: [/* @__PURE__ */ jsx(PageHeader, {
			title: "Reports",
			subtitle: "Period · Last 30 days",
			actions: /* @__PURE__ */ jsxs(Fragment, { children: [
				/* @__PURE__ */ jsxs("select", {
					className: "rounded-md border border-input bg-background px-3 py-1.5 text-sm",
					children: [
						/* @__PURE__ */ jsx("option", { children: "Last 30 days" }),
						/* @__PURE__ */ jsx("option", { children: "This Month" }),
						/* @__PURE__ */ jsx("option", { children: "Last Month" }),
						/* @__PURE__ */ jsx("option", { children: "Custom" })
					]
				}),
				/* @__PURE__ */ jsxs("button", {
					className: "inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent",
					children: [/* @__PURE__ */ jsx(Printer, { className: "h-4 w-4" }), " Print"]
				}),
				/* @__PURE__ */ jsxs("button", {
					className: "inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-red hover:bg-primary/90",
					children: [/* @__PURE__ */ jsx(Download, { className: "h-4 w-4" }), " Export PDF"]
				})
			] })
		}), /* @__PURE__ */ jsx("div", {
			className: "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4",
			children: REPORTS.map((r) => /* @__PURE__ */ jsxs("div", {
				className: "rounded-xl border border-border bg-card p-5 shadow-card hover:shadow-elevated cursor-pointer transition-shadow",
				children: [/* @__PURE__ */ jsx("div", {
					className: "flex justify-between items-start",
					children: /* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("h3", {
						className: "font-display font-bold",
						children: r.name
					}), /* @__PURE__ */ jsx("p", {
						className: "text-xs text-muted-foreground mt-1 max-w-[80%]",
						children: r.desc
					})] })
				}), /* @__PURE__ */ jsxs("div", {
					className: "mt-4 flex items-end justify-between",
					children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("div", {
						className: "font-display text-2xl font-extrabold text-primary",
						children: r.metric
					}), /* @__PURE__ */ jsx("div", {
						className: "text-[11px] text-success font-semibold mt-0.5",
						children: r.delta
					})] }), /* @__PURE__ */ jsx("svg", {
						viewBox: "0 0 80 28",
						className: "h-10 w-24",
						children: /* @__PURE__ */ jsx("polyline", {
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
