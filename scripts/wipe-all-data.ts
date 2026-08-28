import "dotenv/config";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Deletes every document in every collection this app uses: a full reset
// before loading real data. Unlike purge-staff.ts, this does NOT preserve
// any SuperAdmin account: after a --confirm run, nobody can log in until
// `npm run seed:admin` is run again.
//
// SAFETY: dry-run by default. It counts what WOULD be deleted and changes
// nothing. Pass --confirm to actually delete.
//
//   npx tsx scripts/wipe-all-data.ts            # preview only
//   npx tsx scripts/wipe-all-data.ts --confirm  # perform the deletion

const CONFIRM = process.argv.includes("--confirm");

// Every top-level collection declared in firestore.rules.
const COLLECTIONS = [
  "staff",
  "staff_public",
  "usernames",
  "audit",
  "counters",
  "settings",
  "invoices",
  "shifts",
  "expenses",
  "bookings",
  "customers",
  "coupons",
  "services",
  "inventory",
  "equipment",
  "maintenanceLogs",
  "purchaseOrders",
  "sentNotifications",
  "rotaShifts",
];

const BATCH_SIZE = 400; // stay under Firestore's 500-write batch limit

if (getApps().length === 0) {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !privateKey) {
    console.error(
      "❌ Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY in .env",
    );
    process.exit(1);
  }
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
  });
}

const adminDb = getFirestore();

async function deleteCollection(name: string): Promise<number> {
  let total = 0;
  for (;;) {
    const snap = await adminDb.collection(name).limit(BATCH_SIZE).get();
    if (snap.empty) break;
    const batch = adminDb.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    total += snap.size;
    if (snap.size < BATCH_SIZE) break;
  }
  return total;
}

async function main() {
  console.log(`Project: ${process.env.FIREBASE_PROJECT_ID}`);
  console.log(
    CONFIRM
      ? "Mode: ⚠️  LIVE DELETE, every collection below will be wiped\n"
      : "Mode: dry-run (no changes), pass --confirm to delete\n",
  );

  const counts: Record<string, number> = {};
  for (const name of COLLECTIONS) {
    const snap = await adminDb.collection(name).count().get();
    counts[name] = snap.data().count;
  }

  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  for (const name of COLLECTIONS) {
    console.log(`   ${CONFIRM ? "🗑️ " : "  "} ${name.padEnd(18)} ${counts[name]} doc(s)`);
  }
  console.log(`\nTotal: ${total} document(s) across ${COLLECTIONS.length} collections`);

  if (total === 0) {
    console.log("\nNothing to delete, every collection is already empty.");
    process.exit(0);
  }

  if (!CONFIRM) {
    console.log("\nDry run complete. Re-run with --confirm to delete everything listed above.");
    process.exit(0);
  }

  console.log("\nDeleting…");
  let deletedTotal = 0;
  for (const name of COLLECTIONS) {
    if (counts[name] === 0) continue;
    const deleted = await deleteCollection(name);
    deletedTotal += deleted;
    console.log(`   ✅ ${name}: deleted ${deleted}`);
  }

  console.log(
    `\n✅ Done: ${deletedTotal} document(s) deleted across ${COLLECTIONS.length} collections.`,
  );
  console.log("   No staff accounts remain, run `npm run seed:admin` before logging in again.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Wipe failed:", err);
  process.exit(1);
});
