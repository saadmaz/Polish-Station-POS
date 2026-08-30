// Regression check for the login flow itself, since this session's emulator
// wiring (src/lib/firebase.ts, src/server/firebase-admin.ts) touches the
// exact modules the client-side signInWithEmailAndPassword flow depends on.
// Not a new behavior, just proof the existing critical path still works end
// to end against the emulator.
import { chromium } from "playwright";
import { BASE_URL, check, summarize, loginAs } from "./_shared.mjs";
import { TEST_STAFF } from "../seed-emulator.mjs";

console.log("Login flow:");

const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();

await check("login screen loads and the staff picker appears", async () => {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(`button:has-text("@${TEST_STAFF.username}")`, { timeout: 15000 });
});

await check("valid username + PIN reaches the dashboard", async () => {
  await loginAs(page, TEST_STAFF.username, TEST_STAFF.pin);
  await page.waitForURL(/dashboard/, { timeout: 20000 });
});

await check("sidebar renders for the signed-in user", async () => {
  await page.waitForSelector("aside >> text=Dashboard", { timeout: 10000 });
});

await browser.close();
summarize("Login flow");
