// SuperAdmin creates a user from Settings → Staff & Access, that user signs in
// with the admin-given PIN (NO forced PIN change — the admin's PIN is the
// working credential), and finally the SuperAdmin deletes the account.
// Exercises createStaffFn, loginFn, and deleteStaffFn end to end against the
// emulator (the project-ID-aligned harness makes verifyIdToken work, so the
// Admin-authenticated server functions are genuinely tested).
import { chromium } from "playwright";
import { BASE_URL, adminDb, check, assert, summarize } from "./_shared.mjs";
import { TEST_STAFF } from "../seed-emulator.mjs";

console.log("New user: create → sign in (no forced PIN change) → delete:");

const browser = await chromium.launch();
const admin = await (await browser.newContext()).newPage();

const newUsername = `NEWSTAFF${Date.now().toString().slice(-6)}`;
const newName = "New Staff Member";
const newPin = "1357";
let newStaffId = null;

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
  await admin.waitForSelector(`text=${newName} created`, { timeout: 15000 });
});

await check("account is NOT flagged for a forced PIN change", async () => {
  const idxSnap = await adminDb.collection("usernames").doc(newUsername.toLowerCase()).get();
  assert(idxSnap.exists, "username index doc was not created");
  newStaffId = idxSnap.data().staffId;
  const staffSnap = await adminDb.collection("staff").doc(newStaffId).get();
  assert(staffSnap.exists, "staff doc was not created");
  const s = staffSnap.data();
  assert(s.active === true, "new user should be active");
  assert(s.mustChangePin === false, "new user must NOT be forced to change PIN");
});

// The whole point: signing in with the admin-given PIN drops straight into the
// app — no /change-pin detour.
const fresh = await (await browser.newContext()).newPage();
await check("new user signs in with the admin PIN and lands straight in the app", async () => {
  await signIn(fresh, newUsername, newPin);
  await fresh.waitForURL(/dashboard/, { timeout: 20000 });
  const onChangePin = fresh.url().includes("change-pin");
  assert(
    !onChangePin,
    "new user was sent to the change-PIN screen — should go straight to the app",
  );
});
await fresh.close();

await check("SuperAdmin deletes the user (deleteStaffFn)", async () => {
  await admin.locator("tr", { hasText: newUsername }).locator('[title="Delete user"]').click();
  await admin.click('button:has-text("Delete user")'); // confirm dialog
  await admin.waitForSelector(`text=${newName} deleted`, { timeout: 15000 });
});

await check("delete removed the staff, public, and username-index docs", async () => {
  const staffSnap = await adminDb.collection("staff").doc(newStaffId).get();
  const pubSnap = await adminDb.collection("staff_public").doc(newStaffId).get();
  const idxSnap = await adminDb.collection("usernames").doc(newUsername.toLowerCase()).get();
  assert(!staffSnap.exists, "staff doc should be gone");
  assert(!pubSnap.exists, "staff_public doc should be gone");
  assert(!idxSnap.exists, "username index doc should be gone (freed for reuse)");
});

await check("the deleted user can no longer sign in", async () => {
  const gone = await (await browser.newContext()).newPage();
  await signIn(gone, newUsername, newPin);
  // Login must fail → they stay on the login screen, never reach the app.
  await gone.waitForTimeout(4000);
  assert(!gone.url().includes("dashboard"), "deleted user reached the app");
  assert((await gone.locator("#username").count()) === 1, "deleted user left the login screen");
  await gone.close();
});

await browser.close();
summarize("New user lifecycle");
