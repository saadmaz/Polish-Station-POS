// Seeds the Firebase emulator (never the real project) with the minimum
// fixture Playwright's e2e specs need: one login-able staff account and a
// couple of bookable services. Run only against FIRESTORE_EMULATOR_HOST /
// FIREBASE_AUTH_EMULATOR_HOST — refuses to run otherwise, so this can never
// accidentally seed test data into the live production Firestore project.
//
//   firebase emulators:exec --only firestore,auth "node scripts/seed-emulator.mjs && node ..."
//
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import bcrypt from "bcryptjs";
import { pathToFileURL } from "node:url";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("❌ FIRESTORE_EMULATOR_HOST is not set — refusing to run against a real project.");
  process.exit(1);
}

if (getApps().length === 0) {
  initializeApp({ projectId: "demo-pos-polishstation" });
}

const db = getFirestore();

export const TEST_STAFF = { username: "e2e_admin", pin: "4242", staffId: "e2e-admin" };
export const TEST_SERVICES = [
  { id: "svc-e2e-1", name: "Express Wash", category: "Exterior", durationMin: 30, price: 1500 },
  { id: "svc-e2e-2", name: "Full Detail", category: "Full Detail", durationMin: 180, price: 12000 },
];

async function main() {
  const batch = db.batch();

  const pinHash = await bcrypt.hash(TEST_STAFF.pin, 10);
  batch.set(db.collection("staff").doc(TEST_STAFF.staffId), {
    username: TEST_STAFF.username,
    name: "E2E Admin",
    role: "SuperAdmin",
    color: "oklch(0.55 0.21 27)",
    permissions: [
      "dashboard",
      "bookings",
      "jobs",
      "bay-board",
      "customers",
      "inventory",
      "equipment",
      "purchase-orders",
      "notifications",
      "pos",
      "staff",
      "reports",
      "settings",
    ],
    pinHash,
    active: true,
    mustChangePin: false,
    failCount: 0,
    lockedUntil: null,
  });
  batch.set(db.collection("staff_public").doc(TEST_STAFF.staffId), {
    username: TEST_STAFF.username,
    name: "E2E Admin",
    role: "SuperAdmin",
    color: "oklch(0.55 0.21 27)",
    active: true,
  });
  batch.set(db.collection("usernames").doc(TEST_STAFF.username.toLowerCase()), {
    staffId: TEST_STAFF.staffId,
  });

  for (const s of TEST_SERVICES) {
    const { id, ...data } = s;
    batch.set(db.collection("services").doc(id), data);
  }

  await batch.commit();
  console.log(
    "✅ Emulator seeded:",
    TEST_STAFF.username,
    "/",
    TEST_STAFF.pin,
    "+",
    TEST_SERVICES.length,
    "services",
  );
}

// Guarded: the e2e specs import TEST_STAFF/TEST_SERVICES from this module
// for their own fixtures — without this check, every one of those imports
// would re-run the seed (harmless since it's idempotent, but noisy and slow).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
}
