// Behavioral tests for firestore.rules, run against the emulator.
//   firebase emulators:exec --only firestore "node scripts/test-rules.mjs"
//
// Exercises the SuperAdmin tier and per-user module permissions: the two
// properties that are easy to get subtly wrong and impossible to eyeball.

import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";

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
  "dashboard",
  "bookings",
  "customers",
  "inventory",
  "equipment",
  "purchase-orders",
  "notifications",
  "pos",
  "staff",
  "reports",
  "settings",
];

const superAdmin = ctx("sa", "SuperAdmin", []); // empty perms on purpose
const admin = ctx("ad", "Admin", ALL);
const managerPos = ctx("mgr", "Manager", ["pos", "dashboard"]);
const cashierNoPos = ctx("cash1", "Cashier", ["dashboard"]); // POS revoked
const cashierPos = ctx("cash2", "Cashier", ["pos", "dashboard"]);
const advisorLeads = ctx("adv1", "Advisor", ["leads", "dashboard"]);
const advisorNoLeads = ctx("adv2", "Advisor", ["dashboard"]); // leads revoked
// Edge case: a SuperAdmin manually grants "leads" to a Cashier, even though
// ROLE_DEFAULT_PERMISSIONS never does this -- module access alone must not
// be enough to create a lead, the role check matters too.
const cashierLeadsGranted = ctx("cash3", "Cashier", ["leads"]);
// Default-permissioned Advisor (mirrors ROLE_DEFAULT_PERMISSIONS.Advisor) --
// holds "customers" and "inventory" but is NOT Manager+, the exact profile
// Finding 4's coupons/inventory field-restriction tests need.
const advisorDefault = ctx("adv3", "Advisor", [
  "dashboard",
  "bookings",
  "customers",
  "leads",
  "pos",
  "inventory",
  "equipment",
  "notifications",
]);
const anon = env.unauthenticatedContext().firestore();

let pass = 0,
  fail = 0;
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
  await setDoc(doc(d, "staff/ad"), { name: "ad", role: "Admin" });
  await setDoc(doc(d, "staff/mgr"), { name: "mgr", role: "Manager" });
  await setDoc(doc(d, "staff_public/ad"), { name: "ad", role: "Admin", active: true });
  await setDoc(doc(d, "usernames/admin"), { staffId: "ad" });
  await setDoc(doc(d, "invoices/inv1"), { total: 100 });
  // Shaped like a real addInvoice() write (see store.tsx) -- used to test
  // the tightened update rule against realistic full-document overwrites,
  // not just the legacy bare-total seed above.
  const freshInvoice = {
    total: 100,
    subtotal: 100,
    lines: [],
    status: "Issued",
    payments: [],
    refunds: [],
  };
  await setDoc(doc(d, "invoices/inv2"), freshInvoice);
  // Separate docs per update-rule test below -- each assertSucceeds test
  // actually mutates emulator state, so sharing one doc across assertions
  // would make later tests see an already-mutated `resource.data` (e.g. a
  // payments array that already grew), which is not what each test means
  // to exercise.
  await setDoc(doc(d, "invoices/inv3"), freshInvoice);
  await setDoc(doc(d, "invoices/inv4"), {
    ...freshInvoice,
    payments: [{ method: "Cash", amount: 50, reference: "", staffName: "cash2", at: "now" }],
  });
  await setDoc(doc(d, "invoices/inv5"), freshInvoice);
  await setDoc(doc(d, "invoices/inv6"), freshInvoice);
  await setDoc(doc(d, "purchaseOrders/po1"), { total: 5 });
  // Shaped like a real Coupon (see db.ts) / InventoryItem doc -- used for
  // Finding 4's field-restriction tests below.
  const freshCoupon = {
    code: "SAVE10",
    type: "percent",
    value: 10,
    active: true,
    expiresAt: null,
    maxRedemptions: null,
    redeemedCount: 0,
  };
  await setDoc(doc(d, "coupons/c1"), freshCoupon);
  await setDoc(doc(d, "coupons/c2"), freshCoupon);
  await setDoc(doc(d, "coupons/c3"), freshCoupon);
  const freshInventoryItem = {
    name: "Microfiber Towel",
    sku: "MF-1",
    category: "Microfiber",
    unit: "pc",
    stock: 100,
    reorder: 20,
    cost: 350,
    supplier: "Local Textiles",
    lastUpdated: "then",
  };
  await setDoc(doc(d, "inventory/i1"), freshInventoryItem);
  await setDoc(doc(d, "inventory/i2"), freshInventoryItem);
  await setDoc(doc(d, "settings/notifications"), { x: 1 });
  await setDoc(doc(d, "leads/lead1"), { name: "Test Lead", type: "contact", status: "new" });
  // Separate docs per transition-graph test below, same reasoning as the
  // invoices inv1..inv6 split above: each assertSucceeds test actually
  // mutates emulator state.
  const freshLead = (name, status, source) => ({
    id: name, type: "contact", name, status, source, createdAt: "t",
  });
  await setDoc(doc(d, "leads/leadNew1"), freshLead("leadNew1", "new", "whatsapp"));
  await setDoc(doc(d, "leads/leadNew2"), freshLead("leadNew2", "new", "whatsapp"));
  await setDoc(doc(d, "leads/leadNew3"), freshLead("leadNew3", "new", "whatsapp"));
  await setDoc(doc(d, "leads/leadQuoted"), freshLead("leadQuoted", "quoted", "phone"));
  await setDoc(doc(d, "leads/leadConverted"), {
    ...freshLead("leadConverted", "converted", "walk-in"),
    convertedTo: { type: "walk-in", id: "INV-1" },
  });
  await setDoc(doc(d, "newsletterSubscribers/a@example.com"), {
    email: "a@example.com",
    status: "subscribed",
  });
});

