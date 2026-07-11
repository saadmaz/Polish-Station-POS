// Proves the Critical fix: adding equipment used to call db.equipment.nextId()
// (src/lib/db.ts), a counter over a localStorage list that real equipment
// writes never touch — so it returned the same id on every call, and the
// second setDoc() in a session silently overwrote the first equipment
// record in Firestore. See src/routes/_app.equipment.tsx.
import { chromium } from "playwright";
import { BASE_URL, adminDb, check, assert, summarize } from "./_shared.mjs";
import { TEST_STAFF } from "../seed-emulator.mjs";

console.log("Equipment add — ID collision / data-loss check:");

const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
const nameA = `E2E Buffer ${Date.now()}`;
const nameB = `E2E Polisher ${Date.now()}`;

await check("log in and reach the Equipment page", async () => {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("#username", { timeout: 15000 });
  await page.fill("#username", TEST_STAFF.username);
  for (const d of TEST_STAFF.pin) await page.click(`button:has-text("${d}")`);
  await page.waitForURL(/dashboard/, { timeout: 20000 });
  await page.goto(`${BASE_URL}/equipment`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=Add Equipment", { timeout: 15000 });
});

async function addEquipment(name) {
  // The page header's "Add Equipment" trigger button is the only match while
  // the form is closed; the form's own submit button (also "Add Equipment")
  // only exists once it's open, so these two locators are never ambiguous.
  await page.locator("button", { hasText: "Add Equipment" }).click();
  await page.fill('input[placeholder="e.g. RUPES LHR21 Mark III"]', name);
  await page.locator('form button[type="submit"]').click();
}

await check("add two pieces of equipment back-to-back, no reload in between", async () => {
  await addEquipment(nameA);
  await page.waitForSelector(`text=${nameA}`, { timeout: 10000 });
  await addEquipment(nameB);
  await page.waitForSelector(`text=${nameB}`, { timeout: 10000 });
});

await check(
  "both exist as distinct Firestore documents (second didn't overwrite the first)",
  async () => {
    const snapA = await adminDb.collection("equipment").where("name", "==", nameA).get();
    const snapB = await adminDb.collection("equipment").where("name", "==", nameB).get();
    assert(snapA.size === 1, `expected 1 doc named "${nameA}", found ${snapA.size}`);
    assert(snapB.size === 1, `expected 1 doc named "${nameB}", found ${snapB.size}`);
    assert(
      snapA.docs[0].id !== snapB.docs[0].id,
      "both equipment items collapsed onto the same document id",
    );
  },
);

await browser.close();
summarize("Equipment add");
