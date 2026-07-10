import "dotenv/config";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Deactivates the original seeded staff (s1..s9) so only the super admin can
// sign in, per the migration decision. Deactivation is deliberate rather than
// deletion: it is reversible, and it keeps the staff docs so historical jobs
// (which reference technicians by name) stay readable. Their username index
// entries are removed so the names are freed for reuse.
//
// After this runs, the super admin recreates real users from Settings.

if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const adminDb = getFirestore();
const IDS = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9"];

async function main() {
  let touched = 0;

  for (const id of IDS) {
    const ref = adminDb.collection("staff").doc(id);
    const snap = await ref.get();
    if (!snap.exists) continue;

    const batch = adminDb.batch();
    batch.update(ref, { active: false, failCount: 0, lockedUntil: null });
    batch.set(adminDb.collection("staff_public").doc(id), { active: false }, { merge: true });

    // Free any username this staff member claimed (older seeds may not have one).
    const username = snap.data()!.username;
    if (typeof username === "string" && username) {
      batch.delete(adminDb.collection("usernames").doc(username.toLowerCase()));
    }

    await batch.commit();
    console.log(`⏸️  deactivated ${id} (${snap.data()!.name ?? "?"})`);
    touched++;
  }

  console.log(`\nDone — ${touched} staff deactivated. Recreate real users from Settings.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Reset failed:", err);
  process.exit(1);
});
