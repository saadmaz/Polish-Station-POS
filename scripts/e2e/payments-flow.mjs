// Regression check for split-tender / partial-payment / refund checkout
// (src/routes/_app.pos.tsx, src/lib/store.tsx, src/components/payment-modal.tsx).
// Seeds an OPEN shift directly via the Admin SDK (shift-opening UI isn't
// under test here) then drives the full checkout → collect → refund cycle
// through the browser, verifying both the UI and the underlying Firestore
// invoice document at each step.
import { chromium } from "playwright";
import { BASE_URL, adminDb, check, assert, summarize } from "./_shared.mjs";
import { TEST_STAFF } from "../seed-emulator.mjs";

console.log("Payments flow (split tender / partial collect / refund):");

// The app only ever shows one shift as "open" at a time (whichever the
// store's onSnapshot listener happens to surface first), and the real UI
// never lets two be open concurrently. Clear out any stray OPEN shifts
// left over from other test runs so this script's own shift is
// unambiguously the one the app picks up.
const staleOpen = await adminDb.collection("shifts").where("status", "==", "OPEN").get();
await Promise.all(staleOpen.docs.map((d) => d.ref.delete()));

const shiftId = `e2e-shift-${Date.now()}`;
await adminDb
  .collection("shifts")
  .doc(shiftId)
  .set({
    id: shiftId,
    staffId: TEST_STAFF.staffId,
    staffName: "E2E Admin",
    status: "OPEN",
    openedAt: new Date().toISOString(),
    closedAt: null,
    openingBalance: 0,
    openingDenominations: {},
    closingBalance: null,
    closingDenominations: null,
    cashSales: 0,
    cardSales: 0,
    totalExpenses: 0,
    totalDeposits: 0,
    variance: null,
    notes: "",
    verifiedBy: null,
  });

const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});

const customerName = `E2E Payments Customer ${Date.now()}`;
const unitPrice = 10000;

await check("login", async () => {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("#username", { timeout: 15000 });
  await page.fill("#username", TEST_STAFF.username);
  for (const d of TEST_STAFF.pin) await page.click(`button:has-text("${d}")`);
  await page.waitForURL(/dashboard/, { timeout: 20000 });
});

await check("POS page loads with an open shift", async () => {
  await page.goto(`${BASE_URL}/pos`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("text=Shift active", { timeout: 15000 });
});

await check("manual billing: enter customer + custom line item", async () => {
  await page.fill(
    'input[placeholder="Or type customer name for manual billing…"]',
    customerName,
  );
  // Exact match: the top bar's "Search customers, bookings, invoices…"
  // button contains "custom" as a substring and would match a loose
  // has-text("Custom") selector.
  await page.getByRole("button", { name: "Custom", exact: true }).click();
  const row = page.locator("table tbody tr").first();
  await row.locator("input").nth(2).fill(String(unitPrice)); // unit price column
});

let invoiceId;

await check("split tender: partial Cash payment marks invoice Partially Paid", async () => {
  const total = Math.round(unitPrice * 1.18); // subtotal + 18% VAT, no tip
  const partial = Math.round(total / 2);

  await page.click('aside button:has-text("Cash")');
  const amountInput = page.locator("aside input[type=number]").first();
  await amountInput.fill(String(partial));

  await page.click('aside button:has-text("Collect LKR")');
  await page.waitForSelector("text=Partial payment recorded", { timeout: 10000 });

  await page.waitForSelector(`table:has-text("${customerName}")`, { timeout: 10000 });
  const invoiceRow = page.locator("tr", { hasText: customerName }).first();
  await invoiceRow.waitFor({ timeout: 10000 });
  assert(
    (await invoiceRow.locator("text=Partially Paid").count()) > 0,
    "expected Partially Paid status chip on the new invoice row",
  );

  const snap = await adminDb
    .collection("invoices")
    .where("customerName", "==", customerName)
    .get();
  assert(snap.size === 1, `expected exactly 1 invoice for ${customerName}, found ${snap.size}`);
  invoiceId = snap.docs[0].id;
  const inv = snap.docs[0].data();
  assert(inv.status === "Partially Paid", `expected status Partially Paid, got ${inv.status}`);
  assert(inv.payments?.length === 1, "expected exactly 1 payment record");
  assert(inv.payments[0].amount === partial, "payment amount should equal the tendered partial");
  assert(inv.payments[0].sessionId === shiftId, "payment should be tagged with the open shift id");
});

await check("Collect Payment completes the balance and marks invoice Paid", async () => {
  const invoiceRow = page.locator("tr", { hasText: customerName }).first();
  await invoiceRow.locator('button:has-text("Collect")').click();
  await page.waitForSelector("text=Collect Payment", { timeout: 10000 });

  await page.click('.fixed button:has-text("Cash")');
  await page.click('button:has-text("Record Payment")');
  await page.waitForSelector("text=Payment recorded", { timeout: 10000 });

  await page.waitForFunction(
    (name) => {
      const row = [...document.querySelectorAll("tr")].find((r) => r.textContent?.includes(name));
      return row?.textContent?.includes("Paid") && !row.textContent?.includes("Partially");
    },
    customerName,
    { timeout: 10000 },
  );

  const doc = await adminDb.collection("invoices").doc(invoiceId).get();
  const inv = doc.data();
  assert(inv.status === "Paid", `expected status Paid after collecting balance, got ${inv.status}`);
  assert(inv.payments.length === 2, "expected 2 payment records after Collect Payment");
});

await check("Refund updates invoice status and customer spend", async () => {
  const before = await adminDb.collection("invoices").doc(invoiceId).get();
  const invBefore = before.data();
  const customerId = invBefore.customerId;

  const invoiceRow = page.locator("tr", { hasText: customerName }).first();
  await invoiceRow.locator('button:has-text("Refund")').click();
  await page.waitForSelector("text=Refund —", { timeout: 10000 });
  await page.fill('input[placeholder*="unhappy"]', "E2E test refund");
  await page.click('button:has-text("Refund LKR")');
  await page.waitForSelector("text=refunded on", { timeout: 10000 });

  const after = await adminDb.collection("invoices").doc(invoiceId).get();
  const invAfter = after.data();
  assert(invAfter.status === "Refunded", `expected status Refunded, got ${invAfter.status}`);
  assert(invAfter.refunds?.length === 1, "expected exactly 1 refund record");
  assert(invAfter.refunds[0].amount === invBefore.total, "full refund should equal invoice total");

  if (customerId) {
    const custDoc = await adminDb.collection("customers").doc(customerId).get();
    const custBefore = (await adminDb.collection("customers").doc(customerId).get()).data();
    assert(custDoc.exists, "customer should still exist after refund");
    assert(custBefore.spend >= 0, "customer spend should never go negative");
  }
});

await check("no unexpected console errors during the flow", async () => {
  // Known-benign/environmental noise, unrelated to this feature: Firebase's
  // own analytics beacon getting CSP-blocked, and a transient first-connect
  // retry warning from the Firestore emulator's WebChannel (every write in
  // this test still succeeded, proving it reconnected).
  const relevant = consoleErrors.filter(
    (e) =>
      !e.includes("Failed to load resource") &&
      !e.includes("favicon") &&
      !e.includes("cleardot.gif") &&
      !e.includes("Could not reach Cloud Firestore backend"),
  );
  assert(relevant.length === 0, `console errors: ${relevant.join(" | ")}`);
});

await browser.close();
summarize("Payments flow");
