import { t as cn } from "./utils-C_uf36nf.js";
import { jsx, jsxs } from "react/jsx-runtime";
//#region src/components/status-chip.tsx
var STYLES = {
	success: "bg-success/15 text-success border-success/30",
	warning: "bg-warning/20 text-warning-foreground border-warning/40",
	danger: "bg-primary/12 text-primary border-primary/30",
	info: "bg-info/15 text-info border-info/30",
	neutral: "bg-muted text-muted-foreground border-border",
	brand: "bg-primary text-primary-foreground border-primary"
};
function StatusChip({ children, variant = "neutral", className }) {
	return /* @__PURE__ */ jsxs("span", {
		className: cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider", STYLES[variant], className),
		children: [/* @__PURE__ */ jsx("span", { className: "h-1.5 w-1.5 rounded-full bg-current opacity-80" }), children]
	});
}
function statusVariant(status) {
	const s = status.toLowerCase();
	if ([
		"paid",
		"done",
		"ready",
		"in stock",
		"confirmed",
		"checked-in",
		"active"
	].some((k) => s.includes(k))) return "success";
	if ([
		"pending",
		"low stock",
		"on hold",
		"awaiting"
	].some((k) => s.includes(k))) return "warning";
	if ([
		"overdue",
		"out of stock",
		"cancelled",
		"void",
		"no-show",
		"error"
	].some((k) => s.includes(k))) return "danger";
	if ([
		"ordered",
		"issued",
		"info",
		"in bay",
		"in progress"
	].some((k) => s.includes(k))) return "info";
	return "neutral";
}
//#endregion
export { statusVariant as n, StatusChip as t };
