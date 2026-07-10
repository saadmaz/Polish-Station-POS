import { chromium } from "playwright";

const SITE = "https://pos.polishstation.lk/";
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();

const mark = (label, t0) => console.log(`${label}: ${Date.now() - t0}ms`);

let t0 = Date.now();
await page.goto(SITE, { waitUntil: "domcontentloaded", timeout: 90000 });
mark("page load (domcontentloaded)", t0);

await page.waitForSelector("#username", { timeout: 60000 });
await page.fill("#username", "ADMIN");
t0 = Date.now();
for (const d of "0011") await page.click(`button:has-text("${d}")`);
await page.waitForURL(/dashboard/, { timeout: 90000 });
mark("login → /dashboard URL", t0);

// Shell visible = sidebar present (should be near-instant now)
t0 = Date.now();
await page.waitForSelector("aside >> text=Dashboard", { timeout: 60000 });
mark("app shell visible (sidebar)", t0);

// Content loaded = spinner gone
t0 = Date.now();
await page
  .waitForFunction(() => !document.querySelector(".animate-spin"), { timeout: 60000 })
  .catch(() => console.log("  (spinner still present after 60s)"));
mark("dashboard content loaded", t0);

for (const label of ["Bookings", "POS / Checkout", "Dashboard"]) {
  t0 = Date.now();
  await page.click(`aside >> text=${label}`, { timeout: 30000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  mark(`nav → ${label}`, t0);
}

const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
console.log("console errors:", errs.length);

await browser.close();
process.exit(0);
