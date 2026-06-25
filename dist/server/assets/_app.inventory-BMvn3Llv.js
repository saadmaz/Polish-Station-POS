import { r as INVENTORY } from "./mock-data-DAOLHDOp.js";
import { t as StatusChip } from "./status-chip-DXV3Hqca.js";
import { t as PageHeader } from "./page-header-CuwnNFAY.js";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { FileText, Plus } from "lucide-react";
//#region src/routes/_app.inventory.tsx?tsr-split=component
function status(stock, reorder) {
	if (stock === 0) return {
		label: "Out of Stock",
		variant: "danger"
	};
	if (stock <= reorder) return {
		label: "Low Stock",
		variant: "warning"
	};
	return {
		label: "In Stock",
		variant: "success"
	};
}
function Inventory() {
	const totalValue = INVENTORY.reduce((sum, i) => sum + i.stock * i.cost, 0);
	return /* @__PURE__ */ jsxs("div", {
		className: "p-6",
		children: [
			/* @__PURE__ */ jsx(PageHeader, {
				title: "Inventory",
				subtitle: `${INVENTORY.length} SKUs · LKR ${totalValue.toLocaleString()} on hand`,
				actions: /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsxs("button", {
					className: "inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent",
					children: [/* @__PURE__ */ jsx(FileText, { className: "h-4 w-4" }), " New PO"]
				}), /* @__PURE__ */ jsxs("button", {
					className: "inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-red hover:bg-primary/90",
					children: [/* @__PURE__ */ jsx(Plus, { className: "h-4 w-4" }), " Add Item"]
				})] })
			}),
			/* @__PURE__ */ jsx("div", {
				className: "grid grid-cols-2 md:grid-cols-4 gap-3 mb-5",
				children: [
					{
						label: "Total SKUs",
						value: INVENTORY.length
					},
					{
						label: "Low Stock",
						value: INVENTORY.filter((i) => i.stock > 0 && i.stock <= i.reorder).length,
						tone: "text-warning-foreground"
					},
					{
						label: "Out of Stock",
						value: INVENTORY.filter((i) => i.stock === 0).length,
						tone: "text-primary"
					},
					{
						label: "Stock Value",
						value: `LKR ${totalValue.toLocaleString()}`
					}
				].map((s) => /* @__PURE__ */ jsxs("div", {
					className: "rounded-xl border border-border bg-card p-4 shadow-card",
					children: [/* @__PURE__ */ jsx("div", {
						className: "text-[11px] uppercase tracking-wider text-muted-foreground font-semibold",
						children: s.label
					}), /* @__PURE__ */ jsx("div", {
						className: "mt-1.5 font-display text-xl font-bold " + (s.tone ?? ""),
						children: s.value
					})]
				}, s.label))
			}),
			/* @__PURE__ */ jsx("div", {
				className: "rounded-xl border border-border bg-card shadow-card overflow-hidden",
				children: /* @__PURE__ */ jsxs("table", {
					className: "w-full text-sm",
					children: [/* @__PURE__ */ jsx("thead", {
						className: "bg-charcoal text-charcoal-foreground text-[11px] uppercase tracking-wider",
						children: /* @__PURE__ */ jsxs("tr", { children: [
							/* @__PURE__ */ jsx("th", {
								className: "text-left px-5 py-2.5",
								children: "Item"
							}),
							/* @__PURE__ */ jsx("th", {
								className: "text-left px-3 py-2.5",
								children: "SKU"
							}),
							/* @__PURE__ */ jsx("th", {
								className: "text-left px-3 py-2.5",
								children: "Category"
							}),
							/* @__PURE__ */ jsx("th", {
								className: "text-right px-3 py-2.5",
								children: "Stock"
							}),
							/* @__PURE__ */ jsx("th", {
								className: "text-right px-3 py-2.5",
								children: "Reorder"
							}),
							/* @__PURE__ */ jsx("th", {
								className: "text-right px-3 py-2.5",
								children: "Unit Cost"
							}),
							/* @__PURE__ */ jsx("th", {
								className: "text-left px-3 py-2.5",
								children: "Supplier"
							}),
							/* @__PURE__ */ jsx("th", {
								className: "text-left px-3 py-2.5",
								children: "Status"
							})
						] })
					}), /* @__PURE__ */ jsx("tbody", {
						className: "divide-y divide-border",
						children: INVENTORY.map((i) => {
							const st = status(i.stock, i.reorder);
							return /* @__PURE__ */ jsxs("tr", {
								className: "hover:bg-muted/40",
								children: [
									/* @__PURE__ */ jsx("td", {
										className: "px-5 py-3 font-medium",
										children: i.name
									}),
									/* @__PURE__ */ jsx("td", {
										className: "px-3 py-3 font-mono text-xs text-muted-foreground",
										children: i.sku
									}),
									/* @__PURE__ */ jsx("td", {
										className: "px-3 py-3 text-muted-foreground",
										children: i.category
									}),
									/* @__PURE__ */ jsxs("td", {
										className: "px-3 py-3 text-right font-mono font-semibold",
										children: [
											i.stock,
											" ",
											i.unit
										]
									}),
									/* @__PURE__ */ jsx("td", {
										className: "px-3 py-3 text-right font-mono text-muted-foreground",
										children: i.reorder
									}),
									/* @__PURE__ */ jsxs("td", {
										className: "px-3 py-3 text-right font-mono",
										children: ["LKR ", i.cost.toLocaleString()]
									}),
									/* @__PURE__ */ jsx("td", {
										className: "px-3 py-3 text-muted-foreground",
										children: i.supplier
									}),
									/* @__PURE__ */ jsx("td", {
										className: "px-3 py-3",
										children: /* @__PURE__ */ jsx(StatusChip, {
											variant: st.variant,
											children: st.label
										})
									})
								]
							}, i.id);
						})
					})]
				})
			})
		]
	});
}
//#endregion
export { Inventory as component };
