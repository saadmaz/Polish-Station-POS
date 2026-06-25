import { t as cn } from "./utils-C_uf36nf.js";
import { jsx, jsxs } from "react/jsx-runtime";
//#region src/components/page-header.tsx
function PageHeader({ title, subtitle, actions, className }) {
	return /* @__PURE__ */ jsxs("div", {
		className: cn("flex flex-wrap items-end justify-between gap-3 mb-5", className),
		children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("h1", {
			className: "font-display text-2xl font-bold tracking-tight",
			children: title
		}), subtitle && /* @__PURE__ */ jsx("p", {
			className: "mt-1 text-sm text-muted-foreground",
			children: subtitle
		})] }), actions && /* @__PURE__ */ jsx("div", {
			className: "flex flex-wrap items-center gap-2",
			children: actions
		})]
	});
}
//#endregion
export { PageHeader as t };
