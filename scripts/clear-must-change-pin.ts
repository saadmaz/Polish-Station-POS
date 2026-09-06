import "dotenv/config";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { usernameKey } from "../src/lib/staff-auth";
import { requireEmulatorOrExplicitProduction } from "./_require-emulator";

// One-off: clears mustChangePin on the current roster so the PINs already
// set (via apply-staff-roster.ts) are the permanent working credential --
// no forced change screen on first login.

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
const adminAuth = getAuth();

const USERNAMES = [
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
  for (const username of USERNAMES) {
    const idxSnap = await adminDb.collection("usernames").doc(usernameKey(username)).get();
    if (!idxSnap.exists) {
      console.error(`❌ ${username}: no usernames index doc found, skipping`);
      continue;
    }
    const staffId = idxSnap.data()!.staffId as string;

    const staffSnap = await adminDb.collection("staff").doc(staffId).get();
    if (!staffSnap.exists) {
      console.error(`❌ ${username}: staff/${staffId} missing, skipping`);
      continue;
    }
    const staff = staffSnap.data()!;

    await adminDb.collection("staff").doc(staffId).update({ mustChangePin: false });
    await adminAuth.setCustomUserClaims(staffId, {
      role: staff.role,
      perms: Array.isArray(staff.permissions) ? staff.permissions : [],
      name: staff.name,
      mustChangePin: false,
    });
    // Picks up the fresh claim immediately for anyone already mid-session.
    await adminAuth.revokeRefreshTokens(staffId).catch(() => {});

    console.log(`✅ ${username}: mustChangePin cleared`);
  }

  console.log("\nDone. Everyone's current PIN is now permanent -- no forced change on login.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
