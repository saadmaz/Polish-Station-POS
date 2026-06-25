import { a as __toESM, n as require_react, t as require_jsx_runtime } from "./jsx-runtime-DqHqdqSU.js";
import { r as createLucideIcon, t as cn } from "./utils-CkbI-8f8.js";
import { t as CreditCard } from "./credit-card-CittkeMn.js";
import { t as Plus } from "./plus-D-lqgJ1T.js";
import { i as INVOICES, o as SERVICES } from "./mock-data-DAOLHDOp.js";
import { n as statusVariant, t as StatusChip } from "./status-chip-DRv2wCFu.js";
import { t as PageHeader } from "./page-header-DOu5wNGM.js";
/**
* @license lucide-react v0.575.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var ArrowRightLeft = createLucideIcon("arrow-right-left", [
	["path", {
		d: "m16 3 4 4-4 4",
		key: "1x1c3m"
	}],
	["path", {
		d: "M20 7H4",
		key: "zbl0bi"
	}],
	["path", {
		d: "m8 21-4-4 4-4",
		key: "h9nckh"
	}],
	["path", {
		d: "M4 17h16",
		key: "g4d7ey"
	}]
]);
/**
* @license lucide-react v0.575.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var Banknote = createLucideIcon("banknote", [
	["rect", {
		width: "20",
		height: "12",
		x: "2",
		y: "6",
		rx: "2",
		key: "9lu3g6"
	}],
	["circle", {
		cx: "12",
		cy: "12",
		r: "2",
		key: "1c9p78"
	}],
	["path", {
		d: "M6 12h.01M18 12h.01",
		key: "113zkx"
	}]
]);
/**
* @license lucide-react v0.575.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var Trash2 = createLucideIcon("trash-2", [
	["path", {
		d: "M10 11v6",
		key: "nco0om"
	}],
	["path", {
		d: "M14 11v6",
		key: "outv1u"
	}],
	["path", {
		d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6",
		key: "miytrc"
	}],
	["path", {
		d: "M3 6h18",
		key: "d0wm0j"
	}],
	["path", {
		d: "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
		key: "e791ji"
	}]
]);
//#endregion
//#region src/routes/_app.pos.tsx?tsr-split=component
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function POS() {
	const [lines, setLines] = (0, import_react.useState)(SERVICES.slice(0, 2).map((s) => ({
		...s,
		qty: 1,
		discount: 0
	})));
	const [tip, setTip] = (0, import_react.useState)(0);
	const [method, setMethod] = (0, import_react.useState)("Card");
	const subtotal = lines.reduce((s, l) => s + l.price * l.qty - l.discount, 0);
	const tax = Math.round(subtotal * .18);
	const total = subtotal + tax + tip;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "p-6 grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6 h-full",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHeader, {
				title: "Checkout · INV-2091",
				subtitle: "Hasini Wijesuriya · Toyota Aqua · CAR-4521"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "rounded-xl border border-border bg-card shadow-card",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center justify-between p-4 border-b border-border",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "font-display font-bold",
						children: "Line Items"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						className: "inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-4 w-4" }), " Add Item"]
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
					className: "w-full text-sm",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
						className: "text-[11px] uppercase tracking-wider text-muted-foreground",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
							className: "border-b border-border",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "text-left px-4 py-2",
									children: "Service"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "text-right px-3 py-2 w-16",
									children: "Qty"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "text-right px-3 py-2 w-28",
									children: "Unit"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "text-right px-3 py-2 w-28",
									children: "Disc."
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "text-right px-3 py-2 w-32",
									children: "Total"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "w-10" })
							]
						})
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", {
						className: "divide-y divide-border",
						children: lines.map((l, idx) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
								className: "px-4 py-3",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "font-medium",
									children: l.name
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "text-[11px] text-muted-foreground",
									children: [
										l.category,
										" · ",
										l.durationMin,
										"m"
									]
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
								className: "px-3 py-3 text-right font-mono",
								children: l.qty
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
								className: "px-3 py-3 text-right font-mono",
								children: l.price.toLocaleString()
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
								className: "px-3 py-3 text-right font-mono text-primary",
								children: ["-", l.discount.toLocaleString()]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
								className: "px-3 py-3 text-right font-mono font-semibold",
								children: (l.price * l.qty - l.discount).toLocaleString()
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
								className: "px-2 py-3 text-right",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									onClick: () => setLines((ls) => ls.filter((_, i) => i !== idx)),
									className: "text-muted-foreground hover:text-primary",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { className: "h-4 w-4" })
								})
							})
						] }, l.id))
					})]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-6",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
					className: "font-display text-sm font-bold mb-3 uppercase tracking-wider text-muted-foreground",
					children: "Recent Invoices"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "rounded-xl border border-border bg-card shadow-card overflow-hidden",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
						className: "w-full text-sm",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
							className: "bg-charcoal text-charcoal-foreground text-[11px] uppercase tracking-wider",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "text-left px-4 py-2.5",
									children: "Invoice"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "text-left px-3 py-2.5",
									children: "Customer"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "text-left px-3 py-2.5",
									children: "Date"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "text-right px-3 py-2.5",
									children: "Total"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "text-left px-3 py-2.5",
									children: "Method"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "text-left px-3 py-2.5",
									children: "Status"
								})
							] })
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", {
							className: "divide-y divide-border",
							children: INVOICES.map((i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
								className: "hover:bg-muted/40",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
										className: "px-4 py-2.5 font-mono text-xs",
										children: i.id
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
										className: "px-3 py-2.5 font-medium",
										children: i.customer
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
										className: "px-3 py-2.5 text-muted-foreground",
										children: i.date
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
										className: "px-3 py-2.5 text-right font-mono font-semibold",
										children: ["LKR ", i.total.toLocaleString()]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
										className: "px-3 py-2.5 text-muted-foreground",
										children: i.method
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
										className: "px-3 py-2.5",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, {
											variant: statusVariant(i.status),
											children: i.status
										})
									})
								]
							}, i.id))
						})]
					})
				})]
			})
		] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
			className: "rounded-xl border border-border bg-card shadow-card p-5 h-fit sticky top-4",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "text-xs uppercase tracking-wider text-muted-foreground font-semibold",
					children: "Customer"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "font-display font-bold text-lg",
					children: "Hasini Wijesuriya"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "text-xs text-muted-foreground mb-4",
					children: "Platinum · 5% loyalty applied"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "space-y-2 text-sm border-y border-border py-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
							label: "Subtotal",
							value: `LKR ${subtotal.toLocaleString()}`
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
							label: "VAT 18%",
							value: `LKR ${tax.toLocaleString()}`
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
							label: "Tip",
							value: `LKR ${tip.toLocaleString()}`
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-baseline justify-between py-4",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-sm font-semibold uppercase tracking-wider",
						children: "Total"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "font-display text-2xl font-extrabold text-primary",
						children: ["LKR ", total.toLocaleString()]
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "grid grid-cols-3 gap-2 mb-3",
					children: [
						15,
						30,
						50
					].map((amt) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						onClick: () => setTip(amt * 10),
						className: "rounded-md border border-input py-2 text-xs font-medium hover:bg-accent",
						children: ["Tip LKR ", amt * 10]
					}, amt))
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2",
					children: "Payment Method"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "grid grid-cols-3 gap-2 mb-4",
					children: [
						{
							v: "Cash",
							icon: Banknote
						},
						{
							v: "Card",
							icon: CreditCard
						},
						{
							v: "Transfer",
							icon: ArrowRightLeft
						}
					].map(({ v, icon: Icon }) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						onClick: () => setMethod(v),
						className: cn("flex flex-col items-center gap-1 rounded-md border py-2.5 text-xs font-medium transition-colors", method === v ? "border-primary bg-primary/10 text-primary" : "border-input hover:bg-accent"),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { className: "h-4 w-4" }), v]
					}, v))
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					className: "w-full rounded-md gradient-brand py-3 text-sm font-bold uppercase tracking-wider text-primary-foreground shadow-red hover:opacity-95",
					children: ["Charge LKR ", total.toLocaleString()]
				})
			]
		})]
	});
}
function Row({ label, value }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex justify-between",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "text-muted-foreground",
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "font-mono font-medium",
			children: value
		})]
	});
}
//#endregion
export { POS as component };
