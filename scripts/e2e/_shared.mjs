import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:5173";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("❌ FIRESTORE_EMULATOR_HOST is not set — refusing to run against a real project.");
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
