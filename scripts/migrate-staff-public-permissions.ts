import "dotenv/config";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { requireEmulatorOrExplicitProduction } from "./_require-emulator";
import { sanitizePermissions } from "../src/lib/permissions";

// Backfills `permissions` onto every existing staff_public/{id} doc, copying
// from the corresponding private staff/{id} doc. createStaffFn/updateStaffFn
// (src/server/staff.ts) now write `permissions` to staff_public going
// forward -- this exists only for accounts created/last-edited before that
// change, so access-panel.tsx's Staff & Access list (which reads
// staff_public, not the owner-only-readable staff collection -- see Finding
// 1 in the Firestore rules audit) shows correct permissions for everyone,
// not just staff touched since this shipped.
//
// Safe to run more than once: always writes the current staff/{id}
// permissions, so a re-run just re-syncs anything that's drifted.
//
//   npx tsx scripts/migrate-staff-public-permissions.ts            # preview only
//   npx tsx scripts/migrate-staff-public-permissions.ts --confirm  # write

const CONFIRM = process.argv.includes("--confirm");

requireEmulatorOrExplicitProduction();

if (getApps().length === 0) {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !privateKey) {
    console.error(
      "Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY in .env",
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

async function main() {
  const snap = await adminDb.collection("staff").get();
  if (snap.empty) {
    console.log("No staff accounts found.");
    process.exit(0);
  }

  console.log(`Found ${snap.size} staff account(s).\n`);

  let batch = adminDb.batch();
  let pending = 0;
  let changed = 0;

  for (const doc of snap.docs) {
    const staffId = doc.id;
    const permissions = sanitizePermissions(doc.data().permissions);
    const publicSnap = await adminDb.collection("staff_public").doc(staffId).get();
    if (!publicSnap.exists) {
      console.log(`⚠️  ${staffId}: no staff_public doc — skipping (orphaned staff doc?)`);
      continue;
    }
    const currentPublic = sanitizePermissions(publicSnap.data()?.permissions);
    const same =
      currentPublic.length === permissions.length &&
      currentPublic.every((p) => permissions.includes(p));
    if (same) continue;

    changed++;
    console.log(
      `${CONFIRM ? "Updating" : "Would update"} ${staffId}: [${currentPublic.join(",")}] -> [${permissions.join(",")}]`,
    );
    if (CONFIRM) {
      batch.update(adminDb.collection("staff_public").doc(staffId), { permissions });
      pending++;
      if (pending >= 400) {
        await batch.commit();
        batch = adminDb.batch();
        pending = 0;
      }
    }
  }

  if (CONFIRM && pending > 0) await batch.commit();

  console.log(
    `\n${changed} account(s) ${CONFIRM ? "updated" : "would be updated"}.` +
      (CONFIRM ? "" : " Re-run with --confirm to write."),
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
