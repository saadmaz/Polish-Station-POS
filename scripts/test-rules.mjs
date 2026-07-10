// Behavioral tests for firestore.rules, run against the emulator.
//   firebase emulators:exec --only firestore "node scripts/test-rules.mjs"
//
// Exercises the SuperAdmin tier and per-user module permissions — the two
// properties that are easy to get subtly wrong and impossible to eyeball.

import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
} from "firebase/firestore";

const PROJECT_ID = "pos-rules-test";

const env = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: {
    rules: readFileSync("firestore.rules", "utf8"),
    host: "127.0.0.1",
    port: 8080,
  },
});

// Auth contexts mirroring loginFn's claims: { role, name, perms }.
const ctx = (uid, role, perms, name = uid) =>
  env.authenticatedContext(uid, { role, name, perms }).firestore();

const ALL = [
  "dashboard", "bookings", "jobs", "bay-board", "customers", "inventory",
  "equipment", "purchase-orders", "notifications", "pos", "staff", "reports", "settings",
];

const superAdmin = ctx("sa", "SuperAdmin", []);            // empty perms on purpose
const admin      = ctx("ad", "Admin", ALL);
const managerPos = ctx("mgr", "Manager", ["pos", "dashboard"]);
const cashierNoPos = ctx("cash1", "Cashier", ["dashboard"]);   // POS revoked
const cashierPos   = ctx("cash2", "Cashier", ["pos", "dashboard"]);
const anon       = env.unauthenticatedContext().firestore();

let pass = 0, fail = 0;
async function check(label, promise) {
  try {
    await promise;
    console.log(`  ✅ ${label}`);
    pass++;
  } catch (e) {
    console.log(`  ❌ ${label}\n     ${String(e).split("\n")[0]}`);
    fail++;
  }
}

// Seed data with rules disabled so reads under test have something to hit.
await env.withSecurityRulesDisabled(async (c) => {
  const d = c.firestore();
  await setDoc(doc(d, "staff/ad"),        { name: "ad", role: "Admin" });
  await setDoc(doc(d, "staff_public/ad"), { name: "ad", role: "Admin", active: true });
  await setDoc(doc(d, "usernames/admin"), { staffId: "ad" });
  await setDoc(doc(d, "invoices/inv1"),   { total: 100 });
  await setDoc(doc(d, "purchaseOrders/po1"), { total: 5 });
  await setDoc(doc(d, "settings/notifications"), { x: 1 });
});

console.log("\nStaff roster & username index (enumeration hole is closed):");
await check("anon CANNOT read staff_public",        assertFails(getDoc(doc(anon, "staff_public/ad"))));
await check("authed user CAN read staff_public",    assertSucceeds(getDoc(doc(cashierNoPos, "staff_public/ad"))));
await check("nobody can read usernames index",      assertFails(getDoc(doc(admin, "usernames/admin"))));
await check("client cannot write staff docs",       assertFails(setDoc(doc(admin, "staff/x"), { role: "Admin" })));

console.log("\nModule permission gating (POS):");
await check("cashier WITHOUT pos perm cannot read invoices", assertFails(getDoc(doc(cashierNoPos, "invoices/inv1"))));
await check("cashier WITH pos perm can read invoices",       assertSucceeds(getDoc(doc(cashierPos, "invoices/inv1"))));
await check("manager WITH pos perm can update invoice",      assertSucceeds(setDoc(doc(managerPos, "invoices/inv1"), { total: 2 }, { merge: true })));
await check("cashier WITH pos perm CANNOT update invoice (Manager+ only)", assertFails(setDoc(doc(cashierPos, "invoices/inv1"), { total: 3 }, { merge: true })));

console.log("\nSuperAdmin implicitly holds every module (empty perms list):");
await check("superadmin can read invoices despite empty perms", assertSucceeds(getDoc(doc(superAdmin, "invoices/inv1"))));
await check("superadmin can read purchaseOrders",               assertSucceeds(getDoc(doc(superAdmin, "purchaseOrders/po1"))));
await check("superadmin can delete invoice (isAdmin path)",     assertSucceeds(deleteDoc(doc(superAdmin, "invoices/inv1"))));

console.log("\nSettings writes require Manager+ AND settings module:");
await check("manager without settings perm CANNOT write settings", assertFails(setDoc(doc(managerPos, "settings/notifications"), { x: 9 }, { merge: true })));
await check("admin with settings perm CAN write settings",         assertSucceeds(setDoc(doc(admin, "settings/notifications"), { x: 9 }, { merge: true })));
await check("cashier CANNOT delete invoice (not admin)",           assertFails(deleteDoc(doc(cashierPos, "invoices/po-none"))));

console.log("\nPurchase orders gated on the purchase-orders module:");
await check("admin (has po module) can read po",       assertSucceeds(getDoc(doc(admin, "purchaseOrders/po1"))));
await check("manager without po module cannot read po", assertFails(getDoc(doc(managerPos, "purchaseOrders/po1"))));

await env.cleanup();

console.log(`\n${fail === 0 ? "✅ ALL PASSED" : "❌ FAILURES"} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