console.log("\nStaff roster & username index:");
// staff_public is intentionally unauthenticated-readable -- the login screen
// is a staff picker and must show this roster before anyone is signed in
// (see the rule's own comment). Pre-existing stale assertion from before that
// picker existed; not part of Findings 1/2, tracked separately as Finding 3.
await check(
  "anon CAN read staff_public (intentional, login picker)",
  assertSucceeds(getDoc(doc(anon, "staff_public/ad"))),
);
await check(
  "authed user CAN read staff_public",
  assertSucceeds(getDoc(doc(cashierNoPos, "staff_public/ad"))),
);
await check("nobody can read usernames index", assertFails(getDoc(doc(admin, "usernames/admin"))));
await check(
  "client cannot write staff docs",
  assertFails(setDoc(doc(admin, "staff/x"), { role: "Admin" })),
);

console.log(
  "\nPROPOSED (Finding 1): staff/{staffId} read is owner-only, no more Manager+ bulk grant:",
);
await check(
  "admin CAN read their OWN staff doc (pinHash exposure to self is unchanged/accepted)",
  assertSucceeds(getDoc(doc(admin, "staff/ad"))),
);
await check(
  "manager can NO LONGER read a DIFFERENT staff member's doc (was: any Manager+)",
  assertFails(getDoc(doc(managerPos, "staff/ad"))),
);
await check(
  "admin (not Manager+ of self) can NO LONGER read a peer's staff doc either",
  assertFails(getDoc(doc(admin, "staff/mgr"))),
);
await check("anon cannot read a staff doc", assertFails(getDoc(doc(anon, "staff/ad"))));

console.log("\nModule permission gating (POS):");
await check(
  "cashier WITHOUT pos perm cannot read invoices",
  assertFails(getDoc(doc(cashierNoPos, "invoices/inv1"))),
);
await check(
  "cashier WITH pos perm can read invoices",
  assertSucceeds(getDoc(doc(cashierPos, "invoices/inv1"))),
);
// PROPOSED (Finding 2): total is now immutable on update -- these two used
// to assertSucceeds under the old, unvalidated rule. A raw total mutation,
// merge or not, role notwithstanding, must now fail; see the "Invoice
// immutability" block below for the realistic full-document-overwrite
// equivalents of what these were meant to stand in for (balance collection
// via recordInvoicePayment never touches total in the first place).
await check(
  "manager WITH pos perm can no longer rewrite an invoice's total",
  assertFails(setDoc(doc(managerPos, "invoices/inv1"), { total: 2 }, { merge: true })),
);
await check(
  "cashier WITH pos perm can no longer rewrite an invoice's total",
  assertFails(setDoc(doc(cashierPos, "invoices/inv1"), { total: 3 }, { merge: true })),
);
await check(
  "cashier WITHOUT pos perm cannot update invoice",
  assertFails(setDoc(doc(cashierNoPos, "invoices/inv1"), { total: 4 }, { merge: true })),
);

