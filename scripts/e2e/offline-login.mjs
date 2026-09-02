// Regression check for the offline PIN login fallback (src/lib/offline-auth.ts,
// src/lib/auth.tsx). Simulates an already-enrolled till by seeding a
// devices/{id} doc directly and injecting the till's local device secret into
// localStorage via addInitScript -- exercising the real Enroll flow through
// the Settings UI would just be extra clicks around the same code path this
// spec cares about. Everything downstream of that (populating the cached
// credential on a real online login, decrypting it with no network, wrong-PIN
// rejection, revocation wiping the cache) runs through the app's actual code,
// not a re-implementation of it.
import { chromium } from "playwright";
import { randomBytes } from "node:crypto";
import { BASE_URL, adminDb, check, summarize, loginAs } from "./_shared.mjs";
import { TEST_STAFF } from "../seed-emulator.mjs";

console.log("Offline PIN login:");

const DEVICE_ID = "e2e-test-till";
const DEVICE_SECRET = randomBytes(32).toString("base64");

await adminDb.collection("devices").doc(DEVICE_ID).set({
  label: "E2E Test Till",
  enrolledBy: TEST_STAFF.staffId,
  enrolledAt: new Date().toISOString(),
  revoked: false,
});

const browser = await chromium.launch();
const context = await browser.newContext();
// Runs before any page script on every navigation in this context -- as if
// this till had already completed Settings → Devices → Enroll previously.
await context.addInitScript(
  ({ id, secret }) => {
    localStorage.setItem("ps_device_id", id);
    localStorage.setItem("ps_device_secret", secret);
  },
  { id: DEVICE_ID, secret: DEVICE_SECRET },
);
const page = await context.newPage();

function lockScreen() {
  return page.click('button[aria-label="Lock"]');
}
function waitForPicker() {
  return page.waitForSelector(`button:has-text("@${TEST_STAFF.username}")`, { timeout: 10000 });
}
/** Types a PIN on the numpad without re-picking a tile -- a failed attempt
 *  clears the PIN and shakes, but stays on the *same* staff member's pad
 *  (see src/routes/index.tsx's `fail()`); only loginAs's first attempt needs
 *  to click a tile. */
async function typePin(pin) {
  for (const d of pin) await page.click(`button:text-is("${d}")`);
}
// Every offline attempt -- right or wrong -- first burns through the full
// online retry budget (8 attempts x ~1.5s backoff against a genuinely
// unreachable network, see retryTransient in src/lib/auth.tsx) before ever
// reaching the local decrypt. That's ~10-12s, so give real headroom on top.
const OFFLINE_ATTEMPT_TIMEOUT_MS = 30000;
// A failed attempt clears the PIN field on its own 600ms timeout (`fail()`
// in src/routes/index.tsx) -- typing the next attempt's digits before that
// fires lands them on top of the still-full 4-digit buffer and they're
// silently dropped (`pin.length >= PIN_LEN` short-circuits pressDigit).
const PIN_RESET_SETTLE_MS = 800;

await check("online login populates this till's offline cache", async () => {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await loginAs(page, TEST_STAFF.username, TEST_STAFF.pin);
  await page.waitForURL(/dashboard/, { timeout: 20000 });
  await page.waitForFunction(
    (staffId) => !!localStorage.getItem(`ps_offline_cred_${staffId}`),
    TEST_STAFF.staffId,
    { timeout: 15000 },
  );
});

await check("signing out returns to the staff picker", async () => {
  await lockScreen();
  await waitForPicker();
});

await context.setOffline(true);

await check("the same PIN unlocks offline, with the Offline banner shown", async () => {
  await loginAs(page, TEST_STAFF.username, TEST_STAFF.pin);
  await page.waitForURL(/dashboard/, { timeout: 20000 });
  await page.waitForSelector("text=Offline", { timeout: 10000 });
});

await check("a wrong PIN is rejected offline, not silently accepted", async () => {
  await lockScreen();
  await waitForPicker();
  await loginAs(page, TEST_STAFF.username, "0000");
  await page.waitForSelector("text=Incorrect username or PIN", {
    timeout: OFFLINE_ATTEMPT_TIMEOUT_MS,
  });
});

/** Types a PIN, then waits until src/lib/offline-auth.ts's own attempt
 *  counter for this account actually reaches `expectedCount` -- tied to the
 *  real state this check cares about, not DOM timing. The error text is
 *  identical ("Incorrect username or PIN") on every failed attempt, so
 *  waiting on *that* can resolve against a previous attempt's still-visible
 *  banner; racing ahead on that hits the numpad while it's still `busy`
 *  (src/routes/index.tsx), which silently drops the click, and the counter
 *  then never reaches the threshold this check exists to verify. */
async function attemptWrongPin(pin, expectedCount) {
  await page.waitForTimeout(PIN_RESET_SETTLE_MS);
  await typePin(pin);
  await page.waitForFunction(
    ({ staffId, expected }) => {
      try {
        const raw = localStorage.getItem(`ps_offline_attempts_${staffId}`);
        return raw ? JSON.parse(raw).count >= expected : false;
      } catch {
        return false;
      }
    },
    { staffId: TEST_STAFF.staffId, expected: expectedCount },
    { timeout: OFFLINE_ATTEMPT_TIMEOUT_MS },
  );
}

await check("repeated wrong PINs trip the local lockout", async () => {
  // One wrong attempt already landed above (still on the same staff
  // member's PIN pad -- a wrong PIN never bounces back to the tile picker);
  // four more crosses LOCKOUT_THRESHOLD in src/lib/offline-auth.ts.
  await attemptWrongPin("0001", 2);
  await attemptWrongPin("0001", 3);
  await attemptWrongPin("0001", 4);
  await attemptWrongPin("0001", 5);
  await page.waitForSelector("text=Too many attempts", { timeout: 5000 });
});

await context.setOffline(false);

await check("a revoked device loses its offline cache next time it's online", async () => {
  await adminDb.collection("devices").doc(DEVICE_ID).update({ revoked: true });
  // Revocation is only checked while genuinely online and signed in (the
  // periodic ping in auth.tsx) -- there's no way to push it to an
  // already-offline till, by design.
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await loginAs(page, TEST_STAFF.username, TEST_STAFF.pin);
  await page.waitForURL(/dashboard/, { timeout: 20000 });
  await page.waitForFunction(() => localStorage.getItem("ps_device_id") === null, {
    timeout: 15000,
  });

  await lockScreen();
  await waitForPicker();
  await context.setOffline(true);
  await loginAs(page, TEST_STAFF.username, TEST_STAFF.pin);
  await page.waitForSelector("text=Couldn't reach the server", { timeout: 15000 });
  await context.setOffline(false);
});

await browser.close();
summarize("Offline PIN login");
