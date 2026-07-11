// Reproduces the exact production report: a SuperAdmin creates a user from the
// dashboard (Settings → Staff & Access), then that new user tries to log in.
// In production this returned a 408 (server-function timeout) — but that is a
// COLD-START timing failure on the shared host, not a logic error. This spec
// runs against the fast local emulator to prove the create → new-user-login
// LOGIC is correct end to end (username index written, PIN verified, custom
// token minted, forced-PIN-change gate reached). If this passes, the only
// remaining production cause is cold-start latency — addressed separately by
// the firebase-admin warm-up (/healthz + boot self-warm).
import { chromium } from "playwright";
import { BASE_URL, adminDb, check, assert, summarize } from "./_shared.mjs";
import { TEST_STAFF } from "../seed-emulator.mjs";

console.log("New-user login (SuperAdmin creates user → user signs in):");

const browser = await chromium.launch();
const admin = await (await browser.newContext()).newPage();

const newUsername = `NEWSTAFF${Date.now().toString().slice(-6)}`;
const newName = "New Staff Member";
const newPin = "1357";

async function signIn(page, username, pin) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("#username", { timeout: 15000 });
  await page.fill("#username", username);
  for (const d of pin) await page.click(`button:has-text("${d}")`);
}

await check("SuperAdmin logs in and opens Settings → Staff & Access", async () => {
  await signIn(admin, TEST_STAFF.username, TEST_STAFF.pin);
  await admin.waitForURL(/dashboard/, { timeout: 20000 });
  await admin.goto(`${BASE_URL}/settings`, { waitUntil: "domcontentloaded" });
  await admin.click('button:has-text("Staff & Access")');
  await admin.waitForSelector('button:has-text("Add User")', { timeout: 10000 });
});

await check("SuperAdmin creates a new user", async () => {
  await admin.click('button:has-text("Add User")');
  await admin.fill('input[placeholder="e.g. Salman"]', newName);
  await admin.fill('input[placeholder="e.g. SALMAN"]', newUsername);
  await admin.fill('input[placeholder="4 digits"]', newPin);
  await admin.click('button:has-text("Create user")');
  // Success toast confirms createStaffFn returned success (Admin SDK wrote the
  // staff + staff_public + usernames docs). A failure here would mean the
  // server function rejected the caller — the exact "unauthorized" symptom the
  // project-ID-aligned emulator (test:e2e --project demo-pos-polishstation)
  // exists to catch.
  await admin.waitForSelector(`text=${newName} created`, { timeout: 15000 });
});

await check("new user's staff doc + username index were written correctly", async () => {
  const idxSnap = await adminDb.collection("usernames").doc(newUsername.toLowerCase()).get();
  assert(idxSnap.exists, "username index doc was not created");
  const staffId = idxSnap.data().staffId;
  const staffSnap = await adminDb.collection("staff").doc(staffId).get();
  assert(staffSnap.exists, "staff doc was not created");
  const s = staffSnap.data();
  assert(s.active === true, "new user should be active");
  assert(s.mustChangePin === true, "admin-created user must be flagged mustChangePin");
  assert(typeof s.pinHash === "string" && s.pinHash.length > 0, "pinHash missing");
});

// The reported failure: signing in AS the new user, on a fresh device/session.
const fresh = await (await browser.newContext()).newPage();

await check("new user can sign in and is routed to the forced PIN change", async () => {
  await signIn(fresh, newUsername, newPin);
  // Admin-issued PIN is a bootstrap credential → must land on /change-pin,
  // NOT bounce back to the login screen with "couldn't reach the server".
  await fresh.waitForURL(/change-pin/, { timeout: 20000 });
  await fresh.waitForSelector("text=/change.*pin/i", { timeout: 10000 });
});

await check(
  "new user is NOT stuck on the login screen (regression guard for the 408)",
  async () => {
    const onLogin = await fresh.locator("#username").count();
    assert(onLogin === 0, "new user was bounced back to the login screen");
  },
);

await browser.close();
summarize("New-user login");
