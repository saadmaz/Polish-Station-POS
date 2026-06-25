import { t as require_jsx_runtime } from "./jsx-runtime-DqHqdqSU.js";
import { r as STAFF } from "./auth-CgulVzRe.js";
import { t as Calendar } from "./calendar-CL5c_d6Y.js";
import { t as Plus } from "./plus-D-lqgJ1T.js";
import { t as StatusChip } from "./status-chip-DRv2wCFu.js";
import { t as PageHeader } from "./page-header-DOu5wNGM.js";
//#region src/routes/_app.staff.tsx?tsr-split=component
var import_jsx_runtime = require_jsx_runtime();
function StaffPage() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "p-6",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHeader, {
			title: "Staff",
			subtitle: `${STAFF.length} team members · 4 on shift today`,
			actions: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
				className: "inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Calendar, { className: "h-4 w-4" }), " Schedule"]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
				className: "inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-red hover:bg-primary/90",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-4 w-4" }), " Add Staff"]
			})] })
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6",
			children: STAFF.map((s, idx) => {
				const jobs = [
					5,
					3,
					0,
					0,
					6,
					4
				][idx] ?? 0;
				const rev = [
					42,
					88,
					12,
					0,
					64,
					51
				][idx] ?? 0;
				const onTime = [
					96,
					92,
					100,
					88,
					89,
					94
				][idx] ?? 90;
				return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "rounded-xl border border-border bg-card p-4 shadow-card hover:shadow-elevated transition-shadow",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center gap-3",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "grid h-12 w-12 place-items-center rounded-full font-bold text-primary-foreground",
									style: { background: s.color },
									children: s.name.split(" ").map((p) => p[0]).join("")
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex-1",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "font-display font-bold",
										children: s.name
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "text-xs text-muted-foreground uppercase tracking-wider",
										children: s.role
									})]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, {
									variant: "success",
									children: "Active"
								})
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-4 grid grid-cols-3 gap-2 text-center",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
									label: "Jobs Today",
									value: jobs
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
									label: "Revenue",
									value: `LKR ${rev}k`
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
									label: "On-time",
									value: `${onTime}%`
								})
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-3 flex justify-between text-[11px] text-muted-foreground border-t border-border pt-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: ["PIN · ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "font-mono",
								children: "●●●●●"
							})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Shift · 08:00 – 18:00" })]
						})
					]
				}, s.id);
			})
		})]
	});
}
function Stat({ label, value }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-md bg-muted/40 py-2",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "font-display text-base font-bold",
			children: value
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "text-[10px] uppercase tracking-wider text-muted-foreground",
			children: label
		})]
	});
}
//#endregion
export { StaffPage as component };
