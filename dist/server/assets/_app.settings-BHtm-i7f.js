import { n as DEMO_PIN, r as STAFF } from "./auth-BDKp4kVI.js";
import { o as SERVICES } from "./mock-data-DAOLHDOp.js";
import { t as cn } from "./utils-C_uf36nf.js";
import { t as StatusChip } from "./status-chip-DXV3Hqca.js";
import { t as PageHeader } from "./page-header-CuwnNFAY.js";
import { useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { Bell, Building2, Calendar, Check, Link2, ParkingMeter, ScrollText, ShieldCheck, Tag, X } from "lucide-react";
//#region src/routes/_app.settings.tsx?tsr-split=component
var SECTIONS = [
	{
		id: "business",
		icon: Building2,
		name: "Business",
		desc: "Name, logo, hours, tax rate, receipt header"
	},
	{
		id: "catalog",
		icon: Tag,
		name: "Services Catalog",
		desc: "Services, add-ons, bundles, pricing tiers"
	},
	{
		id: "bays",
		icon: ParkingMeter,
		name: "Bays & Capacity",
		desc: "Bay types, capacity rules, maintenance"
	},
	{
		id: "booking",
		icon: Calendar,
		name: "Booking Rules",
		desc: "Lead time, deposits, cancellation policy"
	},
	{
		id: "access",
		icon: ShieldCheck,
		name: "Staff & Access",
		desc: "Roles, PIN length, timeout, lockout"
	},
	{
		id: "notify",
		icon: Bell,
		name: "Notifications",
		desc: "SMS, Email, WhatsApp templates"
	},
	{
		id: "integrations",
		icon: Link2,
		name: "Integrations",
		desc: "Payment terminal, QuickBooks, Google Calendar"
	},
	{
		id: "audit",
		icon: ScrollText,
		name: "Audit Log",
		desc: "All admin/manager actions, exportable"
	}
];
function Settings() {
	const [active, setActive] = useState("business");
	return /* @__PURE__ */ jsxs("div", {
		className: "p-6",
		children: [/* @__PURE__ */ jsx(PageHeader, {
			title: "Settings",
			subtitle: "Admin-only · all changes audited"
		}), /* @__PURE__ */ jsxs("div", {
			className: "grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-5",
			children: [/* @__PURE__ */ jsx("nav", {
				className: "rounded-xl border border-border bg-card shadow-card p-2 h-fit",
				children: SECTIONS.map(({ id, icon: Icon, name }) => /* @__PURE__ */ jsxs("button", {
					onClick: () => setActive(id),
					className: cn("w-full flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-left transition-colors", active === id ? "bg-primary/10 text-primary font-semibold" : "text-muted-foreground hover:bg-muted hover:text-foreground"),
					children: [/* @__PURE__ */ jsx(Icon, { className: "h-4 w-4 shrink-0" }), name]
				}, id))
			}), /* @__PURE__ */ jsxs("div", {
				className: "rounded-xl border border-border bg-card shadow-card p-6 min-h-[420px]",
				children: [
					active === "business" && /* @__PURE__ */ jsx(BusinessPanel, {}),
					active === "catalog" && /* @__PURE__ */ jsx(CatalogPanel, {}),
					active === "bays" && /* @__PURE__ */ jsx(BaysPanel, {}),
					active === "booking" && /* @__PURE__ */ jsx(BookingRulesPanel, {}),
					active === "access" && /* @__PURE__ */ jsx(AccessPanel, {}),
					active === "notify" && /* @__PURE__ */ jsx(NotifyPanel, {}),
					active === "integrations" && /* @__PURE__ */ jsx(IntegrationsPanel, {}),
					active === "audit" && /* @__PURE__ */ jsx(AuditPanel, {})
				]
			})]
		})]
	});
}
function SectionTitle({ title, desc }) {
	return /* @__PURE__ */ jsxs("div", {
		className: "mb-5 border-b border-border pb-4",
		children: [/* @__PURE__ */ jsx("h2", {
			className: "font-display text-lg font-bold",
			children: title
		}), /* @__PURE__ */ jsx("p", {
			className: "text-sm text-muted-foreground mt-0.5",
			children: desc
		})]
	});
}
function Field({ label, value, hint }) {
	return /* @__PURE__ */ jsxs("label", {
		className: "block",
		children: [
			/* @__PURE__ */ jsx("span", {
				className: "text-xs font-semibold uppercase tracking-wider text-muted-foreground",
				children: label
			}),
			/* @__PURE__ */ jsx("input", {
				defaultValue: value,
				className: "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
			}),
			hint && /* @__PURE__ */ jsx("span", {
				className: "mt-1 block text-[11px] text-muted-foreground",
				children: hint
			})
		]
	});
}
function BusinessPanel() {
	return /* @__PURE__ */ jsxs(Fragment, { children: [
		/* @__PURE__ */ jsx(SectionTitle, {
			title: "Business",
			desc: "Information used on invoices and customer-facing communications."
		}),
		/* @__PURE__ */ jsxs("div", {
			className: "grid grid-cols-1 md:grid-cols-2 gap-4",
			children: [
				/* @__PURE__ */ jsx(Field, {
					label: "Business Name",
					value: "Polish Station (Pvt) Ltd"
				}),
				/* @__PURE__ */ jsx(Field, {
					label: "Trading Name",
					value: "Polish Station"
				}),
				/* @__PURE__ */ jsx(Field, {
					label: "VAT / Tax No.",
					value: "VAT-184220985-7000"
				}),
				/* @__PURE__ */ jsx(Field, {
					label: "Phone",
					value: "+94 11 250 8821"
				}),
				/* @__PURE__ */ jsx(Field, {
					label: "Email",
					value: "hello@polishstation.lk"
				}),
				/* @__PURE__ */ jsx(Field, {
					label: "Address",
					value: "No. 142, Havelock Rd, Colombo 05"
				}),
				/* @__PURE__ */ jsx(Field, {
					label: "Opening Hours",
					value: "Mon–Sat · 08:00–18:00"
				}),
				/* @__PURE__ */ jsx(Field, {
					label: "VAT Rate",
					value: "18%",
					hint: "Applied to all taxable line items at checkout."
				})
			]
		}),
		/* @__PURE__ */ jsxs("div", {
			className: "mt-6 flex gap-2 justify-end",
			children: [/* @__PURE__ */ jsx("button", {
				className: "rounded-md border border-input px-4 py-2 text-sm",
				children: "Cancel"
			}), /* @__PURE__ */ jsx("button", {
				className: "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-red",
				children: "Save Changes"
			})]
		})
	] });
}
function CatalogPanel() {
	return /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsx(SectionTitle, {
		title: "Services Catalog",
		desc: "Add, edit and price the services on offer."
	}), /* @__PURE__ */ jsxs("table", {
		className: "w-full text-sm",
		children: [/* @__PURE__ */ jsx("thead", {
			className: "text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border",
			children: /* @__PURE__ */ jsxs("tr", { children: [
				/* @__PURE__ */ jsx("th", {
					className: "text-left py-2",
					children: "Service"
				}),
				/* @__PURE__ */ jsx("th", {
					className: "text-left py-2",
					children: "Category"
				}),
				/* @__PURE__ */ jsx("th", {
					className: "text-right py-2",
					children: "Duration"
				}),
				/* @__PURE__ */ jsx("th", {
					className: "text-right py-2",
					children: "Price"
				}),
				/* @__PURE__ */ jsx("th", {})
			] })
		}), /* @__PURE__ */ jsx("tbody", {
			className: "divide-y divide-border",
			children: SERVICES.map((s) => /* @__PURE__ */ jsxs("tr", { children: [
				/* @__PURE__ */ jsx("td", {
					className: "py-3 font-medium",
					children: s.name
				}),
				/* @__PURE__ */ jsx("td", {
					className: "py-3 text-muted-foreground",
					children: s.category
				}),
				/* @__PURE__ */ jsxs("td", {
					className: "py-3 text-right font-mono",
					children: [s.durationMin, "m"]
				}),
				/* @__PURE__ */ jsxs("td", {
					className: "py-3 text-right font-mono font-semibold",
					children: ["LKR ", s.price.toLocaleString()]
				}),
				/* @__PURE__ */ jsx("td", {
					className: "py-3 text-right",
					children: /* @__PURE__ */ jsx("button", {
						className: "text-xs text-primary hover:underline",
						children: "Edit"
					})
				})
			] }, s.id))
		})]
	})] });
}
function BaysPanel() {
	return /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsx(SectionTitle, {
		title: "Bays & Capacity",
		desc: "Configure service bays and their daily capacity rules."
	}), /* @__PURE__ */ jsx("div", {
		className: "grid grid-cols-1 md:grid-cols-2 gap-3",
		children: [
			{
				id: "Bay 1",
				type: "Wash + Detail",
				status: "Active"
			},
			{
				id: "Bay 2",
				type: "Wash",
				status: "Active"
			},
			{
				id: "Bay 3",
				type: "Paint Correction",
				status: "Maintenance"
			},
			{
				id: "Bay 4",
				type: "Coating Booth",
				status: "Active"
			},
			{
				id: "Bay 5",
				type: "Express",
				status: "Active"
			}
		].map((b) => /* @__PURE__ */ jsxs("div", {
			className: "flex items-center justify-between rounded-lg border border-border p-3",
			children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("div", {
				className: "font-display font-bold",
				children: b.id
			}), /* @__PURE__ */ jsx("div", {
				className: "text-xs text-muted-foreground",
				children: b.type
			})] }), /* @__PURE__ */ jsx(StatusChip, {
				variant: b.status === "Active" ? "success" : "warning",
				children: b.status
			})]
		}, b.id))
	})] });
}
function BookingRulesPanel() {
	return /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsx(SectionTitle, {
		title: "Booking Rules",
		desc: "Policies enforced at the point of booking and cancellation."
	}), /* @__PURE__ */ jsx("div", {
		className: "divide-y divide-border",
		children: [
			["Minimum lead time", "30 minutes"],
			["Maximum advance booking", "60 days"],
			["Deposit required (>LKR 25k)", "20%"],
			["Cancellation window", "24 hours"],
			["No-show penalty", "LKR 1,500"],
			["Auto-confirm walk-ins", "Yes"]
		].map(([k, v]) => /* @__PURE__ */ jsxs("div", {
			className: "flex items-center justify-between py-3",
			children: [/* @__PURE__ */ jsx("span", {
				className: "text-sm",
				children: k
			}), /* @__PURE__ */ jsx("span", {
				className: "font-mono text-sm font-semibold",
				children: v
			})]
		}, k))
	})] });
}
function AccessPanel() {
	return /* @__PURE__ */ jsxs(Fragment, { children: [
		/* @__PURE__ */ jsx(SectionTitle, {
			title: "Staff & Access",
			desc: "Roles, PIN policy and session controls."
		}),
		/* @__PURE__ */ jsxs("div", {
			className: "grid grid-cols-2 md:grid-cols-4 gap-3 mb-5",
			children: [
				/* @__PURE__ */ jsxs("div", {
					className: "rounded-lg border border-border p-3",
					children: [/* @__PURE__ */ jsx("div", {
						className: "text-[11px] uppercase tracking-wider text-muted-foreground",
						children: "PIN Length"
					}), /* @__PURE__ */ jsx("div", {
						className: "font-display text-xl font-bold",
						children: "5 digits"
					})]
				}),
				/* @__PURE__ */ jsxs("div", {
					className: "rounded-lg border border-border p-3",
					children: [/* @__PURE__ */ jsx("div", {
						className: "text-[11px] uppercase tracking-wider text-muted-foreground",
						children: "Demo PIN"
					}), /* @__PURE__ */ jsx("div", {
						className: "font-display text-xl font-bold font-mono",
						children: DEMO_PIN
					})]
				}),
				/* @__PURE__ */ jsxs("div", {
					className: "rounded-lg border border-border p-3",
					children: [/* @__PURE__ */ jsx("div", {
						className: "text-[11px] uppercase tracking-wider text-muted-foreground",
						children: "Session Timeout"
					}), /* @__PURE__ */ jsx("div", {
						className: "font-display text-xl font-bold",
						children: "15 min"
					})]
				}),
				/* @__PURE__ */ jsxs("div", {
					className: "rounded-lg border border-border p-3",
					children: [/* @__PURE__ */ jsx("div", {
						className: "text-[11px] uppercase tracking-wider text-muted-foreground",
						children: "Lockout"
					}), /* @__PURE__ */ jsx("div", {
						className: "font-display text-xl font-bold",
						children: "3 fails · 60s"
					})]
				})
			]
		}),
		/* @__PURE__ */ jsxs("table", {
			className: "w-full text-sm",
			children: [/* @__PURE__ */ jsx("thead", {
				className: "text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border",
				children: /* @__PURE__ */ jsxs("tr", { children: [
					/* @__PURE__ */ jsx("th", {
						className: "text-left py-2",
						children: "Name"
					}),
					/* @__PURE__ */ jsx("th", {
						className: "text-left py-2",
						children: "Role"
					}),
					/* @__PURE__ */ jsx("th", {
						className: "text-left py-2",
						children: "PIN"
					}),
					/* @__PURE__ */ jsx("th", {
						className: "text-left py-2",
						children: "Status"
					})
				] })
			}), /* @__PURE__ */ jsx("tbody", {
				className: "divide-y divide-border",
				children: STAFF.map((s) => /* @__PURE__ */ jsxs("tr", { children: [
					/* @__PURE__ */ jsx("td", {
						className: "py-2.5 font-medium",
						children: s.name
					}),
					/* @__PURE__ */ jsx("td", {
						className: "py-2.5 text-muted-foreground",
						children: s.role
					}),
					/* @__PURE__ */ jsx("td", {
						className: "py-2.5 font-mono",
						children: "●●●●●"
					}),
					/* @__PURE__ */ jsx("td", {
						className: "py-2.5",
						children: /* @__PURE__ */ jsx(StatusChip, {
							variant: "success",
							children: "Active"
						})
					})
				] }, s.id))
			})]
		})
	] });
}
function NotifyPanel() {
	return /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsx(SectionTitle, {
		title: "Notifications",
		desc: "Toggle outbound channels and message templates."
	}), /* @__PURE__ */ jsx("div", {
		className: "divide-y divide-border",
		children: [
			{
				name: "SMS — Booking Confirmation",
				on: true
			},
			{
				name: "SMS — Ready for Pickup",
				on: true
			},
			{
				name: "Email — Receipt",
				on: true
			},
			{
				name: "WhatsApp — Before/After Photos",
				on: true
			},
			{
				name: "Email — Marketing Campaigns",
				on: false
			}
		].map((c) => /* @__PURE__ */ jsxs("div", {
			className: "flex items-center justify-between py-3",
			children: [/* @__PURE__ */ jsx("span", {
				className: "text-sm",
				children: c.name
			}), /* @__PURE__ */ jsx("span", {
				className: cn("inline-flex h-6 w-11 items-center rounded-full p-0.5 transition-colors", c.on ? "bg-primary" : "bg-muted"),
				children: /* @__PURE__ */ jsx("span", { className: cn("h-5 w-5 rounded-full bg-white shadow transition-transform", c.on ? "translate-x-5" : "translate-x-0") })
			})]
		}, c.name))
	})] });
}
function IntegrationsPanel() {
	return /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsx(SectionTitle, {
		title: "Integrations",
		desc: "Connect Polish Station OS to external services."
	}), /* @__PURE__ */ jsx("div", {
		className: "grid grid-cols-1 md:grid-cols-2 gap-3",
		children: [
			{
				name: "Stripe Terminal",
				connected: true,
				desc: "Card-present payments"
			},
			{
				name: "QuickBooks Online",
				connected: true,
				desc: "Daily revenue sync"
			},
			{
				name: "Google Calendar",
				connected: false,
				desc: "Two-way booking sync"
			},
			{
				name: "WhatsApp Business API",
				connected: true,
				desc: "Customer messaging"
			},
			{
				name: "Mailchimp",
				connected: false,
				desc: "Email marketing"
			}
		].map((a) => /* @__PURE__ */ jsxs("div", {
			className: "flex items-center justify-between rounded-lg border border-border p-4",
			children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("div", {
				className: "font-display font-bold",
				children: a.name
			}), /* @__PURE__ */ jsx("div", {
				className: "text-xs text-muted-foreground",
				children: a.desc
			})] }), a.connected ? /* @__PURE__ */ jsxs("span", {
				className: "inline-flex items-center gap-1 rounded-full bg-success/15 text-success border border-success/30 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
				children: [/* @__PURE__ */ jsx(Check, { className: "h-3 w-3" }), " Connected"]
			}) : /* @__PURE__ */ jsxs("button", {
				className: "inline-flex items-center gap-1 rounded-md border border-input px-3 py-1.5 text-xs hover:bg-accent",
				children: [/* @__PURE__ */ jsx(X, { className: "h-3 w-3" }), " Connect"]
			})]
		}, a.name))
	})] });
}
function AuditPanel() {
	return /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsx(SectionTitle, {
		title: "Audit Log",
		desc: "All admin and manager actions are recorded immutably."
	}), /* @__PURE__ */ jsxs("table", {
		className: "w-full text-sm",
		children: [/* @__PURE__ */ jsx("thead", {
			className: "text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border",
			children: /* @__PURE__ */ jsxs("tr", { children: [
				/* @__PURE__ */ jsx("th", {
					className: "text-left py-2",
					children: "Time"
				}),
				/* @__PURE__ */ jsx("th", {
					className: "text-left py-2",
					children: "User"
				}),
				/* @__PURE__ */ jsx("th", {
					className: "text-left py-2",
					children: "Role"
				}),
				/* @__PURE__ */ jsx("th", {
					className: "text-left py-2",
					children: "Action"
				})
			] })
		}), /* @__PURE__ */ jsx("tbody", {
			className: "divide-y divide-border",
			children: [
				{
					t: "09:42",
					who: "Ravi M.",
					action: "Adjusted price on INV-2090",
					role: "Manager"
				},
				{
					t: "09:31",
					who: "Asha P.",
					action: "Created new staff: Tharu K.",
					role: "Admin"
				},
				{
					t: "09:14",
					who: "Niro D.",
					action: "Cancelled booking B-207",
					role: "Advisor"
				},
				{
					t: "08:50",
					who: "Asha P.",
					action: "Changed VAT rate to 18%",
					role: "Admin"
				},
				{
					t: "08:32",
					who: "Ravi M.",
					action: "Voided INV-2084",
					role: "Manager"
				}
			].map((e, i) => /* @__PURE__ */ jsxs("tr", { children: [
				/* @__PURE__ */ jsx("td", {
					className: "py-2.5 font-mono text-xs text-muted-foreground",
					children: e.t
				}),
				/* @__PURE__ */ jsx("td", {
					className: "py-2.5 font-medium",
					children: e.who
				}),
				/* @__PURE__ */ jsx("td", {
					className: "py-2.5",
					children: /* @__PURE__ */ jsx(StatusChip, {
						variant: "neutral",
						children: e.role
					})
				}),
				/* @__PURE__ */ jsx("td", {
					className: "py-2.5",
					children: e.action
				})
			] }, i))
		})]
	})] });
}
//#endregion
export { Settings as component };
