// Read-only. Runs logins until one FAILS, then prints which request hung.
import { chromium } from "playwright";

const URL = process.env.PROD_URL ?? "https://pos.polishstation.lk";
const USER = process.env.SU_USER ?? "ADMIN";
const PIN = process.env.SU_PIN ?? "0011";
const INTERESTING = /_serverFn|securetoken|identitytoolkit/;

const browser = await chromium.launch();

for (let attempt = 1; attempt <= 10; attempt++) {
  const page = await (await browser.newContext()).newPage();
  const inflight = new Map();
  const finished = [];
  page.on("request", (r) => INTERESTING.test(r.url()) && inflight.set(r, Date.now()));
  const settle = (r, s) => {
    if (!inflight.has(r)) return;
    finished.push({ u: r.url(), s, d: Date.now() - inflight.get(r) });
    inflight.delete(r);
  };
  page.on("requestfinished", async (r) =>
    settle(r, (await r.response().catch(() => null))?.status() ?? "?"),
  );
  page.on("requestfailed", (r) => settle(r, "FAIL:" + (r.failure()?.errorText ?? "")));

  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector("#username", { timeout: 60000 });
  await page.fill("#username", USER);
  const t = Date.now();
  for (const d of PIN) await page.click(`button:has-text("${d}")`);
  const ok = await page
    .waitForURL(/dashboard|change-pin/, { timeout: 40000 })
    .then(() => true)
    .catch(() => false);

  const short = (u) =>
    u
      .replace(/^https?:\/\//, "")
      .replace(/\?.*/, "")
      .slice(0, 50);
  if (ok) {
    console.log(`attempt ${attempt}: OK ${Date.now() - t}ms`);
  } else {
    console.log(`\nattempt ${attempt}: ❌ FAILED after ${Date.now() - t}ms`);
    console.log("  finished login requests:");
    finished
      .filter((r) => INTERESTING.test(r.u))
      .forEach((r) => console.log(`    ${String(r.d).padStart(6)}ms ${r.s}  ${short(r.u)}`));
    const stuck = [...inflight.keys()].filter((r) => INTERESTING.test(r.url()));
    console.log("  STILL PENDING (hung):");
    stuck.forEach((r) =>
      console.log(`    ${String(Date.now() - inflight.get(r)).padStart(6)}ms  ${short(r.url())}`),
    );
    if (!stuck.length) console.log("    (none — the hang is NOT a login/auth network request)");
    await page.close();
    break;
  }
  await page.close();
}
await browser.close();