console.log("\nPROPOSED (Finding 2): invoice creation must look like a real sale:");
await check(
  "cashier CAN create a well-formed invoice (status Issued, non-negative totals)",
  assertSucceeds(
    setDoc(doc(cashierPos, "invoices/new1"), {
      status: "Issued",
      total: 100,
      subtotal: 100,
      lines: [],
      payments: [],
    }),
  ),
);
await check(
  "cashier CANNOT create an invoice that starts anywhere but Issued",
  assertFails(
    setDoc(doc(cashierPos, "invoices/new2"), {
      status: "Paid",
      total: 100,
      subtotal: 100,
      lines: [],
      payments: [],
    }),
  ),
);
await check(
  "cashier CANNOT create an invoice with a negative total",
  assertFails(
    setDoc(doc(cashierPos, "invoices/new3"), {
      status: "Issued",
      total: -50,
      subtotal: -50,
      lines: [],
      payments: [],
    }),
  ),
);

console.log(
  "\nPROPOSED (Finding 2): invoice updates may append payments/move status, never rewrite the sale:",
);
await check(
  "cashier CAN record a payment (total/subtotal/lines unchanged, payments grows)",
  assertSucceeds(
    setDoc(doc(cashierPos, "invoices/inv2"), {
      total: 100,
      subtotal: 100,
      lines: [],
      status: "Partially Paid",
      payments: [{ method: "Cash", amount: 50, reference: "", staffName: "cash2", at: "now" }],
      refunds: [],
    }),
  ),
);
await check(
  "cashier CANNOT change the total while updating an invoice",
  assertFails(
    setDoc(doc(cashierPos, "invoices/inv3"), {
      total: 999,
      subtotal: 100,
      lines: [],
      status: "Partially Paid",
      payments: [],
      refunds: [],
    }),
  ),
);
await check(
  "cashier CANNOT remove an existing payment (payments array shrinking)",
  assertFails(
    setDoc(doc(cashierPos, "invoices/inv4"), {
      total: 100,
      subtotal: 100,
      lines: [],
      status: "Issued",
      payments: [],
      refunds: [],
    }),
  ),
);
await check(
  "cashier (not Manager+) CANNOT set status to Refunded, even leaving totals alone",
  assertFails(
    setDoc(doc(cashierPos, "invoices/inv5"), {
      total: 100,
      subtotal: 100,
      lines: [],
      status: "Refunded",
      payments: [],
      refunds: [{ method: "Cash", amount: 100, reason: "", staffName: "cash2", at: "now" }],
    }),
  ),
);
await check(
  "manager CAN set status to Refunded",
  assertSucceeds(
    setDoc(doc(managerPos, "invoices/inv6"), {
      total: 100,
      subtotal: 100,
      lines: [],
      status: "Refunded",
      payments: [],
      refunds: [{ method: "Cash", amount: 100, reason: "", staffName: "mgr", at: "now" }],
    }),
  ),
);

console.log("\nSuperAdmin implicitly holds every module (empty perms list):");
await check(
  "superadmin can read invoices despite empty perms",
  assertSucceeds(getDoc(doc(superAdmin, "invoices/inv1"))),
);
await check(
  "superadmin can read purchaseOrders",
  assertSucceeds(getDoc(doc(superAdmin, "purchaseOrders/po1"))),
);
await check(
  "superadmin can delete invoice (isAdmin path)",
  assertSucceeds(deleteDoc(doc(superAdmin, "invoices/inv1"))),
);

console.log("\nSettings writes require Manager+ AND settings module:");
await check(
  "manager without settings perm CANNOT write settings",
  assertFails(setDoc(doc(managerPos, "settings/notifications"), { x: 9 }, { merge: true })),
);
await check(
  "admin with settings perm CAN write settings",
  assertSucceeds(setDoc(doc(admin, "settings/notifications"), { x: 9 }, { merge: true })),
);
await check(
  "cashier CANNOT delete invoice (not admin)",
  assertFails(deleteDoc(doc(cashierPos, "invoices/po-none"))),
);

