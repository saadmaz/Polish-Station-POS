// Regression check for the persistent PIN-session layer (src/server/sessions.ts,
// the resume-on-mount logic in src/lib/auth.tsx): a device that already has a
// valid session cookie must skip the PIN screen entirely on reload/restart,
// but a device whose session was explicitly logged out or revoked
// server-side must always fall back to it. Reads/writes the `sessions`
// collection directly via the Admin SDK the same way the server does, since
// there's no client-visible way to inspect a session's state otherwise.
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { BASE_URL, adminDb, check, summarize, loginAs } from "./_shared.mjs";
import { TEST_STAFF } from "../seed-emulator.mjs";

console.log("Session resume:");

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

async function getSessionCookie() {
  const cookies = await context.cookies();
  return cookies.find((c) => c.name === "ps_session");
}

await check("login creates an HttpOnly/Secure/Lax session cookie", async () => {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await loginAs(page, TEST_STAFF.username, TEST_STAFF.pin);
  await page.waitForURL(/dashboard/, { timeout: 20000 });
  // createSessionFn fires in the background right after login, not awaited
  // by it -- give it a moment to land before asserting on the cookie.
  await page.waitForTimeout(1500);
  const cookie = await getSessionCookie();
  if (!cookie) throw new Error("no ps_session cookie after login");
  if (!cookie.httpOnly) throw new Error("ps_session is not HttpOnly");
  if (!cookie.secure) throw new Error("ps_session is not Secure");
  if (cookie.sameSite !== "Lax") throw new Error(`ps_session sameSite is ${cookie.sameSite}, want Lax`);
});

let tokenHash;
await check("a reload auto-resumes straight to the dashboard, no PIN screen", async () => {
  const cookie = await getSessionCookie();
  tokenHash = hashToken(cookie.value);

  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  // No loginAs() call here at all: if resume failed, the picker would be
  // showing and the wait below would time out instead of ever reaching
  // /dashboard.
  await page.waitForURL(/dashboard/, { timeout: 20000 });
});

await check("the session doc exists server-side with the expected shape", async () => {
  const snap = await adminDb.collection("sessions").doc(tokenHash).get();
  if (!snap.exists) throw new Error("no sessions/{tokenHash} doc");
  const data = snap.data();
  if (data.staffId !== TEST_STAFF.staffId) throw new Error(`staffId=${data.staffId}`);
  if (data.revoked !== false) throw new Error("session already revoked");
});

await check("revoking the session doc directly forces the PIN screen back", async () => {
  await adminDb
    .collection("sessions")
    .doc(tokenHash)
    .set({ revoked: true, revokedAt: new Date().toISOString() }, { merge: true });

  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(`button:has-text("@${TEST_STAFF.username}")`, { timeout: 15000 });
  if (/dashboard/.test(page.url())) throw new Error("still on the dashboard after revoke");
});

await check("logging back in, then locking, revokes that new session too", async () => {
  await loginAs(page, TEST_STAFF.username, TEST_STAFF.pin);
  await page.waitForURL(/dashboard/, { timeout: 20000 });
  await page.waitForTimeout(1500); // let the background createSessionFn land
  const newHash = hashToken((await getSessionCookie()).value);

  await page.click('button[aria-label="Lock"]');
  await page.waitForURL(BASE_URL + "/", { timeout: 15000 });

  // logout() fires logoutFn() fire-and-forget (Lock must feel instant), so
  // poll the actual session doc instead of guessing a fixed delay -- a fixed
  // sleep here previously raced the still-in-flight revoke and flaked.
  const deadline = Date.now() + 15000;
  let revoked = false;
  while (Date.now() < deadline) {
    const snap = await adminDb.collection("sessions").doc(newHash).get();
    if (snap.exists && snap.data().revoked === true) {
      revoked = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!revoked) throw new Error("session doc was never marked revoked after Lock");

  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(`button:has-text("@${TEST_STAFF.username}")`, { timeout: 15000 });
  if (/dashboard/.test(page.url())) throw new Error("still resumed after Lock");
});

await browser.close();
summarize("Session resume");
