import "dotenv/config";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import bcrypt from "bcryptjs";
import { ALL_MODULES } from "../src/lib/permissions";

// Bootstraps the one account the whole system starts from: the super admin.
// Idempotent — safe to run repeatedly. It never overwrites an existing PIN, so
// re-running after the admin has changed their PIN will not reset it.
//
//   SUPERADMIN_PIN=0011  (exactly 4 digits, from .env — never hardcoded)
//
// Username is fixed to ADMIN; change SUPERADMIN_USERNAME to override.

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

const STAFF_ID = "superadmin";
const USERNAME = (process.env.SUPERADMIN_USERNAME ?? "ADMIN").trim();
const PIN = process.env.SUPERADMIN_PIN;
const COLOR = "oklch(0.55 0.21 27)";

async function main() {
  if (!PIN || !/^\d{4}$/.test(PIN)) {
    console.error("❌ SUPERADMIN_PIN must be set to exactly 4 digits in your .env");
    process.exit(1);
  }
  if (!/^[A-Za-z0-9_.-]{3,20}$/.test(USERNAME)) {
    console.error("❌ SUPERADMIN_USERNAME must be 3–20 chars: letters, digits, . _ -");
    process.exit(1);
  }

  const usernameKey = USERNAME.toLowerCase();
  const staffRef = adminDb.collection("staff").doc(STAFF_ID);
  const existing = await staffRef.get();

  // Preserve an already-changed PIN and the mustChangePin flag on re-run.
  const pinHash = existing.exists ? existing.data()!.pinHash : await bcrypt.hash(PIN, 12);
  const mustChangePin = existing.exists ? (existing.data()!.mustChangePin ?? false) : true;

  const batch = adminDb.batch();

  batch.set(
    staffRef,
    {
      username: USERNAME,
      name: "Super Admin",
      role: "SuperAdmin",
      color: COLOR,
      permissions: [...ALL_MODULES],
      pinHash,
      active: true,
      mustChangePin,
      failCount: 0,
      lockedUntil: null,
    },
    { merge: true },
  );

  batch.set(
    adminDb.collection("staff_public").doc(STAFF_ID),
    {
      username: USERNAME,
      name: "Super Admin",
      role: "SuperAdmin",
      color: COLOR,
      active: true,
    },
    { merge: true },
  );

  batch.set(adminDb.collection("usernames").doc(usernameKey), { staffId: STAFF_ID });

  await batch.commit();

  console.log("✅ Super admin ready");
  console.log(`   Username : ${USERNAME}`);
  console.log(`   PIN      : ${existing.exists ? "(unchanged — already seeded)" : PIN}`);
  console.log(`   Role     : SuperAdmin`);
  if (mustChangePin) console.log("   Note     : must change PIN on first login");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