console.log("\nPurchase orders gated on the purchase-orders module:");
await check(
  "admin (has po module) can read po",
  assertSucceeds(getDoc(doc(admin, "purchaseOrders/po1"))),
);
await check(
  "manager without po module cannot read po",
  assertFails(getDoc(doc(managerPos, "purchaseOrders/po1"))),
);

console.log("\nPROPOSED (Finding 4): coupon update is field-restricted for non-Managers:");
await check(
  "advisor (customers module, non-Manager) CAN redeem a coupon (redeemedCount grows only)",
  assertSucceeds(
    setDoc(doc(advisorDefault, "coupons/c1"), {
      code: "SAVE10",
      type: "percent",
      value: 10,
      active: true,
      expiresAt: null,
      maxRedemptions: null,
      redeemedCount: 1,
    }),
  ),
);
await check(
  "advisor (non-Manager) CANNOT rewrite a coupon's value while updating",
  assertFails(
    setDoc(doc(advisorDefault, "coupons/c2"), {
      code: "SAVE10",
      type: "percent",
      value: 99,
      active: true,
      expiresAt: null,
      maxRedemptions: null,
      redeemedCount: 1,
    }),
  ),
);
await check(
  "advisor (non-Manager) CANNOT toggle a coupon's active flag",
  assertFails(
    setDoc(doc(advisorDefault, "coupons/c3"), {
      code: "SAVE10",
      type: "percent",
      value: 10,
      active: false,
      expiresAt: null,
      maxRedemptions: null,
      redeemedCount: 0,
    }),
  ),
);
await check(
  "admin (Manager+, holds every module) CAN rewrite a coupon's value directly",
  assertSucceeds(
    setDoc(doc(admin, "coupons/c3"), {
      code: "SAVE10",
      type: "percent",
      value: 25,
      active: false,
      expiresAt: null,
      maxRedemptions: null,
      redeemedCount: 0,
    }),
  ),
);

console.log("\nPROPOSED (Finding 4): inventory full edit is Manager+ only, others adjust stock:");
await check(
  "advisor (inventory module, non-Manager) CAN adjust stock",
  assertSucceeds(
    setDoc(doc(advisorDefault, "inventory/i1"), {
      name: "Microfiber Towel",
      sku: "MF-1",
      category: "Microfiber",
      unit: "pc",
      stock: 90,
      reorder: 20,
      cost: 350,
      supplier: "Local Textiles",
      lastUpdated: "now",
    }),
  ),
);
await check(
  "advisor (non-Manager) CANNOT change an item's cost while adjusting stock",
  assertFails(
    setDoc(doc(advisorDefault, "inventory/i2"), {
      name: "Microfiber Towel",
      sku: "MF-1",
      category: "Microfiber",
      unit: "pc",
      stock: 90,
      reorder: 20,
      cost: 999,
      supplier: "Local Textiles",
      lastUpdated: "now",
    }),
  ),
);
await check(
  "admin (Manager+, holds every module) CAN edit an item's cost directly",
  assertSucceeds(
    setDoc(doc(admin, "inventory/i2"), {
      name: "Microfiber Towel",
      sku: "MF-1",
      category: "Microfiber",
      unit: "pc",
      stock: 100,
      reorder: 20,
      cost: 999,
      supplier: "Local Textiles",
      lastUpdated: "now",
    }),
  ),
);

console.log("\nAudit log: append-only, attributed to the caller's own uid:");
// Realistic full shape, matching store.tsx's logAudit() -- needed since
// Finding 5 now validates content, not just attribution (see below).
const fullAuditEntry = (staffId) => ({
  staffId,
  staffName: "cash2",
  action: "X",
  entity: "Test",
  entityId: "e1",
  before: null,
  after: { ok: true },
  createdAt: "now",
});
await check(
  "audit create with own staffId succeeds",
  assertSucceeds(setDoc(doc(cashierPos, "audit/a1"), fullAuditEntry("cash2"))),
);
await check(
  "audit create attributed to ANOTHER uid is rejected",
  assertFails(setDoc(doc(cashierPos, "audit/a2"), fullAuditEntry("mgr"))),
);
await check(
  "audit create without staffId is rejected",
  assertFails(setDoc(doc(cashierPos, "audit/a3"), { action: "X" })),
);
await check(
  "audit entries can never be updated",
  assertFails(setDoc(doc(admin, "audit/a1"), { staffId: "ad", action: "TAMPERED" })),
);
await check("audit entries can never be deleted", assertFails(deleteDoc(doc(admin, "audit/a1"))));

