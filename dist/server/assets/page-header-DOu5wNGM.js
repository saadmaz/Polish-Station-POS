import { t as require_jsx_runtime } from "./jsx-runtime-DqHqdqSU.js";
import { t as cn } from "./utils-CkbI-8f8.js";
//#region src/components/page-header.tsx
var import_jsx_runtime = require_jsx_runtime();
function PageHeader({ title, subtitle, actions, className }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: cn("flex flex-wrap items-end justify-between gap-3 mb-5", className),
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
			className: "font-display text-2xl font-bold tracking-tight",
			children: title
		}), subtitle && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "mt-1 text-sm text-muted-foreground",
			children: subtitle
		})] }), actions && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "flex flex-wrap items-center gap-2",
			children: actions
		})]
	});
}
//#endregion
export { PageHeader as t };
