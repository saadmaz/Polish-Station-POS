import { i as useAuth } from "./auth-BDKp4kVI.js";
import { i as INVOICES, n as CUSTOMERS, o as SERVICES, t as BOOKINGS } from "./mock-data-DAOLHDOp.js";
import { t as cn } from "./utils-C_uf36nf.js";
import * as React from "react";
import { useEffect, useState } from "react";
import { Link, Navigate, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { toast } from "sonner";
import { AlertTriangle, BarChart3, Bell, Boxes, Calendar, CheckCircle2, ChevronsLeft, ChevronsRight, Clock, CreditCard, FileText, LayoutDashboard, Lock, MapPin, Plus, Search, Settings, User, UserCog, Users, Wrench, X } from "lucide-react";
import { Command } from "cmdk";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cva } from "class-variance-authority";
import * as PopoverPrimitive from "@radix-ui/react-popover";
//#region src/components/app-sidebar.tsx
var NAV = [
	{
		to: "/dashboard",
		label: "Dashboard",
		icon: LayoutDashboard
	},
	{
		to: "/bookings",
		label: "Bookings",
		icon: Calendar
	},
	{
		to: "/jobs",
		label: "Active Jobs",
		icon: Wrench
	},
	{
		to: "/customers",
		label: "Customers",
		icon: Users
	},
	{
		to: "/inventory",
		label: "Inventory",
		icon: Boxes
	},
	{
		to: "/pos",
		label: "POS / Checkout",
		icon: CreditCard
	},
	{
		to: "/staff",
		label: "Staff",
		icon: UserCog
	},
	{
		to: "/reports",
		label: "Reports",
		icon: BarChart3
	},
	{
		to: "/settings",
		label: "Settings",
		icon: Settings
	}
];
function AppSidebar() {
	const [collapsed, setCollapsed] = useState(false);
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const { staff, logout } = useAuth();
	const navigate = useNavigate();
	return /* @__PURE__ */ jsxs("aside", {
		className: cn("flex h-screen flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200", collapsed ? "w-16" : "w-56"),
		children: [
			/* @__PURE__ */ jsxs("div", {
				className: "flex items-center gap-2 px-4 py-5",
				children: [/* @__PURE__ */ jsx("div", {
					className: "grid h-9 w-9 place-items-center rounded-md gradient-brand shadow-red",
					children: /* @__PURE__ */ jsx("span", {
						className: "font-display text-base font-black text-primary-foreground",
						children: "PS"
					})
				}), !collapsed && /* @__PURE__ */ jsxs("div", {
					className: "leading-tight",
					children: [/* @__PURE__ */ jsx("div", {
						className: "text-xs font-semibold tracking-[0.18em] text-sidebar-foreground/70",
						children: "POLISH"
					}), /* @__PURE__ */ jsx("div", {
						className: "-mt-0.5 text-sm font-bold text-sidebar-foreground",
						children: "STATION OS"
					})]
				})]
			}),
			/* @__PURE__ */ jsx("nav", {
				className: "flex-1 space-y-0.5 px-2 pt-2",
				children: NAV.map(({ to, label, icon: Icon }) => {
					const active = pathname.startsWith(to);
					return /* @__PURE__ */ jsxs(Link, {
						to,
						className: cn("group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors", active ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"),
						children: [
							active && /* @__PURE__ */ jsx("span", { className: "absolute inset-y-1 left-0 w-1 rounded-r bg-sidebar-primary" }),
							/* @__PURE__ */ jsx(Icon, { className: "h-5 w-5 shrink-0" }),
							!collapsed && /* @__PURE__ */ jsx("span", {
								className: "truncate",
								children: label
							})
						]
					}, to);
				})
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "mt-auto border-t border-sidebar-border p-2",
				children: [staff && /* @__PURE__ */ jsxs("div", {
					className: cn("flex items-center gap-2 rounded-md p-2", collapsed && "justify-center"),
					children: [
						/* @__PURE__ */ jsx("div", {
							className: "grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-semibold text-primary-foreground",
							style: { background: staff.color },
							children: staff.name.split(" ").map((p) => p[0]).join("")
						}),
						!collapsed && /* @__PURE__ */ jsxs("div", {
							className: "min-w-0 flex-1 leading-tight",
							children: [/* @__PURE__ */ jsx("div", {
								className: "truncate text-sm font-semibold",
								children: staff.name
							}), /* @__PURE__ */ jsx("div", {
								className: "text-[11px] uppercase tracking-wider text-sidebar-foreground/60",
								children: staff.role
							})]
						}),
						!collapsed && /* @__PURE__ */ jsx("button", {
							"aria-label": "Lock",
							onClick: () => {
								logout();
								navigate({ to: "/" });
							},
							className: "rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
							children: /* @__PURE__ */ jsx(Lock, { className: "h-4 w-4" })
						})
					]
				}), /* @__PURE__ */ jsx("button", {
					onClick: () => setCollapsed((c) => !c),
					className: "mt-1 flex w-full items-center justify-center gap-2 rounded-md py-2 text-xs text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground",
					children: collapsed ? /* @__PURE__ */ jsx(ChevronsRight, { className: "h-4 w-4" }) : /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsx(ChevronsLeft, { className: "h-4 w-4" }), " Collapse"] })
				})]
			})
		]
	});
}
//#endregion
//#region src/components/ui/dialog.tsx
var Dialog = DialogPrimitive.Root;
var DialogPortal = DialogPrimitive.Portal;
var DialogOverlay = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(DialogPrimitive.Overlay, {
	ref,
	className: cn("fixed inset-0 z-50 bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0", className),
	...props
}));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;
var DialogContent = React.forwardRef(({ className, children, ...props }, ref) => /* @__PURE__ */ jsxs(DialogPortal, { children: [/* @__PURE__ */ jsx(DialogOverlay, {}), /* @__PURE__ */ jsxs(DialogPrimitive.Content, {
	ref,
	className: cn("fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg", className),
	...props,
	children: [children, /* @__PURE__ */ jsxs(DialogPrimitive.Close, {
		className: "absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background cursor-pointer transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground",
		children: [/* @__PURE__ */ jsx(X, { className: "h-4 w-4" }), /* @__PURE__ */ jsx("span", {
			className: "sr-only",
			children: "Close"
		})]
	})]
})] }));
DialogContent.displayName = DialogPrimitive.Content.displayName;
var DialogHeader = ({ className, ...props }) => /* @__PURE__ */ jsx("div", {
	className: cn("flex flex-col space-y-1.5 text-center sm:text-left", className),
	...props
});
DialogHeader.displayName = "DialogHeader";
var DialogFooter = ({ className, ...props }) => /* @__PURE__ */ jsx("div", {
	className: cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className),
	...props
});
DialogFooter.displayName = "DialogFooter";
var DialogTitle = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(DialogPrimitive.Title, {
	ref,
	className: cn("text-lg font-semibold leading-none tracking-tight", className),
	...props
}));
DialogTitle.displayName = DialogPrimitive.Title.displayName;
var DialogDescription = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(DialogPrimitive.Description, {
	ref,
	className: cn("text-sm text-muted-foreground", className),
	...props
}));
DialogDescription.displayName = DialogPrimitive.Description.displayName;
//#endregion
//#region src/components/ui/command.tsx
var Command$1 = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(Command, {
	ref,
	className: cn("flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground", className),
	...props
}));
Command$1.displayName = Command.displayName;
var CommandDialog = ({ children, ...props }) => {
	return /* @__PURE__ */ jsx(Dialog, {
		...props,
		children: /* @__PURE__ */ jsx(DialogContent, {
			className: "overflow-hidden p-0",
			children: /* @__PURE__ */ jsx(Command$1, {
				className: "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5",
				children
			})
		})
	});
};
var CommandInput = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsxs("div", {
	className: "flex items-center border-b px-3",
	"cmdk-input-wrapper": "",
	children: [/* @__PURE__ */ jsx(Search, { className: "mr-2 h-4 w-4 shrink-0 opacity-50" }), /* @__PURE__ */ jsx(Command.Input, {
		ref,
		className: cn("flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50", className),
		...props
	})]
}));
CommandInput.displayName = Command.Input.displayName;
var CommandList = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(Command.List, {
	ref,
	className: cn("max-h-[300px] overflow-y-auto overflow-x-hidden", className),
	...props
}));
CommandList.displayName = Command.List.displayName;
var CommandEmpty = React.forwardRef((props, ref) => /* @__PURE__ */ jsx(Command.Empty, {
	ref,
	className: "py-6 text-center text-sm",
	...props
}));
CommandEmpty.displayName = Command.Empty.displayName;
var CommandGroup = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(Command.Group, {
	ref,
	className: cn("overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground", className),
	...props
}));
CommandGroup.displayName = Command.Group.displayName;
var CommandSeparator = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(Command.Separator, {
	ref,
	className: cn("-mx-1 h-px bg-border", className),
	...props
}));
CommandSeparator.displayName = Command.Separator.displayName;
var CommandItem = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(Command.Item, {
	ref,
	className: cn("relative flex cursor-default gap-2 select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[disabled=true]:pointer-events-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0", className),
	...props
}));
CommandItem.displayName = Command.Item.displayName;
var CommandShortcut = ({ className, ...props }) => {
	return /* @__PURE__ */ jsx("span", {
		className: cn("ml-auto text-xs tracking-widest text-muted-foreground", className),
		...props
	});
};
CommandShortcut.displayName = "CommandShortcut";
//#endregion
//#region src/components/search-palette.tsx
function SearchPalette({ open, onOpenChange }) {
	const navigate = useNavigate();
	const [query, setQuery] = useState("");
	useEffect(() => {
		const handler = (e) => {
			if ((e.metaKey || e.ctrlKey) && e.key === "k") {
				e.preventDefault();
				onOpenChange(true);
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [onOpenChange]);
	const q = query.toLowerCase();
	const matchedCustomers = CUSTOMERS.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.email.toLowerCase().includes(q));
	const matchedBookings = BOOKINGS.filter((b) => b.customer.toLowerCase().includes(q) || b.service.toLowerCase().includes(q) || b.id.toLowerCase().includes(q));
	const matchedInvoices = INVOICES.filter((i) => i.customer.toLowerCase().includes(q) || i.id.toLowerCase().includes(q) || i.status.toLowerCase().includes(q));
	function go(to) {
		onOpenChange(false);
		setQuery("");
		navigate({ to });
	}
	return /* @__PURE__ */ jsxs(CommandDialog, {
		open,
		onOpenChange,
		children: [/* @__PURE__ */ jsx(CommandInput, {
			placeholder: "Search customers, bookings, invoices…",
			value: query,
			onValueChange: setQuery
		}), /* @__PURE__ */ jsxs(CommandList, { children: [
			/* @__PURE__ */ jsx(CommandEmpty, { children: "No results found." }),
			matchedCustomers.length > 0 && /* @__PURE__ */ jsx(CommandGroup, {
				heading: "Customers",
				children: matchedCustomers.map((c) => /* @__PURE__ */ jsxs(CommandItem, {
					value: c.id + c.name,
					onSelect: () => go("/customers"),
					children: [
						/* @__PURE__ */ jsx(User, { className: "mr-2 h-4 w-4 text-muted-foreground" }),
						/* @__PURE__ */ jsx("span", {
							className: "font-medium",
							children: c.name
						}),
						/* @__PURE__ */ jsxs("span", {
							className: "ml-2 text-xs text-muted-foreground",
							children: [
								c.phone,
								" · ",
								c.tier
							]
						})
					]
				}, c.id))
			}),
			matchedCustomers.length > 0 && matchedBookings.length > 0 && /* @__PURE__ */ jsx(CommandSeparator, {}),
			matchedBookings.length > 0 && /* @__PURE__ */ jsx(CommandGroup, {
				heading: "Bookings",
				children: matchedBookings.map((b) => /* @__PURE__ */ jsxs(CommandItem, {
					value: b.id + b.customer,
					onSelect: () => go("/bookings"),
					children: [
						/* @__PURE__ */ jsx(Calendar, { className: "mr-2 h-4 w-4 text-muted-foreground" }),
						/* @__PURE__ */ jsx("span", {
							className: "font-medium",
							children: b.id
						}),
						/* @__PURE__ */ jsx("span", {
							className: "ml-2 text-sm",
							children: b.customer
						}),
						/* @__PURE__ */ jsxs("span", {
							className: "ml-2 text-xs text-muted-foreground",
							children: [
								b.time,
								" · ",
								b.service
							]
						})
					]
				}, b.id))
			}),
			matchedBookings.length > 0 && matchedInvoices.length > 0 && /* @__PURE__ */ jsx(CommandSeparator, {}),
			matchedInvoices.length > 0 && /* @__PURE__ */ jsx(CommandGroup, {
				heading: "Invoices",
				children: matchedInvoices.map((i) => /* @__PURE__ */ jsxs(CommandItem, {
					value: i.id + i.customer,
					onSelect: () => go("/pos"),
					children: [
						/* @__PURE__ */ jsx(FileText, { className: "mr-2 h-4 w-4 text-muted-foreground" }),
						/* @__PURE__ */ jsx("span", {
							className: "font-medium",
							children: i.id
						}),
						/* @__PURE__ */ jsx("span", {
							className: "ml-2 text-sm",
							children: i.customer
						}),
						/* @__PURE__ */ jsxs("span", {
							className: "ml-2 text-xs text-muted-foreground",
							children: [
								"Rs ",
								i.total.toLocaleString(),
								" · ",
								i.status
							]
						})
					]
				}, i.id))
			})
		] })]
	});
}
//#endregion
//#region src/components/ui/sheet.tsx
var Sheet = DialogPrimitive.Root;
var SheetPortal = DialogPrimitive.Portal;
var SheetOverlay = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(DialogPrimitive.Overlay, {
	className: cn("fixed inset-0 z-50 bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0", className),
	...props,
	ref
}));
SheetOverlay.displayName = DialogPrimitive.Overlay.displayName;
var sheetVariants = cva("fixed z-50 gap-4 bg-background p-6 shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500 data-[state=open]:animate-in data-[state=closed]:animate-out", {
	variants: { side: {
		top: "inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
		bottom: "inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
		left: "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
		right: "inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm"
	} },
	defaultVariants: { side: "right" }
});
var SheetContent = React.forwardRef(({ side = "right", className, children, ...props }, ref) => /* @__PURE__ */ jsxs(SheetPortal, { children: [/* @__PURE__ */ jsx(SheetOverlay, {}), /* @__PURE__ */ jsxs(DialogPrimitive.Content, {
	ref,
	className: cn(sheetVariants({ side }), className),
	...props,
	children: [/* @__PURE__ */ jsxs(DialogPrimitive.Close, {
		className: "absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background cursor-pointer transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary",
		children: [/* @__PURE__ */ jsx(X, { className: "h-4 w-4" }), /* @__PURE__ */ jsx("span", {
			className: "sr-only",
			children: "Close"
		})]
	}), children]
})] }));
SheetContent.displayName = DialogPrimitive.Content.displayName;
var SheetHeader = ({ className, ...props }) => /* @__PURE__ */ jsx("div", {
	className: cn("flex flex-col space-y-2 text-center sm:text-left", className),
	...props
});
SheetHeader.displayName = "SheetHeader";
var SheetFooter = ({ className, ...props }) => /* @__PURE__ */ jsx("div", {
	className: cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className),
	...props
});
SheetFooter.displayName = "SheetFooter";
var SheetTitle = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(DialogPrimitive.Title, {
	ref,
	className: cn("text-lg font-semibold text-foreground", className),
	...props
}));
SheetTitle.displayName = DialogPrimitive.Title.displayName;
var SheetDescription = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(DialogPrimitive.Description, {
	ref,
	className: cn("text-sm text-muted-foreground", className),
	...props
}));
SheetDescription.displayName = DialogPrimitive.Description.displayName;
//#endregion
//#region src/components/walk-in-sheet.tsx
var EMPTY$1 = {
	name: "",
	phone: "",
	plate: "",
	serviceId: ""
};
function WalkInSheet({ open, onOpenChange }) {
	const [form, setForm] = useState(EMPTY$1);
	const [submitting, setSubmitting] = useState(false);
	function set(field, value) {
		setForm((f) => ({
			...f,
			[field]: value
		}));
	}
	function handleSubmit(e) {
		e.preventDefault();
		if (!form.name.trim() || !form.serviceId) return;
		setSubmitting(true);
		setTimeout(() => {
			const svc = SERVICES.find((s) => s.id === form.serviceId);
			toast.success("Walk-in created", { description: `${form.name} — ${svc?.name ?? ""} added to the queue.` });
			setForm(EMPTY$1);
			setSubmitting(false);
			onOpenChange(false);
		}, 600);
	}
	return /* @__PURE__ */ jsx(Sheet, {
		open,
		onOpenChange,
		children: /* @__PURE__ */ jsxs(SheetContent, {
			className: "w-full sm:max-w-md flex flex-col",
			children: [/* @__PURE__ */ jsxs(SheetHeader, { children: [/* @__PURE__ */ jsx(SheetTitle, { children: "New Walk-In" }), /* @__PURE__ */ jsx(SheetDescription, { children: "Add a walk-in customer to the queue." })] }), /* @__PURE__ */ jsxs("form", {
				onSubmit: handleSubmit,
				className: "flex flex-col flex-1 gap-5 py-4",
				children: [
					/* @__PURE__ */ jsxs("div", {
						className: "space-y-1.5",
						children: [/* @__PURE__ */ jsx("label", {
							className: "text-sm font-medium",
							children: "Customer Name *"
						}), /* @__PURE__ */ jsx("input", {
							required: true,
							className: "w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring",
							placeholder: "e.g. Hasini Wijesuriya",
							value: form.name,
							onChange: (e) => set("name", e.target.value)
						})]
					}),
					/* @__PURE__ */ jsxs("div", {
						className: "space-y-1.5",
						children: [/* @__PURE__ */ jsx("label", {
							className: "text-sm font-medium",
							children: "Phone"
						}), /* @__PURE__ */ jsx("input", {
							className: "w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring",
							placeholder: "+94 77 000 0000",
							value: form.phone,
							onChange: (e) => set("phone", e.target.value)
						})]
					}),
					/* @__PURE__ */ jsxs("div", {
						className: "space-y-1.5",
						children: [/* @__PURE__ */ jsx("label", {
							className: "text-sm font-medium",
							children: "Plate Number"
						}), /* @__PURE__ */ jsx("input", {
							className: "w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring",
							placeholder: "e.g. WP CAR-1234",
							value: form.plate,
							onChange: (e) => set("plate", e.target.value)
						})]
					}),
					/* @__PURE__ */ jsxs("div", {
						className: "space-y-1.5",
						children: [/* @__PURE__ */ jsx("label", {
							className: "text-sm font-medium",
							children: "Service *"
						}), /* @__PURE__ */ jsxs("select", {
							required: true,
							className: "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring",
							value: form.serviceId,
							onChange: (e) => set("serviceId", e.target.value),
							children: [/* @__PURE__ */ jsx("option", {
								value: "",
								children: "Select a service…"
							}), SERVICES.map((s) => /* @__PURE__ */ jsxs("option", {
								value: s.id,
								children: [
									s.name,
									" — Rs ",
									s.price.toLocaleString(),
									" (",
									s.durationMin,
									"m)"
								]
							}, s.id))]
						})]
					}),
					/* @__PURE__ */ jsxs(SheetFooter, {
						className: "mt-auto pt-4",
						children: [/* @__PURE__ */ jsx("button", {
							type: "button",
							onClick: () => onOpenChange(false),
							className: "flex-1 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent",
							children: "Cancel"
						}), /* @__PURE__ */ jsx("button", {
							type: "submit",
							disabled: submitting,
							className: "flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-red hover:bg-primary/90 disabled:opacity-60",
							children: submitting ? "Adding…" : "Add to Queue"
						})]
					})
				]
			})]
		})
	});
}
//#endregion
//#region src/components/booking-sheet.tsx
var EMPTY = {
	name: "",
	phone: "",
	plate: "",
	serviceId: "",
	date: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
	time: "09:00"
};
var HOURS = Array.from({ length: 20 }, (_, i) => {
	const h = 8 + Math.floor(i / 2);
	const m = i % 2 === 0 ? "00" : "30";
	return `${String(h).padStart(2, "0")}:${m}`;
});
function BookingSheet({ open, onOpenChange }) {
	const [form, setForm] = useState(EMPTY);
	const [submitting, setSubmitting] = useState(false);
	function set(field, value) {
		setForm((f) => ({
			...f,
			[field]: value
		}));
	}
	function handleSubmit(e) {
		e.preventDefault();
		if (!form.name.trim() || !form.serviceId) return;
		setSubmitting(true);
		setTimeout(() => {
			const svc = SERVICES.find((s) => s.id === form.serviceId);
			toast.success("Booking confirmed", { description: `${form.name} — ${svc?.name ?? ""} on ${form.date} at ${form.time}.` });
			setForm(EMPTY);
			setSubmitting(false);
			onOpenChange(false);
		}, 600);
	}
	return /* @__PURE__ */ jsx(Sheet, {
		open,
		onOpenChange,
		children: /* @__PURE__ */ jsxs(SheetContent, {
			className: "w-full sm:max-w-md flex flex-col",
			children: [/* @__PURE__ */ jsxs(SheetHeader, { children: [/* @__PURE__ */ jsx(SheetTitle, { children: "New Booking" }), /* @__PURE__ */ jsx(SheetDescription, { children: "Schedule an appointment for a customer." })] }), /* @__PURE__ */ jsxs("form", {
				onSubmit: handleSubmit,
				className: "flex flex-col flex-1 gap-5 py-4",
				children: [
					/* @__PURE__ */ jsxs("div", {
						className: "space-y-1.5",
						children: [/* @__PURE__ */ jsx("label", {
							className: "text-sm font-medium",
							children: "Customer Name *"
						}), /* @__PURE__ */ jsx("input", {
							required: true,
							className: "w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring",
							placeholder: "e.g. Marcus Fernando",
							value: form.name,
							onChange: (e) => set("name", e.target.value)
						})]
					}),
					/* @__PURE__ */ jsxs("div", {
						className: "space-y-1.5",
						children: [/* @__PURE__ */ jsx("label", {
							className: "text-sm font-medium",
							children: "Phone"
						}), /* @__PURE__ */ jsx("input", {
							className: "w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring",
							placeholder: "+94 71 000 0000",
							value: form.phone,
							onChange: (e) => set("phone", e.target.value)
						})]
					}),
					/* @__PURE__ */ jsxs("div", {
						className: "space-y-1.5",
						children: [/* @__PURE__ */ jsx("label", {
							className: "text-sm font-medium",
							children: "Plate Number"
						}), /* @__PURE__ */ jsx("input", {
							className: "w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring",
							placeholder: "e.g. WP CAR-1234",
							value: form.plate,
							onChange: (e) => set("plate", e.target.value)
						})]
					}),
					/* @__PURE__ */ jsxs("div", {
						className: "space-y-1.5",
						children: [/* @__PURE__ */ jsx("label", {
							className: "text-sm font-medium",
							children: "Service *"
						}), /* @__PURE__ */ jsxs("select", {
							required: true,
							className: "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring",
							value: form.serviceId,
							onChange: (e) => set("serviceId", e.target.value),
							children: [/* @__PURE__ */ jsx("option", {
								value: "",
								children: "Select a service…"
							}), SERVICES.map((s) => /* @__PURE__ */ jsxs("option", {
								value: s.id,
								children: [
									s.name,
									" — Rs ",
									s.price.toLocaleString(),
									" (",
									s.durationMin,
									"m)"
								]
							}, s.id))]
						})]
					}),
					/* @__PURE__ */ jsxs("div", {
						className: "grid grid-cols-2 gap-3",
						children: [/* @__PURE__ */ jsxs("div", {
							className: "space-y-1.5",
							children: [/* @__PURE__ */ jsx("label", {
								className: "text-sm font-medium",
								children: "Date *"
							}), /* @__PURE__ */ jsx("input", {
								required: true,
								type: "date",
								className: "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring",
								value: form.date,
								onChange: (e) => set("date", e.target.value)
							})]
						}), /* @__PURE__ */ jsxs("div", {
							className: "space-y-1.5",
							children: [/* @__PURE__ */ jsx("label", {
								className: "text-sm font-medium",
								children: "Time *"
							}), /* @__PURE__ */ jsx("select", {
								required: true,
								className: "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring",
								value: form.time,
								onChange: (e) => set("time", e.target.value),
								children: HOURS.map((t) => /* @__PURE__ */ jsx("option", {
									value: t,
									children: t
								}, t))
							})]
						})]
					}),
					/* @__PURE__ */ jsxs(SheetFooter, {
						className: "mt-auto pt-4",
						children: [/* @__PURE__ */ jsx("button", {
							type: "button",
							onClick: () => onOpenChange(false),
							className: "flex-1 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent",
							children: "Cancel"
						}), /* @__PURE__ */ jsx("button", {
							type: "submit",
							disabled: submitting,
							className: "flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-red hover:bg-primary/90 disabled:opacity-60",
							children: submitting ? "Confirming…" : "Confirm Booking"
						})]
					})
				]
			})]
		})
	});
}
//#endregion
//#region src/components/ui/popover.tsx
var Popover = PopoverPrimitive.Root;
var PopoverTrigger = PopoverPrimitive.Trigger;
var PopoverContent = React.forwardRef(({ className, align = "center", sideOffset = 4, ...props }, ref) => /* @__PURE__ */ jsx(PopoverPrimitive.Portal, { children: /* @__PURE__ */ jsx(PopoverPrimitive.Content, {
	ref,
	align,
	sideOffset,
	className: cn("z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-(--radix-popover-content-transform-origin)", className),
	...props
}) }));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;
//#endregion
//#region src/components/notifications-popover.tsx
var INITIAL = [
	{
		id: "n1",
		type: "info",
		title: "Check-in reminder",
		description: "B-207 · Senuri K. (Kia Sportage) due at 14:30",
		time: "5m ago",
		read: false
	},
	{
		id: "n2",
		type: "warning",
		title: "Awaiting QC",
		description: "J-1044 · Priya J. — Full Detail complete, needs inspection",
		time: "12m ago",
		read: false
	},
	{
		id: "n3",
		type: "warning",
		title: "Low stock",
		description: "Foam Cannon Snow Soap (FC-SS-5L) is out of stock",
		time: "1h ago",
		read: false
	}
];
var ICON = {
	warning: AlertTriangle,
	info: Clock,
	success: CheckCircle2
};
var ICON_CLASS = {
	warning: "text-amber-500",
	info: "text-primary",
	success: "text-emerald-500"
};
function NotificationsPopover() {
	const [notifications, setNotifications] = useState(INITIAL);
	const unread = notifications.filter((n) => !n.read).length;
	function markRead(id) {
		setNotifications((ns) => ns.map((n) => n.id === id ? {
			...n,
			read: true
		} : n));
	}
	function markAllRead() {
		setNotifications((ns) => ns.map((n) => ({
			...n,
			read: true
		})));
	}
	return /* @__PURE__ */ jsxs(Popover, { children: [/* @__PURE__ */ jsx(PopoverTrigger, {
		asChild: true,
		children: /* @__PURE__ */ jsxs("button", {
			"aria-label": "Notifications",
			className: "relative rounded-md p-2 hover:bg-accent",
			children: [/* @__PURE__ */ jsx(Bell, { className: "h-5 w-5" }), unread > 0 && /* @__PURE__ */ jsx("span", {
				className: "absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground",
				children: unread
			})]
		})
	}), /* @__PURE__ */ jsxs(PopoverContent, {
		align: "end",
		className: "w-80 p-0",
		children: [
			/* @__PURE__ */ jsxs("div", {
				className: "flex items-center justify-between border-b border-border px-4 py-3",
				children: [/* @__PURE__ */ jsx("span", {
					className: "text-sm font-semibold",
					children: "Notifications"
				}), unread > 0 && /* @__PURE__ */ jsx("button", {
					onClick: markAllRead,
					className: "text-xs text-muted-foreground hover:text-foreground",
					children: "Mark all read"
				})]
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "divide-y divide-border",
				children: [notifications.length === 0 && /* @__PURE__ */ jsx("p", {
					className: "px-4 py-6 text-center text-sm text-muted-foreground",
					children: "All caught up!"
				}), notifications.map((n) => {
					const Icon = ICON[n.type];
					return /* @__PURE__ */ jsxs("button", {
						onClick: () => markRead(n.id),
						className: cn("flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/60 transition-colors", !n.read && "bg-primary/5"),
						children: [
							/* @__PURE__ */ jsx(Icon, { className: cn("mt-0.5 h-4 w-4 shrink-0", ICON_CLASS[n.type]) }),
							/* @__PURE__ */ jsxs("div", {
								className: "min-w-0 flex-1",
								children: [/* @__PURE__ */ jsxs("div", {
									className: "flex items-center justify-between gap-2",
									children: [/* @__PURE__ */ jsx("span", {
										className: "text-sm font-medium truncate",
										children: n.title
									}), /* @__PURE__ */ jsx("span", {
										className: "text-[11px] text-muted-foreground shrink-0",
										children: n.time
									})]
								}), /* @__PURE__ */ jsx("p", {
									className: "mt-0.5 text-xs text-muted-foreground leading-snug",
									children: n.description
								})]
							}),
							!n.read && /* @__PURE__ */ jsx("span", { className: "mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" })
						]
					}, n.id);
				})]
			}),
			notifications.length > 0 && /* @__PURE__ */ jsx("div", {
				className: "border-t border-border px-4 py-2.5",
				children: /* @__PURE__ */ jsx("button", {
					className: "text-xs text-muted-foreground hover:text-foreground",
					children: "View all activity →"
				})
			})
		]
	})] });
}
//#endregion
//#region src/components/top-bar.tsx
function TopBar() {
	const [now, setNow] = useState(null);
	const [searchOpen, setSearchOpen] = useState(false);
	const [walkInOpen, setWalkInOpen] = useState(false);
	const [bookingOpen, setBookingOpen] = useState(false);
	useEffect(() => {
		setNow(/* @__PURE__ */ new Date());
		const t = setInterval(() => setNow(/* @__PURE__ */ new Date()), 1e3 * 30);
		return () => clearInterval(t);
	}, []);
	return /* @__PURE__ */ jsxs(Fragment, { children: [
		/* @__PURE__ */ jsxs("header", {
			className: "flex h-14 items-center gap-4 border-b border-border bg-background px-5",
			children: [
				/* @__PURE__ */ jsxs("div", {
					className: "flex items-center gap-2 text-sm",
					children: [
						/* @__PURE__ */ jsx(MapPin, { className: "h-4 w-4 text-primary" }),
						/* @__PURE__ */ jsx("span", {
							className: "font-semibold",
							children: "Polish Station"
						}),
						/* @__PURE__ */ jsx("span", {
							className: "text-muted-foreground",
							children: "| Dehiwala"
						})
					]
				}),
				/* @__PURE__ */ jsx("div", {
					className: "mx-4 flex-1 max-w-md",
					children: /* @__PURE__ */ jsxs("button", {
						onClick: () => setSearchOpen(true),
						className: "flex w-full items-center gap-2 rounded-md border border-input bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted/70 transition-colors",
						children: [
							/* @__PURE__ */ jsx(Search, { className: "h-4 w-4" }),
							/* @__PURE__ */ jsx("span", {
								className: "flex-1 text-left",
								children: "Search customers, bookings, invoices…"
							}),
							/* @__PURE__ */ jsx("kbd", {
								className: "rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11px]",
								children: "⌘K"
							})
						]
					})
				}),
				/* @__PURE__ */ jsxs("div", {
					className: "flex items-center gap-2",
					children: [
						/* @__PURE__ */ jsxs("button", {
							onClick: () => setWalkInOpen(true),
							className: "hidden md:inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent",
							children: [/* @__PURE__ */ jsx(Plus, { className: "h-4 w-4" }), " Walk-In"]
						}),
						/* @__PURE__ */ jsxs("button", {
							onClick: () => setBookingOpen(true),
							className: "inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-red hover:bg-primary/90",
							children: [/* @__PURE__ */ jsx(Plus, { className: "h-4 w-4" }), " Booking"]
						}),
						/* @__PURE__ */ jsx(NotificationsPopover, {}),
						/* @__PURE__ */ jsxs("div", {
							suppressHydrationWarning: true,
							className: "hidden lg:block border-l border-border pl-3 text-right text-xs leading-tight min-w-20",
							children: [/* @__PURE__ */ jsx("div", {
								className: "font-mono font-semibold",
								children: now ? now.toLocaleTimeString([], {
									hour: "2-digit",
									minute: "2-digit"
								}) : "--:--"
							}), /* @__PURE__ */ jsx("div", {
								className: "text-muted-foreground",
								children: now ? now.toLocaleDateString([], {
									weekday: "short",
									day: "numeric",
									month: "short"
								}) : ""
							})]
						})
					]
				})
			]
		}),
		/* @__PURE__ */ jsx(SearchPalette, {
			open: searchOpen,
			onOpenChange: setSearchOpen
		}),
		/* @__PURE__ */ jsx(WalkInSheet, {
			open: walkInOpen,
			onOpenChange: setWalkInOpen
		}),
		/* @__PURE__ */ jsx(BookingSheet, {
			open: bookingOpen,
			onOpenChange: setBookingOpen
		})
	] });
}
//#endregion
//#region src/routes/_app.tsx?tsr-split=component
function AppLayout() {
	const { staff } = useAuth();
	if (!staff) return /* @__PURE__ */ jsx(Navigate, { to: "/" });
	return /* @__PURE__ */ jsxs("div", {
		className: "flex h-screen w-full bg-background text-foreground",
		children: [/* @__PURE__ */ jsx(AppSidebar, {}), /* @__PURE__ */ jsxs("div", {
			className: "flex flex-1 flex-col overflow-hidden",
			children: [/* @__PURE__ */ jsx(TopBar, {}), /* @__PURE__ */ jsx("main", {
				className: "flex-1 overflow-auto bg-muted/30",
				children: /* @__PURE__ */ jsx(Outlet, {})
			})]
		})]
	});
}
//#endregion
export { AppLayout as component };
