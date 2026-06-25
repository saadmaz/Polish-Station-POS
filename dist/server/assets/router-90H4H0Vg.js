import { t as AuthProvider } from "./auth-BDKp4kVI.js";
import { useEffect } from "react";
import { HeadContent, Link, Outlet, Scripts, createFileRoute, createRootRouteWithContext, createRouter, lazyRouteComponent, useRouter } from "@tanstack/react-router";
import { jsx, jsxs } from "react/jsx-runtime";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import "lucide-react";
//#region src/styles.css?url
var styles_default = "/assets/styles-BegJ-tZQ.css";
//#endregion
//#region src/lib/error-reporting.ts
function reportError(error, context = {}) {
	console.error(error, context);
}
//#endregion
//#region src/components/ui/sonner.tsx
var Toaster$1 = ({ ...props }) => {
	return /* @__PURE__ */ jsx(Toaster, {
		className: "toaster group",
		toastOptions: { classNames: {
			toast: "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
			description: "group-[.toast]:text-muted-foreground",
			actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
			cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground"
		} },
		...props
	});
};
//#endregion
//#region src/routes/__root.tsx
function NotFoundComponent() {
	return /* @__PURE__ */ jsx("div", {
		className: "flex min-h-screen items-center justify-center bg-background px-4",
		children: /* @__PURE__ */ jsxs("div", {
			className: "max-w-md text-center",
			children: [
				/* @__PURE__ */ jsx("h1", {
					className: "text-7xl font-bold text-foreground",
					children: "404"
				}),
				/* @__PURE__ */ jsx("h2", {
					className: "mt-4 text-xl font-semibold text-foreground",
					children: "Page not found"
				}),
				/* @__PURE__ */ jsx("p", {
					className: "mt-2 text-sm text-muted-foreground",
					children: "The page you're looking for doesn't exist or has been moved."
				}),
				/* @__PURE__ */ jsx("div", {
					className: "mt-6",
					children: /* @__PURE__ */ jsx(Link, {
						to: "/",
						className: "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90",
						children: "Go home"
					})
				})
			]
		})
	});
}
function ErrorComponent({ error, reset }) {
	console.error(error);
	const router = useRouter();
	useEffect(() => {
		reportError(error, { boundary: "tanstack_root_error_component" });
	}, [error]);
	return /* @__PURE__ */ jsx("div", {
		className: "flex min-h-screen items-center justify-center bg-background px-4",
		children: /* @__PURE__ */ jsxs("div", {
			className: "max-w-md text-center",
			children: [
				/* @__PURE__ */ jsx("h1", {
					className: "text-xl font-semibold tracking-tight text-foreground",
					children: "This page didn't load"
				}),
				/* @__PURE__ */ jsx("p", {
					className: "mt-2 text-sm text-muted-foreground",
					children: "Something went wrong on our end. You can try refreshing or head back home."
				}),
				/* @__PURE__ */ jsxs("div", {
					className: "mt-6 flex flex-wrap justify-center gap-2",
					children: [/* @__PURE__ */ jsx("button", {
						onClick: () => {
							router.invalidate();
							reset();
						},
						className: "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90",
						children: "Try again"
					}), /* @__PURE__ */ jsx("a", {
						href: "/",
						className: "inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent",
						children: "Go home"
					})]
				})
			]
		})
	});
}
var Route$12 = createRootRouteWithContext()({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1"
			},
			{ title: "Polish Station OS — POS & Operations" },
			{
				name: "description",
				content: "Integrated POS, bookings, and ERP platform for car detailing centers."
			},
			{
				property: "og:title",
				content: "Polish Station OS"
			},
			{
				property: "og:description",
				content: "POS, bookings, jobs, inventory and reports for detailing operations."
			},
			{
				property: "og:type",
				content: "website"
			},
			{
				name: "twitter:card",
				content: "summary"
			}
		],
		links: [
			{
				rel: "stylesheet",
				href: styles_default
			},
			{
				rel: "preconnect",
				href: "https://fonts.googleapis.com"
			},
			{
				rel: "preconnect",
				href: "https://fonts.gstatic.com",
				crossOrigin: "anonymous"
			},
			{
				rel: "stylesheet",
				href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500&display=swap"
			}
		]
	}),
	shellComponent: RootShell,
	component: RootComponent,
	notFoundComponent: NotFoundComponent,
	errorComponent: ErrorComponent
});
function RootShell({ children }) {
	return /* @__PURE__ */ jsxs("html", {
		lang: "en",
		children: [/* @__PURE__ */ jsx("head", { children: /* @__PURE__ */ jsx(HeadContent, {}) }), /* @__PURE__ */ jsxs("body", { children: [children, /* @__PURE__ */ jsx(Scripts, {})] })]
	});
}
function RootComponent() {
	const { queryClient } = Route$12.useRouteContext();
	return /* @__PURE__ */ jsx(QueryClientProvider, {
		client: queryClient,
		children: /* @__PURE__ */ jsxs(AuthProvider, { children: [/* @__PURE__ */ jsx(Outlet, {}), /* @__PURE__ */ jsx(Toaster$1, { position: "bottom-right" })] })
	});
}
//#endregion
//#region src/routes/sitemap[.]xml.ts
var BASE_URL = "";
var Route$11 = createFileRoute("/sitemap.xml")({ server: { handlers: { GET: async () => {
	const xml = [
		`<?xml version="1.0" encoding="UTF-8"?>`,
		`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
		...[{
			path: "/",
			changefreq: "weekly",
			priority: "1.0"
		}].map((e) => `  <url>\n    <loc>${BASE_URL}${e.path}</loc>\n    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority}</priority>\n  </url>`),
		`</urlset>`
	].join("\n");
	return new Response(xml, { headers: {
		"Content-Type": "application/xml",
		"Cache-Control": "public, max-age=3600"
	} });
} } } });
//#endregion
//#region src/routes/_app.tsx
var $$splitComponentImporter$10 = () => import("./_app-C8gIciHm.js");
var Route$10 = createFileRoute("/_app")({ component: lazyRouteComponent($$splitComponentImporter$10, "component") });
//#endregion
//#region src/routes/index.tsx
var $$splitComponentImporter$9 = () => import("./routes-bBjw-pdo.js");
var Route$9 = createFileRoute("/")({
	head: () => ({ meta: [{ title: "Sign in — Polish Station OS" }, {
		name: "description",
		content: "PIN login for Polish Station staff."
	}] }),
	component: lazyRouteComponent($$splitComponentImporter$9, "component")
});
//#endregion
//#region src/routes/_app.staff.tsx
var $$splitComponentImporter$8 = () => import("./_app.staff-C6aFhirt.js");
var Route$8 = createFileRoute("/_app/staff")({
	head: () => ({ meta: [{ title: "Staff — Polish Station OS" }] }),
	component: lazyRouteComponent($$splitComponentImporter$8, "component")
});
//#endregion
//#region src/routes/_app.settings.tsx
var $$splitComponentImporter$7 = () => import("./_app.settings-BHtm-i7f.js");
var Route$7 = createFileRoute("/_app/settings")({
	head: () => ({ meta: [{ title: "Settings — Polish Station OS" }] }),
	component: lazyRouteComponent($$splitComponentImporter$7, "component")
});
//#endregion
//#region src/routes/_app.reports.tsx
var $$splitComponentImporter$6 = () => import("./_app.reports-BW8GjTqX.js");
var Route$6 = createFileRoute("/_app/reports")({
	head: () => ({ meta: [{ title: "Reports — Polish Station OS" }] }),
	component: lazyRouteComponent($$splitComponentImporter$6, "component")
});
//#endregion
//#region src/routes/_app.pos.tsx
var $$splitComponentImporter$5 = () => import("./_app.pos-BLx4mOVP.js");
var Route$5 = createFileRoute("/_app/pos")({
	head: () => ({ meta: [{ title: "POS / Checkout — Polish Station OS" }] }),
	component: lazyRouteComponent($$splitComponentImporter$5, "component")
});
//#endregion
//#region src/routes/_app.jobs.tsx
var $$splitComponentImporter$4 = () => import("./_app.jobs-KS1C72E2.js");
var Route$4 = createFileRoute("/_app/jobs")({
	head: () => ({ meta: [{ title: "Active Jobs — Polish Station OS" }] }),
	component: lazyRouteComponent($$splitComponentImporter$4, "component")
});
//#endregion
//#region src/routes/_app.inventory.tsx
var $$splitComponentImporter$3 = () => import("./_app.inventory-BMvn3Llv.js");
var Route$3 = createFileRoute("/_app/inventory")({
	head: () => ({ meta: [{ title: "Inventory — Polish Station OS" }] }),
	component: lazyRouteComponent($$splitComponentImporter$3, "component")
});
//#endregion
//#region src/routes/_app.dashboard.tsx
var $$splitComponentImporter$2 = () => import("./_app.dashboard-Ceo-mVN1.js");
var Route$2 = createFileRoute("/_app/dashboard")({
	head: () => ({ meta: [{ title: "Dashboard — Polish Station OS" }] }),
	component: lazyRouteComponent($$splitComponentImporter$2, "component")
});
//#endregion
//#region src/routes/_app.customers.tsx
var $$splitComponentImporter$1 = () => import("./_app.customers-ByqE4_8f.js");
var Route$1 = createFileRoute("/_app/customers")({
	head: () => ({ meta: [{ title: "Customers — Polish Station OS" }] }),
	component: lazyRouteComponent($$splitComponentImporter$1, "component")
});
//#endregion
//#region src/routes/_app.bookings.tsx
var $$splitComponentImporter = () => import("./_app.bookings-CK06lRkp.js");
var Route = createFileRoute("/_app/bookings")({
	head: () => ({ meta: [{ title: "Bookings — Polish Station OS" }] }),
	component: lazyRouteComponent($$splitComponentImporter, "component")
});
//#endregion
//#region src/routeTree.gen.ts
var SitemapDotxmlRoute = Route$11.update({
	id: "/sitemap.xml",
	path: "/sitemap.xml",
	getParentRoute: () => Route$12
});
var AppRoute = Route$10.update({
	id: "/_app",
	getParentRoute: () => Route$12
});
var IndexRoute = Route$9.update({
	id: "/",
	path: "/",
	getParentRoute: () => Route$12
});
var AppStaffRoute = Route$8.update({
	id: "/staff",
	path: "/staff",
	getParentRoute: () => AppRoute
});
var AppSettingsRoute = Route$7.update({
	id: "/settings",
	path: "/settings",
	getParentRoute: () => AppRoute
});
var AppReportsRoute = Route$6.update({
	id: "/reports",
	path: "/reports",
	getParentRoute: () => AppRoute
});
var AppPosRoute = Route$5.update({
	id: "/pos",
	path: "/pos",
	getParentRoute: () => AppRoute
});
var AppJobsRoute = Route$4.update({
	id: "/jobs",
	path: "/jobs",
	getParentRoute: () => AppRoute
});
var AppInventoryRoute = Route$3.update({
	id: "/inventory",
	path: "/inventory",
	getParentRoute: () => AppRoute
});
var AppDashboardRoute = Route$2.update({
	id: "/dashboard",
	path: "/dashboard",
	getParentRoute: () => AppRoute
});
var AppCustomersRoute = Route$1.update({
	id: "/customers",
	path: "/customers",
	getParentRoute: () => AppRoute
});
var AppRouteChildren = {
	AppBookingsRoute: Route.update({
		id: "/bookings",
		path: "/bookings",
		getParentRoute: () => AppRoute
	}),
	AppCustomersRoute,
	AppDashboardRoute,
	AppInventoryRoute,
	AppJobsRoute,
	AppPosRoute,
	AppReportsRoute,
	AppSettingsRoute,
	AppStaffRoute
};
var rootRouteChildren = {
	IndexRoute,
	AppRoute: AppRoute._addFileChildren(AppRouteChildren),
	SitemapDotxmlRoute
};
var routeTree = Route$12._addFileChildren(rootRouteChildren)._addFileTypes();
//#endregion
//#region src/router.tsx
var getRouter = () => {
	return createRouter({
		routeTree,
		context: { queryClient: new QueryClient() },
		scrollRestoration: true,
		defaultPreloadStaleTime: 0
	});
};
//#endregion
export { getRouter };
