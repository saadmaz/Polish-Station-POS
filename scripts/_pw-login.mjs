import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
const mark = (l, t) => console.log(`${l}: ${Date.now() - t}ms`);

let t = Date.now();
await page.goto("https://pos.polishstation.lk/", { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForSelector("#username", { timeout: 60000 });
mark("login screen ready", t);

await page.fill("#username", process.env.SU_USER ?? "ADMIN");
t = Date.now();
// Never hardcode a real credential in the repo — pass it at run time:
//   SU_PIN=xxxx node scripts/_pw-login.mjs
const pin = process.env.SU_PIN;
if (!pin) {
  console.error("Set SU_PIN (and optionally SU_USER) to run this login timing probe.");
  process.exit(1);
}
for (const d of pin) await page.click(`button:has-text("${d}")`);
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