console.log("\nPROPOSED (Finding 5): audit content must look like a real log entry:");
await check(
  "cashier CANNOT create an audit entry with a non-string action",
  assertFails(setDoc(doc(cashierPos, "audit/bad1"), { ...fullAuditEntry("cash2"), action: 123 })),
);
await check(
  "cashier CANNOT create an audit entry with an empty entity",
  assertFails(setDoc(doc(cashierPos, "audit/bad2"), { ...fullAuditEntry("cash2"), entity: "" })),
);
await check(
  "cashier CANNOT create an audit entry missing entityId",
  assertFails(
    (() => {
      const e = fullAuditEntry("cash2");
      delete e.entityId;
      return setDoc(doc(cashierPos, "audit/bad3"), e);
    })(),
  ),
);

console.log("\nPROPOSED (Finding 5): jobEvents content must look like a real transition:");
const fullJobEvent = (actorId) => ({
  jobId: "J-1",
  fromStatus: null,
  toStatus: "booked",
  actorId,
  actorName: "cash2",
  at: "now",
  note: null,
});
await check(
  "cashier WITH pos perm CAN create a well-formed jobEvent",
  assertSucceeds(setDoc(doc(cashierPos, "jobEvents/je1"), fullJobEvent("cash2"))),
);
await check(
  "cashier CANNOT create a jobEvent attributed to another uid",
  assertFails(setDoc(doc(cashierPos, "jobEvents/je2"), fullJobEvent("mgr"))),
);
await check(
  "cashier CANNOT create a jobEvent with an empty toStatus",
  assertFails(setDoc(doc(cashierPos, "jobEvents/je3"), { ...fullJobEvent("cash2"), toStatus: "" })),
);
await check(
  "cashier WITHOUT pos perm cannot create a jobEvent at all",
  assertFails(setDoc(doc(cashierNoPos, "jobEvents/je4"), fullJobEvent("cash1"))),
);

console.log("\nSequential-ID counters:");
await check(
  "authed user can bump a counter",
  assertSucceeds(setDoc(doc(cashierPos, "counters/invoices"), { next: 2091 })),
);
await check(
  "anon cannot touch counters",
  assertFails(setDoc(doc(anon, "counters/invoices"), { next: 1 })),
);
await check(
  "counter value must be a positive int",
  assertFails(setDoc(doc(cashierPos, "counters/invoices"), { next: "oops" })),
);
await check("counters cannot be deleted", assertFails(deleteDoc(doc(admin, "counters/invoices"))));

console.log("\nLeads & newsletter subscribers (public intake, staff triage):");
await check("anon CANNOT read leads", assertFails(getDoc(doc(anon, "leads/lead1"))));
await check(
  "anon CANNOT write leads (the public routes use the Admin SDK, not this client)",
  assertFails(setDoc(doc(anon, "leads/lead2"), { name: "Bot", type: "contact", status: "new" })),
);
await check(
  "authed staff WITHOUT leads module cannot read leads",
  assertFails(getDoc(doc(advisorNoLeads, "leads/lead1"))),
);
await check(
  "authed staff WITH leads module can read leads",
  assertSucceeds(getDoc(doc(advisorLeads, "leads/lead1"))),
);
await check(
  "authed staff WITH leads module can update lead status",
  assertSucceeds(
    setDoc(doc(advisorLeads, "leads/lead1"), { status: "contacted" }, { merge: true }),
  ),
);
await check(
  "advisor (not Manager+) cannot delete a lead",
  assertFails(deleteDoc(doc(advisorLeads, "leads/lead1"))),
);

