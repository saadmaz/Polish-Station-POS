// Proves the Critical fix: the public /book widget used to write bookings
// straight into the visitor's own localStorage (src/lib/db.ts), so they
// never reached the shop's real data at all — see src/server/bookings.ts.
// This drives the full public booking wizard as an anonymous visitor, then
// checks Firestore directly (Admin SDK, bypassing the browser entirely) to
// prove the booking actually landed server-side with the right details.
import { chromium } from "playwright";
import { BASE_URL, adminDb, check, assert, summarize } from "./_shared.mjs";
import { TEST_SERVICES } from "../seed-emulator.mjs";

console.log("Public booking flow:");

const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
const service = TEST_SERVICES[0];
const customerName = `E2E Test Customer ${Date.now()}`;
const customerPhone = `077${Math.floor(1000000 + Math.random() * 8999999)}`;

await check("booking widget loads and lists real services", async () => {
  await page.goto(`${BASE_URL}/book`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(`text=${service.name}`, { timeout: 15000 });
});

await check("can step through service -> date -> time -> details", async () => {
  await page.click(`text=${service.name}`);
  await page.waitForSelector("text=Pick a Date", { timeout: 10000 });
  await page.click('button:has-text("TODAY")');
  await page.waitForSelector("text=Pick a Time", { timeout: 10000 });
  await page.waitForFunction(() => !document.body.textContent?.includes("Checking availability"), {
    timeout: 10000,
  });
  // First non-disabled slot button.
  await page
    .locator("main button")
    .filter({ hasNotText: "Back" })
    .and(page.locator(":not([disabled])"))
    .first()
    .click();
  await page.waitForSelector("text=Your Details", { timeout: 10000 });
});

await check("submitting creates a real booking and shows confirmation", async () => {
  await page.fill('input[placeholder="e.g. Roshan Fernando"]', customerName);
  await page.fill('input[placeholder="e.g. +94 77 123 4567"]', customerPhone);
  await page.click('button:has-text("Confirm Booking")');
  await page.waitForSelector("text=Booking Received!", { timeout: 15000 });
});

await check(
  "the booking exists in Firestore with the submitted details (not localStorage)",
  async () => {
    const snap = await adminDb.collection("bookings").where("phone", "==", customerPhone).get();
    assert(snap.size === 1, `expected exactly 1 booking for this phone, found ${snap.size}`);
    const b = snap.docs[0].data();
    assert(b.customerName === customerName, "customer name mismatch");
    assert(b.serviceId === service.id, "serviceId mismatch");
    // Price/duration must come from the server-side service lookup, never the
    // client payload — this is the tamper-resistance half of the same fix.
    assert(
      b.price === service.price,
      `price should be server-derived (${service.price}), got ${b.price}`,
    );
    assert(b.durationMin === service.durationMin, "durationMin should be server-derived");
    assert(b.status === "Pending", "new bookings should start Pending");
  },
);

await browser.close();
summarize("Public booking flow");
