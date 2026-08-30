import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:5173";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("❌ FIRESTORE_EMULATOR_HOST is not set, refusing to run against a real project.");
  process.exit(1);
}

if (getApps().length === 0) {
  initializeApp({ projectId: "demo-pos-polishstation" });
}

export const adminDb = getFirestore();

let pass = 0;
let fail = 0;

export async function check(label, fn) {
  try {
    await fn();
    console.log(`  ✅ ${label}`);
    pass++;
  } catch (e) {
    console.log(`  ❌ ${label}\n     ${e instanceof Error ? e.message : String(e)}`);
    fail++;
  }
}

export function assert(cond, message) {
  if (!cond) throw new Error(message ?? "assertion failed");
}

export function summarize(suiteName) {
  console.log(`\n${suiteName}: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

/** Picks a staff tile by username from the login screen's picker, then types
 *  the PIN on the numpad that appears. Assumes `page` has already navigated
 *  to the login screen (or is already showing it, e.g. after a redirect) --
 *  callers own the `page.goto`, since some need it and some are reusing an
 *  already-loaded page.
 *
 *  Digit buttons use an EXACT text match (`:text-is`), not `:has-text`'s
 *  substring match: `:has-text("2")` also matches the "Not you?" tile once a
 *  staff member is picked, because its own text ("E2E Admin ... Not you?")
 *  contains a "2" -- that ambiguity silently clicked "Not you?" instead of
 *  the numpad key and reset the whole picker mid-PIN-entry. */
export async function loginAs(page, username, pin) {
  const tile = page.locator(`button:has-text("@${username}")`).first();
  await tile.waitFor({ timeout: 15000 });
  await tile.click();
  for (const d of pin) await page.click(`button:text-is("${d}")`);
}
