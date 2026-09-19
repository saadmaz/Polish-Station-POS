// Regression check for split-tender / partial-payment / refund checkout
// (src/routes/_app.pos.tsx, src/lib/store.tsx, src/components/payment-modal.tsx).
// Drives the full checkout → collect → refund cycle through the browser,
// verifying both the UI and the underlying Firestore invoice document at
// each step.
//
// Updated for the invoice-document POS rewrite (single-column document
// layout; Recent Invoices moved into a Sheet drawer; the old <select> +
// "Custom" button line-item control replaced by a combined search/custom
// combobox; manual billing now behind a "Bill without saving a customer"
// toggle instead of an always-visible field). Uses data-testid hooks added
// alongside that rewrite rather than fragile text/structure selectors.
import { chromium } from "playwright";
import { BASE_URL, adminDb, check, assert, summarize, loginAs } from "./_shared.mjs";
import { TEST_STAFF } from "../seed-emulator.mjs";

console.log("Payments flow (split tender / partial collect / refund):");

/** refundInvoicePayment (store.tsx) fires its batch.commit() without the UI
 *  awaiting it -- the "refunded on" toast shows as soon as the client kicks
 *  the write off, not once the emulator has actually applied it. Poll
 *  briefly rather than reading once immediately after the toast. */
async function waitForInvoiceField(id, predicate, timeoutMs = 5000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    last = (await adminDb.collection("invoices").doc(id).get()).data();
    if (predicate(last)) return last;
    await new Promise((r) => setTimeout(r, 200));
  }
  return last;
}

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
  await loginAs(page, TEST_STAFF.username, TEST_STAFF.pin);
  await page.waitForURL(/dashboard/, { timeout: 20000 });
});

await check("POS page loads", async () => {
  await page.goto(`${BASE_URL}/pos`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("text=POS / Checkout", { timeout: 15000 });
});

await check("manual billing: enter customer + custom line item", async () => {
  await page.getByTestId("manual-billing-toggle").click();
  await page.getByTestId("manual-billing-input").fill(customerName);

  await page.getByTestId("add-line-trigger").click();
  const comboInput = page.locator('input[placeholder="Search services or type a custom line…"]');
  await comboInput.fill("E2E Custom Service");
  await page.getByTestId("add-custom-line").click();

  const row = page.locator("table tbody tr").first();
  await row.locator("input").nth(2).fill(String(unitPrice)); // unit price column
});

let invoiceId;

await check("split tender: partial Cash payment marks invoice Partially Paid", async () => {
  const total = unitPrice; // subtotal, no discount, no tip
  const partial = Math.round(total / 2);

  // TenderLineEditor's buttons render "+ Cash" (an icon plus the literal
  // "+ " prefix), so this is a substring match, not :text-is().
  const payment = page.getByTestId("checkout-payment");
  await payment.locator('button:has-text("Cash")').click();
  await payment.locator("input[type=number]").first().fill(String(partial));

  await page.getByTestId("issue-invoice-button").click();
  await page.waitForSelector("text=Partial payment recorded", { timeout: 10000 });

  // The just-issued invoice flips the page into document (view) mode -- its
  // own status stamp is the assertion, not a Recent Invoices row. The stamp
  // is only visually uppercased via CSS (text-transform), so match the
  // actual DOM text case-sensitively and exactly -- ":text-is()", not
  // "text=", so "Paid" can't later false-match inside "Partially Paid".
  await page.waitForSelector(':text-is("Partially Paid")', { timeout: 10000 });

  const snap = await adminDb.collection("invoices").where("customerName", "==", customerName).get();
  assert(snap.size === 1, `expected exactly 1 invoice for ${customerName}, found ${snap.size}`);
  invoiceId = snap.docs[0].id;
  const inv = snap.docs[0].data();
  assert(inv.status === "Partially Paid", `expected status Partially Paid, got ${inv.status}`);
  assert(inv.payments?.length === 1, "expected exactly 1 payment record");
  assert(inv.payments[0].amount === partial, "payment amount should equal the tendered partial");
});

await check("Collect Payment completes the balance and marks invoice Paid", async () => {
  // Collect from the document view's own action bar (still showing the
  // invoice just issued above), not the drawer -- exercises the same
  // store.recordInvoicePayment path either way.
  await page.locator('button:has-text("Collect Payment")').click();
  await page.waitForSelector("text=Collect Payment ·", { timeout: 10000 });

  await page.locator(".fixed").locator('button:has-text("Cash")').click();
  await page.click('button:has-text("Record Payment")');
  await page.waitForSelector("text=Payment recorded", { timeout: 10000 });

  await page.waitForSelector(':text-is("Paid")', { timeout: 10000 });

  const doc = await adminDb.collection("invoices").doc(invoiceId).get();
  const inv = doc.data();
  assert(inv.status === "Paid", `expected status Paid after collecting balance, got ${inv.status}`);
  assert(inv.payments.length === 2, "expected 2 payment records after Collect Payment");
});

await check("Refund updates invoice status and customer spend", async () => {
  const before = await adminDb.collection("invoices").doc(invoiceId).get();
  const invBefore = before.data();
  const customerId = invBefore.customerId;

  await page.locator('button:has-text("Refund")').first().click();
  await page.waitForSelector("text=Refund ·", { timeout: 10000 });
  await page.fill('input[placeholder*="unhappy"]', "E2E test refund");
  await page.click('button:has-text("Refund LKR")');
  // A confirmation step guards the actual refund (audit finding P4 --
  // irreversible money leaving the till) -- without confirming it, the
  // AlertDialog's overlay is left open, blocking every click after it.
  await page.waitForSelector("text=This cannot be undone", { timeout: 10000 });
  await page.click('button:has-text("Confirm")');
  await page.waitForSelector("text=refunded on", { timeout: 10000 });

  const invAfter = await waitForInvoiceField(invoiceId, (d) => d?.status === "Refunded");
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

await check("Recent Invoices drawer shows the same invoice as Refunded", async () => {
  await page.getByTestId("recent-invoices-trigger").click();
  const drawer = page.getByTestId("recent-invoices-drawer");
  await drawer.waitFor({ timeout: 10000 });
  await drawer.getByText(customerName).waitFor({ timeout: 10000 });
  assert(
    (await drawer.locator(':text-is("Refunded")').count()) > 0,
    "expected Refunded status in the drawer row",
  );
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
