import { n as CUSTOMERS } from "./mock-data-DAOLHDOp.js";
import { t as StatusChip } from "./status-chip-DXV3Hqca.js";
import { t as PageHeader } from "./page-header-CuwnNFAY.js";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { Download, Plus, Search } from "lucide-react";
//#region src/routes/_app.customers.tsx?tsr-split=component
var TIER_TONE = {
	Bronze: "neutral",
	Silver: "info",
	Gold: "warning",
	Platinum: "brand"
};
function Customers() {
	return /* @__PURE__ */ jsxs("div", {
		className: "p-6",
		children: [/* @__PURE__ */ jsx(PageHeader, {
			title: "Customers",
			subtitle: `${CUSTOMERS.length} customers · 64 vehicles on file`,
			actions: /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsxs("button", {
				className: "inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent",
				children: [/* @__PURE__ */ jsx(Download, { className: "h-4 w-4" }), " Export"]
			}), /* @__PURE__ */ jsxs("button", {
				className: "inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-red hover:bg-primary/90",
				children: [/* @__PURE__ */ jsx(Plus, { className: "h-4 w-4" }), " New Customer"]
			})] })
		}), /* @__PURE__ */ jsxs("div", {
			className: "rounded-xl border border-border bg-card shadow-card",
			children: [/* @__PURE__ */ jsxs("div", {
				className: "flex items-center gap-3 p-4 border-b border-border",
				children: [/* @__PURE__ */ jsxs("div", {
					className: "flex flex-1 items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm",
					children: [/* @__PURE__ */ jsx(Search, { className: "h-4 w-4 text-muted-foreground" }), /* @__PURE__ */ jsx("input", {
						className: "flex-1 bg-transparent outline-none",
						placeholder: "Search by name, phone, plate…"
					})]
				}), /* @__PURE__ */ jsxs("select", {
					className: "rounded-md border border-input bg-background px-3 py-1.5 text-sm",
					children: [
						/* @__PURE__ */ jsx("option", { children: "All Tiers" }),
						/* @__PURE__ */ jsx("option", { children: "Platinum" }),
						/* @__PURE__ */ jsx("option", { children: "Gold" }),
						/* @__PURE__ */ jsx("option", { children: "Silver" }),
						/* @__PURE__ */ jsx("option", { children: "Bronze" })
					]
				})]
			}), /* @__PURE__ */ jsxs("table", {
				className: "w-full text-sm",
				children: [/* @__PURE__ */ jsx("thead", {
					className: "bg-charcoal text-charcoal-foreground text-[11px] uppercase tracking-wider",
					children: /* @__PURE__ */ jsxs("tr", { children: [
						/* @__PURE__ */ jsx("th", {
							className: "text-left px-5 py-2.5",
							children: "Customer"
						}),
						/* @__PURE__ */ jsx("th", {
							className: "text-left px-3 py-2.5",
							children: "Phone"
						}),
						/* @__PURE__ */ jsx("th", {
							className: "text-right px-3 py-2.5",
							children: "Visits"
						}),
						/* @__PURE__ */ jsx("th", {
							className: "text-right px-3 py-2.5",
							children: "Lifetime Spend"
						}),
						/* @__PURE__ */ jsx("th", {
							className: "text-left px-3 py-2.5",
							children: "Last Visit"
						}),
						/* @__PURE__ */ jsx("th", {
							className: "text-right px-3 py-2.5",
							children: "Vehicles"
						}),
						/* @__PURE__ */ jsx("th", {
							className: "text-left px-3 py-2.5",
							children: "Tier"
						})
					] })
				}), /* @__PURE__ */ jsx("tbody", {
					className: "divide-y divide-border",
					children: CUSTOMERS.map((c) => /* @__PURE__ */ jsxs("tr", {
						className: "hover:bg-muted/40 cursor-pointer",
						children: [
							/* @__PURE__ */ jsx("td", {
								className: "px-5 py-3",
								children: /* @__PURE__ */ jsxs("div", {
									className: "flex items-center gap-2.5",
									children: [/* @__PURE__ */ jsx("div", {
										className: "grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary",
										children: c.name.split(" ").map((p) => p[0]).slice(0, 2).join("")
									}), /* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("div", {
										className: "font-semibold",
										children: c.name
									}), /* @__PURE__ */ jsx("div", {
										className: "text-[11px] text-muted-foreground",
										children: c.email
									})] })]
								})
							}),
							/* @__PURE__ */ jsx("td", {
								className: "px-3 py-3 font-mono text-xs text-muted-foreground",
								children: c.phone
							}),
							/* @__PURE__ */ jsx("td", {
								className: "px-3 py-3 text-right font-mono",
								children: c.visits
							}),
							/* @__PURE__ */ jsxs("td", {
								className: "px-3 py-3 text-right font-mono font-semibold",
								children: ["LKR ", c.spend.toLocaleString()]
							}),
							/* @__PURE__ */ jsx("td", {
								className: "px-3 py-3 text-muted-foreground",
								children: c.lastVisit
							}),
							/* @__PURE__ */ jsx("td", {
								className: "px-3 py-3 text-right font-mono",
								children: c.vehicles
							}),
							/* @__PURE__ */ jsx("td", {
								className: "px-3 py-3",
								children: /* @__PURE__ */ jsx(StatusChip, {
									variant: TIER_TONE[c.tier],
									children: c.tier
								})
							})
						]
					}, c.id))
				})]
			})]
		})]
	});
}
//#endregion
export { Customers as component };
