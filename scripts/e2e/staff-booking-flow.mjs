// Regression check for the staff-side booking path (src/components/
// booking-sheet.tsx -> src/server/staff-bookings.ts createStaffBookingFn),
// which used to be a direct, unvalidated client Firestore write and is now a
// server function enforcing the same lead-time/max-advance policy as the
// public /book widget (see src/lib/booking-rules.ts). Drives the real
// "New Booking" sheet as a signed-in staff member, then checks Firestore
// directly to prove the booking landed with the policy snapshot stamped on
// it (cancelWindowHours/noShowPenaltyEnabled), not just a bare status write.
import { chromium } from "playwright";
import { BASE_URL, adminDb, check, assert, summarize, loginAs } from "./_shared.mjs";
import { TEST_STAFF, TEST_SERVICES } from "../seed-emulator.mjs";

console.log("Staff booking flow:");

const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
const service = TEST_SERVICES[0]; // Express Wash, LKR 1,500 -- under the default deposit threshold
const customerName = `E2E Staff Booking ${Date.now()}`;
const phone = `071${Math.floor(1000000 + Math.random() * 8999999)}`;

// Tomorrow: always well within the default 30-minute lead time / 60-day
// max-advance window regardless of what wall-clock time this runs at.
const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
const dateStr = tomorrow.toISOString().slice(0, 10);

await check("login and open the New Booking sheet", async () => {
  await page.goto(`${BASE_URL}/bookings`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await loginAs(page, TEST_STAFF.username, TEST_STAFF.pin);
  await page.waitForURL(/dashboard/, { timeout: 20000 });
  await page.goto(`${BASE_URL}/bookings`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.click('button:has-text("New Booking")');
  await page.waitForSelector("text=Schedule an appointment for a customer.", { timeout: 10000 });
});

await check("submitting a within-policy slot creates a real, Confirmed booking", async () => {
  await page.fill('input[placeholder="+94 71 000 0000"]', phone);
  await page.fill('input[placeholder="e.g. Marcus Fernando"]', customerName);
  await page.locator("form select").nth(0).selectOption(service.id);
  await page.fill('input[type="date"]', dateStr);
  await page.locator("form select").nth(1).selectOption("10:00");
  await page.click('button:has-text("Confirm Booking")');
  await page.waitForSelector("text=Booking confirmed", { timeout: 15000 });
});

await check(
  "the booking exists server-side with the policy snapshot, no override needed",
  async () => {
    const snap = await adminDb.collection("bookings").where("phone", "==", phone).get();
    assert(snap.size === 1, `expected exactly 1 booking for this phone, found ${snap.size}`);
    const b = snap.docs[0].data();
    assert(b.customerName === customerName, "customer name mismatch");
    assert(b.serviceId === service.id, "serviceId mismatch");
    assert(b.price === service.price, `price should be server-derived, got ${b.price}`);
    assert(b.status === "Confirmed", `staff bookings should always be Confirmed, got ${b.status}`);
    assert(typeof b.cancelWindowHours === "number", "cancelWindowHours snapshot missing");
    assert(typeof b.noShowPenaltyEnabled === "boolean", "noShowPenaltyEnabled snapshot missing");
    assert(!b.ruleOverrideReason, "a within-policy booking should not carry an override reason");
    assert(!b.depositAmount, "Express Wash is under the deposit threshold, should have no deposit");
  },
);

// Lead-time/max-advance boundary math itself is covered deterministically by
// src/lib/booking-rules.test.ts (exact fixed timestamps, no wall-clock
// dependency) -- not repeated here as a UI flow, since constructing a
// guaranteed-to-violate slot through the sheet's fixed half-hour dropdown
// without knowing what time this suite happens to run would be exactly the
// kind of wall-clock-dependent flake fixed in booking-flow.mjs above.

await browser.close();
summarize("Staff booking flow");
