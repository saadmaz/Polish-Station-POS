import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
const mark = (l, t) => console.log(`${l}: ${Date.now() - t}ms`);

let t = Date.now();
await page.goto("https://pos.polishstation.lk/", { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForSelector("#username", { timeout: 60000 });
mark("login screen ready", t);

await page.fill("#username", "ADMIN");
t = Date.now();
for (const d of "0011") await page.click(`button:has-text("${d}")`);
await page.waitForURL(/dashboard/, { timeout: 90000 });
mark("PIN entered → dashboard URL", t);

t = Date.now();
await page.waitForSelector("aside >> text=Dashboard", { timeout: 30000 });
mark("sidebar visible", t);
t = Date.now();
await page
  .waitForFunction(() => !document.querySelector("main .animate-spin"), { timeout: 30000 })
  .catch(() => console.log("  content spinner still going at 30s"));
mark("dashboard content loaded", t);

await browser.close();
process.exit(0);
