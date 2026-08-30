import "dotenv/config";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import bcrypt from "bcryptjs";
import { toStaffEmail, toStaffPassword } from "../src/lib/staff-auth";
import { sanitizePermissions, type StaffRole } from "../src/lib/permissions";
import { requireEmulatorOrExplicitProduction } from "./_require-emulator";

// One-off migration: moves every active staff account from the old
// custom-token login (bcrypt PIN compare + adminAuth.createCustomToken on
// every login, which required the shared-hosting Node server to be up) to a
// real Firebase Auth email+password account that signs in directly from the
// browser. Existing PINs are bcrypt-hashed and cannot be recovered, so this
// issues each account a new random PIN, prints it once, and forces a change
// on next login via the existing /change-pin screen.
//
// Safe to run more than once: an account already migrated (mustChangePin
// already true, password already set) just gets a fresh temporary PIN.

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

function randomPin(): string {
  return String(Math.floor(Math.random() * 10000)).padStart(4, "0");
}

async function main() {
  const snap = await adminDb.collection("staff").where("active", "==", true).get();

  if (snap.empty) {
    console.log("No active staff accounts found.");
    process.exit(0);
  }

  console.log(`Migrating ${snap.size} active staff account(s)...\n`);

  const results: { username: string; pin: string }[] = [];

  for (const doc of snap.docs) {
    const staffId = doc.id;
    const data = doc.data();
    const username = data.username as string;
    const role = data.role as StaffRole;
    const name = data.name as string;
    const perms = sanitizePermissions(data.permissions);
    const pin = randomPin();

    await doc.ref.update({
      pinHash: await bcrypt.hash(pin, 10),
      mustChangePin: true,
      failCount: 0,
      lockedUntil: null,
    });

    const email = toStaffEmail(username);
    const password = toStaffPassword(pin);
    try {
      await adminAuth.updateUser(staffId, { email, password, disabled: false });
    } catch (err) {
      if ((err as { code?: string }).code === "auth/user-not-found") {
        await adminAuth.createUser({ uid: staffId, email, password, disabled: false });
      } else {
        throw err;
      }
    }
    await adminAuth.setCustomUserClaims(staffId, { role, perms, name, mustChangePin: true });

    results.push({ username, pin });
    console.log(`✅  ${username.padEnd(16)} provisioned`);
  }

  console.log("\nTemporary PINs (each must be changed on first login):\n");
  for (const r of results) {
    console.log(`   ${r.username.padEnd(16)} ${r.pin}`);
  }
  console.log("\nDone. Hand these out and have each person log in once to set a permanent PIN.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
