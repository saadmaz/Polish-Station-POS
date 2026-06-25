import { i as INVOICES, o as SERVICES } from "./mock-data-DAOLHDOp.js";
import { t as cn } from "./utils-C_uf36nf.js";
import { n as statusVariant, t as StatusChip } from "./status-chip-DXV3Hqca.js";
import { t as PageHeader } from "./page-header-CuwnNFAY.js";
import { useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
import { ArrowRightLeft, Banknote, CreditCard, Plus, Trash2 } from "lucide-react";
//#region src/routes/_app.pos.tsx?tsr-split=component
function POS() {
	const [lines, setLines] = useState(SERVICES.slice(0, 2).map((s) => ({
		...s,
		qty: 1,
		discount: 0
	})));
	const [tip, setTip] = useState(0);
	const [method, setMethod] = useState("Card");
	const subtotal = lines.reduce((s, l) => s + l.price * l.qty - l.discount, 0);
	const tax = Math.round(subtotal * .18);
	const total = subtotal + tax + tip;
	return /* @__PURE__ */ jsxs("div", {
		className: "p-6 grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6 h-full",
		children: [/* @__PURE__ */ jsxs("div", { children: [
			/* @__PURE__ */ jsx(PageHeader, {
				title: "Checkout · INV-2091",
				subtitle: "Hasini Wijesuriya · Toyota Aqua · CAR-4521"
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "rounded-xl border border-border bg-card shadow-card",
				children: [/* @__PURE__ */ jsxs("div", {
					className: "flex items-center justify-between p-4 border-b border-border",
					children: [/* @__PURE__ */ jsx("h2", {
						className: "font-display font-bold",
						children: "Line Items"
					}), /* @__PURE__ */ jsxs("button", {
						className: "inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent",
						children: [/* @__PURE__ */ jsx(Plus, { className: "h-4 w-4" }), " Add Item"]
					})]
				}), /* @__PURE__ */ jsxs("table", {
					className: "w-full text-sm",
					children: [/* @__PURE__ */ jsx("thead", {
						className: "text-[11px] uppercase tracking-wider text-muted-foreground",
						children: /* @__PURE__ */ jsxs("tr", {
							className: "border-b border-border",
							children: [
								/* @__PURE__ */ jsx("th", {
									className: "text-left px-4 py-2",
									children: "Service"
								}),
								/* @__PURE__ */ jsx("th", {
									className: "text-right px-3 py-2 w-16",
									children: "Qty"
								}),
								/* @__PURE__ */ jsx("th", {
									className: "text-right px-3 py-2 w-28",
									children: "Unit"
								}),
								/* @__PURE__ */ jsx("th", {
									className: "text-right px-3 py-2 w-28",
									children: "Disc."
								}),
								/* @__PURE__ */ jsx("th", {
									className: "text-right px-3 py-2 w-32",
									children: "Total"
								}),
								/* @__PURE__ */ jsx("th", { className: "w-10" })
							]
						})
					}), /* @__PURE__ */ jsx("tbody", {
						className: "divide-y divide-border",
						children: lines.map((l, idx) => /* @__PURE__ */ jsxs("tr", { children: [
							/* @__PURE__ */ jsxs("td", {
								className: "px-4 py-3",
								children: [/* @__PURE__ */ jsx("div", {
									className: "font-medium",
									children: l.name
								}), /* @__PURE__ */ jsxs("div", {
									className: "text-[11px] text-muted-foreground",
									children: [
										l.category,
										" · ",
										l.durationMin,
										"m"
									]
								})]
							}),
							/* @__PURE__ */ jsx("td", {
								className: "px-3 py-3 text-right font-mono",
								children: l.qty
							}),
							/* @__PURE__ */ jsx("td", {
								className: "px-3 py-3 text-right font-mono",
								children: l.price.toLocaleString()
							}),
							/* @__PURE__ */ jsxs("td", {
								className: "px-3 py-3 text-right font-mono text-primary",
								children: ["-", l.discount.toLocaleString()]
							}),
							/* @__PURE__ */ jsx("td", {
								className: "px-3 py-3 text-right font-mono font-semibold",
								children: (l.price * l.qty - l.discount).toLocaleString()
							}),
							/* @__PURE__ */ jsx("td", {
								className: "px-2 py-3 text-right",
								children: /* @__PURE__ */ jsx("button", {
									onClick: () => setLines((ls) => ls.filter((_, i) => i !== idx)),
									className: "text-muted-foreground hover:text-primary",
									children: /* @__PURE__ */ jsx(Trash2, { className: "h-4 w-4" })
								})
							})
						] }, l.id))
					})]
				})]
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "mt-6",
				children: [/* @__PURE__ */ jsx("h3", {
					className: "font-display text-sm font-bold mb-3 uppercase tracking-wider text-muted-foreground",
					children: "Recent Invoices"
				}), /* @__PURE__ */ jsx("div", {
					className: "rounded-xl border border-border bg-card shadow-card overflow-hidden",
					children: /* @__PURE__ */ jsxs("table", {
						className: "w-full text-sm",
						children: [/* @__PURE__ */ jsx("thead", {
							className: "bg-charcoal text-charcoal-foreground text-[11px] uppercase tracking-wider",
							children: /* @__PURE__ */ jsxs("tr", { children: [
								/* @__PURE__ */ jsx("th", {
									className: "text-left px-4 py-2.5",
									children: "Invoice"
								}),
								/* @__PURE__ */ jsx("th", {
									className: "text-left px-3 py-2.5",
									children: "Customer"
								}),
								/* @__PURE__ */ jsx("th", {
									className: "text-left px-3 py-2.5",
									children: "Date"
								}),
								/* @__PURE__ */ jsx("th", {
									className: "text-right px-3 py-2.5",
									children: "Total"
								}),
								/* @__PURE__ */ jsx("th", {
									className: "text-left px-3 py-2.5",
									children: "Method"
								}),
								/* @__PURE__ */ jsx("th", {
									className: "text-left px-3 py-2.5",
									children: "Status"
								})
							] })
						}), /* @__PURE__ */ jsx("tbody", {
							className: "divide-y divide-border",
							children: INVOICES.map((i) => /* @__PURE__ */ jsxs("tr", {
								className: "hover:bg-muted/40",
								children: [
									/* @__PURE__ */ jsx("td", {
										className: "px-4 py-2.5 font-mono text-xs",
										children: i.id
									}),
									/* @__PURE__ */ jsx("td", {
										className: "px-3 py-2.5 font-medium",
										children: i.customer
									}),
									/* @__PURE__ */ jsx("td", {
										className: "px-3 py-2.5 text-muted-foreground",
										children: i.date
									}),
									/* @__PURE__ */ jsxs("td", {
										className: "px-3 py-2.5 text-right font-mono font-semibold",
										children: ["LKR ", i.total.toLocaleString()]
									}),
									/* @__PURE__ */ jsx("td", {
										className: "px-3 py-2.5 text-muted-foreground",
										children: i.method
									}),
									/* @__PURE__ */ jsx("td", {
										className: "px-3 py-2.5",
										children: /* @__PURE__ */ jsx(StatusChip, {
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
		] }), /* @__PURE__ */ jsxs("aside", {
			className: "rounded-xl border border-border bg-card shadow-card p-5 h-fit sticky top-4",
			children: [
				/* @__PURE__ */ jsx("div", {
					className: "text-xs uppercase tracking-wider text-muted-foreground font-semibold",
					children: "Customer"
				}),
				/* @__PURE__ */ jsx("div", {
					className: "font-display font-bold text-lg",
					children: "Hasini Wijesuriya"
				}),
				/* @__PURE__ */ jsx("div", {
					className: "text-xs text-muted-foreground mb-4",
					children: "Platinum · 5% loyalty applied"
				}),
				/* @__PURE__ */ jsxs("div", {
					className: "space-y-2 text-sm border-y border-border py-4",
					children: [
						/* @__PURE__ */ jsx(Row, {
							label: "Subtotal",
							value: `LKR ${subtotal.toLocaleString()}`
						}),
						/* @__PURE__ */ jsx(Row, {
							label: "VAT 18%",
							value: `LKR ${tax.toLocaleString()}`
						}),
						/* @__PURE__ */ jsx(Row, {
							label: "Tip",
							value: `LKR ${tip.toLocaleString()}`
						})
					]
				}),
				/* @__PURE__ */ jsxs("div", {
					className: "flex items-baseline justify-between py-4",
					children: [/* @__PURE__ */ jsx("span", {
						className: "text-sm font-semibold uppercase tracking-wider",
						children: "Total"
					}), /* @__PURE__ */ jsxs("span", {
						className: "font-display text-2xl font-extrabold text-primary",
						children: ["LKR ", total.toLocaleString()]
					})]
				}),
				/* @__PURE__ */ jsx("div", {
					className: "grid grid-cols-3 gap-2 mb-3",
					children: [
						15,
						30,
						50
					].map((amt) => /* @__PURE__ */ jsxs("button", {
						onClick: () => setTip(amt * 10),
						className: "rounded-md border border-input py-2 text-xs font-medium hover:bg-accent",
						children: ["Tip LKR ", amt * 10]
					}, amt))
				}),
				/* @__PURE__ */ jsx("div", {
					className: "text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2",
					children: "Payment Method"
				}),
				/* @__PURE__ */ jsx("div", {
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
					].map(({ v, icon: Icon }) => /* @__PURE__ */ jsxs("button", {
						onClick: () => setMethod(v),
						className: cn("flex flex-col items-center gap-1 rounded-md border py-2.5 text-xs font-medium transition-colors", method === v ? "border-primary bg-primary/10 text-primary" : "border-input hover:bg-accent"),
						children: [/* @__PURE__ */ jsx(Icon, { className: "h-4 w-4" }), v]
					}, v))
				}),
				/* @__PURE__ */ jsxs("button", {
					className: "w-full rounded-md gradient-brand py-3 text-sm font-bold uppercase tracking-wider text-primary-foreground shadow-red hover:opacity-95",
					children: ["Charge LKR ", total.toLocaleString()]
				})
			]
		})]
	});
}
function Row({ label, value }) {
	return /* @__PURE__ */ jsxs("div", {
		className: "flex justify-between",
		children: [/* @__PURE__ */ jsx("span", {
			className: "text-muted-foreground",
			children: label
		}), /* @__PURE__ */ jsx("span", {
			className: "font-mono font-medium",
			children: value
		})]
	});
}
//#endregion
export { POS as component };
