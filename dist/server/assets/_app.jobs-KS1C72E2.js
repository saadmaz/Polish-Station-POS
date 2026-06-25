import { a as JOBS } from "./mock-data-DAOLHDOp.js";
import { t as cn } from "./utils-C_uf36nf.js";
import { t as PageHeader } from "./page-header-CuwnNFAY.js";
import { jsx, jsxs } from "react/jsx-runtime";
import { ChevronRight, Clock, Flag, Pause } from "lucide-react";
//#region src/routes/_app.jobs.tsx?tsr-split=component
var COLUMNS = [
	{
		status: "Queue",
		tone: "border-info"
	},
	{
		status: "In Bay",
		tone: "border-primary"
	},
	{
		status: "On Hold",
		tone: "border-warning"
	},
	{
		status: "Awaiting QC",
		tone: "border-warning"
	},
	{
		status: "Ready",
		tone: "border-success"
	},
	{
		status: "Done Today",
		tone: "border-muted-foreground"
	}
];
var CAT_COLORS = {
	Exterior: "var(--info)",
	Interior: "var(--success)",
	"Full Detail": "var(--primary)",
	"Paint Protection": "var(--warning)",
	Coating: "var(--charcoal)"
};
function ActiveJobs() {
	return /* @__PURE__ */ jsxs("div", {
		className: "p-6 h-full flex flex-col",
		children: [
			/* @__PURE__ */ jsx(PageHeader, {
				title: "Active Jobs",
				subtitle: "Kanban board · drag cards to update status"
			}),
			/* @__PURE__ */ jsx("div", {
				className: "flex-1 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 min-h-0",
				children: COLUMNS.map((col) => {
					const items = JOBS.filter((j) => j.status === col.status);
					return /* @__PURE__ */ jsxs("div", {
						className: cn("flex flex-col rounded-xl border-t-[3px] bg-card border-border", col.tone),
						children: [/* @__PURE__ */ jsxs("div", {
							className: "flex items-center justify-between px-3 pt-3 pb-2",
							children: [/* @__PURE__ */ jsx("h3", {
								className: "text-xs font-bold uppercase tracking-wider",
								children: col.status
							}), /* @__PURE__ */ jsx("span", {
								className: "text-[11px] font-mono text-muted-foreground bg-muted rounded-full px-2 py-0.5",
								children: items.length
							})]
						}), /* @__PURE__ */ jsxs("div", {
							className: "flex-1 overflow-auto px-2 pb-2 space-y-2",
							children: [items.map((j) => {
								const overdue = j.elapsedMin > j.estimateMin;
								return /* @__PURE__ */ jsxs("div", {
									className: "rounded-lg border border-border bg-background p-2.5 hover:shadow-card cursor-pointer transition-shadow border-l-[3px]",
									style: { borderLeftColor: CAT_COLORS[j.category] ?? "var(--primary)" },
									children: [
										/* @__PURE__ */ jsxs("div", {
											className: "flex items-start justify-between gap-2",
											children: [/* @__PURE__ */ jsxs("div", {
												className: "min-w-0",
												children: [/* @__PURE__ */ jsx("div", {
													className: "text-sm font-semibold truncate",
													children: j.customer
												}), /* @__PURE__ */ jsxs("div", {
													className: "text-[11px] text-muted-foreground truncate",
													children: [
														j.vehicle,
														" · ",
														/* @__PURE__ */ jsx("span", {
															className: "font-mono",
															children: j.plate
														})
													]
												})]
											}), /* @__PURE__ */ jsx(ChevronRight, { className: "h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" })]
										}),
										/* @__PURE__ */ jsx("div", {
											className: "mt-2 text-[11px] line-clamp-2",
											children: j.service
										}),
										/* @__PURE__ */ jsxs("div", {
											className: "mt-2 flex items-center justify-between text-[11px]",
											children: [/* @__PURE__ */ jsxs("span", {
												className: "text-muted-foreground",
												children: [
													j.tech,
													" · ",
													j.bay
												]
											}), /* @__PURE__ */ jsxs("span", {
												className: cn("inline-flex items-center gap-1 font-mono font-semibold", overdue ? "text-primary" : "text-muted-foreground"),
												children: [
													/* @__PURE__ */ jsx(Clock, { className: "h-3 w-3" }),
													j.elapsedMin,
													"m"
												]
											})]
										})
									]
								}, j.id);
							}), items.length === 0 && /* @__PURE__ */ jsx("div", {
								className: "text-center text-[11px] text-muted-foreground py-6",
								children: "Empty"
							})]
						})]
					}, col.status);
				})
			}),
			/* @__PURE__ */ jsx("div", {
				className: "mt-4 rounded-xl border border-border bg-card shadow-card p-3",
				children: /* @__PURE__ */ jsxs("div", {
					className: "flex flex-wrap items-center gap-3",
					children: [
						/* @__PURE__ */ jsx("div", {
							className: "text-xs font-bold uppercase tracking-wider text-muted-foreground mr-2",
							children: "On Shift"
						}),
						[
							{
								name: "Imran S.",
								done: 5,
								status: "Active"
							},
							{
								name: "Dilshan H.",
								done: 3,
								status: "Active"
							},
							{
								name: "Niro D.",
								done: 0,
								status: "Idle"
							},
							{
								name: "Tharu K.",
								done: 0,
								status: "Break"
							}
						].map((t) => /* @__PURE__ */ jsxs("div", {
							className: "flex items-center gap-2 rounded-md border border-border px-3 py-1.5",
							children: [/* @__PURE__ */ jsx("div", {
								className: "grid h-7 w-7 place-items-center rounded-full bg-primary/15 text-[11px] font-bold text-primary",
								children: t.name.split(" ").map((p) => p[0]).join("")
							}), /* @__PURE__ */ jsxs("div", {
								className: "leading-tight",
								children: [/* @__PURE__ */ jsx("div", {
									className: "text-xs font-semibold",
									children: t.name
								}), /* @__PURE__ */ jsxs("div", {
									className: "text-[10px] text-muted-foreground",
									children: [
										t.done,
										" jobs · ",
										t.status
									]
								})]
							})]
						}, t.name)),
						/* @__PURE__ */ jsxs("div", {
							className: "ml-auto flex gap-1.5",
							children: [/* @__PURE__ */ jsx("button", {
								className: "rounded-md border border-input p-1.5 hover:bg-accent",
								title: "Pause",
								children: /* @__PURE__ */ jsx(Pause, { className: "h-3.5 w-3.5" })
							}), /* @__PURE__ */ jsx("button", {
								className: "rounded-md border border-input p-1.5 hover:bg-accent",
								title: "Flag",
								children: /* @__PURE__ */ jsx(Flag, { className: "h-3.5 w-3.5" })
							})]
						})
					]
				})
			})
		]
	});
}
//#endregion
export { ActiveJobs as component };
