import { t as BOOKINGS } from "./mock-data-DAOLHDOp.js";
import { t as cn } from "./utils-C_uf36nf.js";
import { n as statusVariant, t as StatusChip } from "./status-chip-DXV3Hqca.js";
import { t as PageHeader } from "./page-header-CuwnNFAY.js";
import { useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
//#region src/routes/_app.bookings.tsx?tsr-split=component
var HOURS = Array.from({ length: 11 }, (_, i) => 8 + i);
function Bookings() {
	const [view, setView] = useState("day");
	return /* @__PURE__ */ jsxs("div", {
		className: "p-6",
		children: [/* @__PURE__ */ jsx(PageHeader, {
			title: "Bookings",
			subtitle: "Schedule appointments and walk-ins",
			actions: /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsx("div", {
				className: "inline-flex rounded-md border border-input bg-background p-0.5 text-xs font-medium",
				children: [
					"day",
					"week",
					"list"
				].map((v) => /* @__PURE__ */ jsx("button", {
					onClick: () => setView(v),
					className: cn("rounded-md px-3 py-1.5 capitalize", view === v ? "bg-charcoal text-charcoal-foreground" : "text-muted-foreground hover:text-foreground"),
					children: v
				}, v))
			}), /* @__PURE__ */ jsxs("button", {
				className: "inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-red hover:bg-primary/90",
				children: [/* @__PURE__ */ jsx(Plus, { className: "h-4 w-4" }), " New Booking"]
			})] })
		}), /* @__PURE__ */ jsxs("div", {
			className: "rounded-xl border border-border bg-card shadow-card",
			children: [
				/* @__PURE__ */ jsxs("div", {
					className: "flex items-center justify-between px-5 py-3 border-b border-border",
					children: [/* @__PURE__ */ jsxs("div", {
						className: "flex items-center gap-3",
						children: [
							/* @__PURE__ */ jsx("button", {
								className: "rounded-md p-1.5 hover:bg-muted",
								children: /* @__PURE__ */ jsx(ChevronLeft, { className: "h-4 w-4" })
							}),
							/* @__PURE__ */ jsx("div", {
								className: "font-display font-bold",
								children: "Today · Wed, Jun 17"
							}),
							/* @__PURE__ */ jsx("button", {
								className: "rounded-md p-1.5 hover:bg-muted",
								children: /* @__PURE__ */ jsx(ChevronRight, { className: "h-4 w-4" })
							})
						]
					}), /* @__PURE__ */ jsx("div", {
						className: "text-xs text-muted-foreground",
						children: "5 bays · 6 staff on shift"
					})]
				}),
				view === "day" && /* @__PURE__ */ jsxs("div", {
					className: "grid grid-cols-[60px_repeat(5,1fr)] divide-x divide-border",
					children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("div", { className: "h-10 border-b border-border" }), HOURS.map((h) => /* @__PURE__ */ jsxs("div", {
						className: "h-16 border-b border-border px-2 py-1 text-[11px] font-mono text-muted-foreground",
						children: [String(h).padStart(2, "0"), ":00"]
					}, h))] }), Array.from({ length: 5 }).map((_, bay) => /* @__PURE__ */ jsxs("div", {
						className: "relative",
						children: [/* @__PURE__ */ jsxs("div", {
							className: "h-10 border-b border-border bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
							children: ["Bay ", bay + 1]
						}), /* @__PURE__ */ jsxs("div", {
							className: "relative",
							children: [HOURS.map((h) => /* @__PURE__ */ jsx("div", { className: "h-16 border-b border-border" }, h)), BOOKINGS.filter((_, i) => i % 5 === bay).map((b, idx) => {
								const [h, m] = b.time.split(":").map(Number);
								const startPx = (h - 8) * 64 + m / 60 * 64;
								const heightPx = Math.max(28, b.durationMin / 60 * 64 - 4);
								return /* @__PURE__ */ jsxs("div", {
									className: "absolute left-1.5 right-1.5 rounded-md border-l-[3px] border-primary bg-primary/8 px-2 py-1.5 hover:bg-primary/15 cursor-pointer overflow-hidden",
									style: {
										top: startPx,
										height: heightPx
									},
									title: `${b.customer} — ${b.service}`,
									children: [
										/* @__PURE__ */ jsx("div", {
											className: "text-[11px] font-bold truncate",
											children: b.customer
										}),
										/* @__PURE__ */ jsx("div", {
											className: "text-[10px] text-muted-foreground truncate",
											children: b.service
										}),
										heightPx > 50 && /* @__PURE__ */ jsxs("div", {
											className: "text-[10px] text-muted-foreground mt-0.5",
											children: [
												b.tech,
												" · ",
												idx % 2 === 0 ? "60m" : "30m"
											]
										})
									]
								}, b.id);
							})]
						})]
					}, bay))]
				}),
				view === "list" && /* @__PURE__ */ jsxs("table", {
					className: "w-full text-sm",
					children: [/* @__PURE__ */ jsx("thead", {
						className: "bg-charcoal text-charcoal-foreground text-[11px] uppercase tracking-wider",
						children: /* @__PURE__ */ jsxs("tr", { children: [
							/* @__PURE__ */ jsx("th", {
								className: "text-left px-5 py-2.5",
								children: "Time"
							}),
							/* @__PURE__ */ jsx("th", {
								className: "text-left px-3 py-2.5",
								children: "Customer"
							}),
							/* @__PURE__ */ jsx("th", {
								className: "text-left px-3 py-2.5",
								children: "Vehicle"
							}),
							/* @__PURE__ */ jsx("th", {
								className: "text-left px-3 py-2.5",
								children: "Service"
							}),
							/* @__PURE__ */ jsx("th", {
								className: "text-left px-3 py-2.5",
								children: "Tech"
							}),
							/* @__PURE__ */ jsx("th", {
								className: "text-left px-3 py-2.5",
								children: "Status"
							})
						] })
					}), /* @__PURE__ */ jsx("tbody", {
						className: "divide-y divide-border",
						children: BOOKINGS.map((b) => /* @__PURE__ */ jsxs("tr", {
							className: "hover:bg-muted/40",
							children: [
								/* @__PURE__ */ jsx("td", {
									className: "px-5 py-3 font-mono text-xs",
									children: b.time
								}),
								/* @__PURE__ */ jsx("td", {
									className: "px-3 py-3 font-medium",
									children: b.customer
								}),
								/* @__PURE__ */ jsx("td", {
									className: "px-3 py-3 text-muted-foreground",
									children: b.vehicle
								}),
								/* @__PURE__ */ jsx("td", {
									className: "px-3 py-3",
									children: b.service
								}),
								/* @__PURE__ */ jsx("td", {
									className: "px-3 py-3 text-muted-foreground",
									children: b.tech
								}),
								/* @__PURE__ */ jsx("td", {
									className: "px-3 py-3",
									children: /* @__PURE__ */ jsx(StatusChip, {
										variant: statusVariant(b.status),
										children: b.status
									})
								})
							]
						}, b.id))
					})]
				}),
				view === "week" && /* @__PURE__ */ jsx("div", {
					className: "overflow-x-auto",
					children: /* @__PURE__ */ jsxs("div", {
						className: "grid grid-cols-[60px_repeat(7,minmax(120px,1fr))] divide-x divide-border min-w-[900px]",
						children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("div", { className: "h-10 border-b border-border" }), HOURS.map((h) => /* @__PURE__ */ jsxs("div", {
							className: "h-14 border-b border-border px-2 py-1 text-[11px] font-mono text-muted-foreground",
							children: [String(h).padStart(2, "0"), ":00"]
						}, h))] }), [
							"Mon",
							"Tue",
							"Wed",
							"Thu",
							"Fri",
							"Sat",
							"Sun"
						].map((day, dayIdx) => /* @__PURE__ */ jsxs("div", {
							className: "relative",
							children: [/* @__PURE__ */ jsxs("div", {
								className: "h-10 border-b border-border bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
								children: [
									day,
									" ",
									/* @__PURE__ */ jsx("span", {
										className: "text-foreground/60 normal-case font-mono",
										children: 15 + dayIdx
									})
								]
							}), /* @__PURE__ */ jsxs("div", {
								className: "relative",
								children: [HOURS.map((h) => /* @__PURE__ */ jsx("div", { className: "h-14 border-b border-border" }, h)), BOOKINGS.filter((_, i) => (i + dayIdx) % 7 < 3).slice(0, 3).map((b) => {
									const [h, m] = b.time.split(":").map(Number);
									return /* @__PURE__ */ jsxs("div", {
										className: "absolute left-1 right-1 rounded-md border-l-[3px] border-primary bg-primary/10 px-1.5 py-1 hover:bg-primary/20 cursor-pointer overflow-hidden",
										style: {
											top: (h - 8) * 56 + m / 60 * 56,
											height: Math.max(24, b.durationMin / 60 * 56 - 4)
										},
										title: `${b.customer} — ${b.service}`,
										children: [/* @__PURE__ */ jsx("div", {
											className: "text-[10px] font-bold truncate",
											children: b.customer
										}), /* @__PURE__ */ jsx("div", {
											className: "text-[10px] text-muted-foreground truncate",
											children: b.service
										})]
									}, b.id + day);
								})]
							})]
						}, day))]
					})
				})
			]
		})]
	});
}
//#endregion
export { Bookings as component };