console.log(
  "\nLeads — manual entry create (staff-side, distinct from the Admin-SDK public routes):",
);
await check(
  "advisor WITH leads module can manually log a WhatsApp lead",
  assertSucceeds(
    setDoc(doc(advisorLeads, "leads/leadManual1"), {
      id: "leadManual1",
      type: "contact",
      name: "Manual WA",
      status: "new",
      source: "whatsapp",
      createdAt: "t",
    }),
  ),
);
await check(
  "advisor WITHOUT leads module cannot manually log a lead",
  assertFails(
    setDoc(doc(advisorNoLeads, "leads/leadManual2"), {
      id: "leadManual2",
      type: "contact",
      name: "X",
      status: "new",
      source: "phone",
      createdAt: "t",
    }),
  ),
);
await check(
  "Cashier granted the leads module still cannot create one (role must be Advisor or Manager+)",
  assertFails(
    setDoc(doc(cashierLeadsGranted, "leads/leadManual3"), {
      id: "leadManual3",
      type: "contact",
      name: "X",
      status: "new",
      source: "phone",
      createdAt: "t",
    }),
  ),
);
await check(
  "cannot spoof the website's source on a manually-created lead",
  assertFails(
    setDoc(doc(advisorLeads, "leads/leadManual4"), {
      id: "leadManual4",
      type: "contact",
      name: "X",
      status: "new",
      source: "polishstation.lk",
      createdAt: "t",
    }),
  ),
);
await check(
  "a manually-created lead cannot start at any status other than new",
  assertFails(
    setDoc(doc(advisorLeads, "leads/leadManual5"), {
      id: "leadManual5",
      type: "contact",
      name: "X",
      status: "contacted",
      source: "walk-in",
      createdAt: "t",
    }),
  ),
);

console.log("\nLeads — status transition graph (src/lib/lead.ts):");
await check(
  "new -> contacted is legal",
  assertSucceeds(
    setDoc(doc(advisorLeads, "leads/leadNew1"), { status: "contacted" }, { merge: true }),
  ),
);
await check(
  "new -> converted is legal (contacted/quoted are skippable), but requires convertedTo",
  assertFails(setDoc(doc(advisorLeads, "leads/leadNew2"), { status: "converted" }, { merge: true })),
);
await check(
  "new -> converted with a valid convertedTo succeeds",
  assertSucceeds(
    setDoc(
      doc(advisorLeads, "leads/leadNew2"),
      { status: "converted", convertedTo: { type: "service", id: "B-1" } },
      { merge: true },
    ),
  ),
);
await check(
  "converted is terminal -- cannot move back to any other status",
  assertFails(setDoc(doc(advisorLeads, "leads/leadNew2"), { status: "new" }, { merge: true })),
);
await check(
  "convertedTo is immutable once status is already converted",
  assertFails(
    setDoc(
      doc(advisorLeads, "leads/leadNew2"),
      { convertedTo: { type: "walk-in", id: "INV-9" } },
      { merge: true },
    ),
  ),
);
await check(
  "lost requires a non-empty lostReason",
  assertFails(setDoc(doc(advisorLeads, "leads/leadNew3"), { status: "lost" }, { merge: true })),
);
await check(
  "lost with a reason succeeds",
  assertSucceeds(
    setDoc(
      doc(advisorLeads, "leads/leadNew3"),
      { status: "lost", lostReason: "Went with a competitor" },
      { merge: true },
    ),
  ),
);
await check(
  "duplicate requires a non-empty duplicateOf",
  assertFails(
    setDoc(doc(advisorLeads, "leads/leadQuoted"), { status: "duplicate" }, { merge: true }),
  ),
);
await check(
  "duplicate with a target lead id succeeds",
  assertSucceeds(
    setDoc(
      doc(advisorLeads, "leads/leadQuoted"),
      { status: "duplicate", duplicateOf: "lead1" },
      { merge: true },
    ),
  ),
);
await check(
  "an already-converted lead cannot be re-pointed to a different artifact",
  assertFails(
    setDoc(
      doc(advisorLeads, "leads/leadConverted"),
      { convertedTo: { type: "service", id: "B-2" } },
      { merge: true },
    ),
  ),
);
await check(
  "anon CANNOT read newsletter subscribers",
  assertFails(getDoc(doc(anon, "newsletterSubscribers/a@example.com"))),
);
await check(
  "authed staff WITH leads module can read newsletter subscribers",
  assertSucceeds(getDoc(doc(advisorLeads, "newsletterSubscribers/a@example.com"))),
);
await check(
  "nobody can write newsletter subscribers client-side (Admin SDK only)",
  assertFails(
    setDoc(doc(advisorLeads, "newsletterSubscribers/b@example.com"), {
      email: "b@example.com",
      status: "subscribed",
    }),
  ),
);

await env.cleanup();

console.log(`\n${fail === 0 ? "✅ ALL PASSED" : "❌ FAILURES"}: ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
