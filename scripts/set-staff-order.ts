import "dotenv/config";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { usernameKey } from "../src/lib/staff-auth";
import { requireEmulatorOrExplicitProduction } from "./_require-emulator";

// One-off: sets the `order` field on staff_public docs so the login picker
// renders in the exact sequence requested, instead of Firestore's arbitrary
// doc order. See `order` in src/lib/use-staff-list.ts.

requireEmulatorOrExplicitProduction();

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

const ORDERED_USERNAMES = [
  "Super_Admin",
  "Saad_Mazhar",
  "Thalal_Izzath",
  "Salman_Zumri",
  "Ismail_Hashim",
  "Ibrahim_Ifham",
  "Mijwadh_Ali",
  "Hamra_Shamil",
  "Ayesha_Kumuduni",
];

async function main() {
  const batch = adminDb.batch();

  for (let i = 0; i < ORDERED_USERNAMES.length; i++) {
    const username = ORDERED_USERNAMES[i];
    const idxSnap = await adminDb.collection("usernames").doc(usernameKey(username)).get();
    if (!idxSnap.exists) {
      console.error(`❌ ${username}: no usernames index doc found, skipping`);
      continue;
    }
    const staffId = idxSnap.data()!.staffId as string;
    batch.update(adminDb.collection("staff_public").doc(staffId), { order: i });
    console.log(`✅ ${username} -> order ${i}`);
  }

  await batch.commit();
  console.log("\nDone.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
