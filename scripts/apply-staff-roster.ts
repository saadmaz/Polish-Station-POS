import "dotenv/config";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import bcrypt from "bcryptjs";
import { ALL_MODULES } from "../src/lib/permissions";
import { usernameKey, toStaffEmail, toStaffPassword } from "../src/lib/staff-auth";
import { requireEmulatorOrExplicitProduction } from "./_require-emulator";

// One-off: renames the 7 existing staff accounts to the Name_Format username
// scheme and issues the exact requested temp PINs, and creates 2 brand-new
// SuperAdmin accounts (Hamra Shamil, Ayesha Kumuduni). All 9 get
// mustChangePin: true, matching the "issued PIN, changed on next login"
// pattern already used by migrate-staff-auth.ts.

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

interface RosterEntry {
  name: string;
  username: string;
  pin: string;
  oldUsername?: string; // absent = brand-new account
}

const ROSTER: RosterEntry[] = [
  { name: "Super Admin", username: "Super_Admin", pin: "0011", oldUsername: "ADMIN" },
  { name: "Saad Mazhar", username: "Saad_Mazhar", pin: "9911", oldUsername: "saad" },
  { name: "Thalal Izzath", username: "Thalal_Izzath", pin: "9911", oldUsername: "thalal" },
  { name: "Salman Zumri", username: "Salman_Zumri", pin: "9911", oldUsername: "salman" },
  { name: "Ismail Hashim", username: "Ismail_Hashim", pin: "9911", oldUsername: "ismail" },
  { name: "Ibrahim Ifham", username: "Ibrahim_Ifham", pin: "9911", oldUsername: "ibrahim" },
  { name: "Mijwadh Ali", username: "Mijwadh_Ali", pin: "9911", oldUsername: "mijwadh" },
  { name: "Hamra Shamil", username: "Hamra_Shamil", pin: "0099" },
  { name: "Ayesha Kumuduni", username: "Ayesha_Kumuduni", pin: "0099" },
];

const NEW_ACCOUNT_COLOR = "oklch(0.55 0.21 27)";

async function renameExisting(entry: RosterEntry & { oldUsername: string }) {
  const oldKey = usernameKey(entry.oldUsername);
  const newKey = usernameKey(entry.username);

  const idxSnap = await adminDb.collection("usernames").doc(oldKey).get();
  if (!idxSnap.exists) {
    console.error(`❌ ${entry.oldUsername}: no usernames/${oldKey} index doc found, skipping`);
    return;
  }
  const staffId = idxSnap.data()!.staffId as string;

  const staffSnap = await adminDb.collection("staff").doc(staffId).get();
  if (!staffSnap.exists) {
    console.error(`❌ ${entry.oldUsername}: staff/${staffId} missing, skipping`);
    return;
  }
  const staff = staffSnap.data()!;
  const role = staff.role;
  const perms = Array.isArray(staff.permissions) ? staff.permissions : [];
  const pinHash = await bcrypt.hash(entry.pin, 10);

  const batch = adminDb.batch();
  batch.delete(adminDb.collection("usernames").doc(oldKey));
  batch.create(adminDb.collection("usernames").doc(newKey), { staffId });
  batch.update(adminDb.collection("staff").doc(staffId), {
    username: entry.username,
    name: entry.name,
    pinHash,
    mustChangePin: true,
    failCount: 0,
    lockedUntil: null,
  });
  batch.update(adminDb.collection("staff_public").doc(staffId), {
    username: entry.username,
    name: entry.name,
  });
  await batch.commit();

  await adminAuth.updateUser(staffId, {
    email: toStaffEmail(entry.username),
    password: toStaffPassword(entry.pin),
    disabled: false,
  });
  await adminAuth.setCustomUserClaims(staffId, {
    role,
    perms,
    name: entry.name,
    mustChangePin: true,
  });

  console.log(`✅ renamed ${entry.oldUsername} -> ${entry.username}`);
}

async function createNew(entry: RosterEntry) {
  const newKey = usernameKey(entry.username);
  const staffId = adminDb.collection("staff").doc().id;
  const pinHash = await bcrypt.hash(entry.pin, 10);
  const perms = [...ALL_MODULES];

  const batch = adminDb.batch();
  batch.create(adminDb.collection("usernames").doc(newKey), { staffId });
  batch.set(adminDb.collection("staff").doc(staffId), {
    username: entry.username,
    name: entry.name,
    role: "SuperAdmin",
    color: NEW_ACCOUNT_COLOR,
    permissions: perms,
    pinHash,
    active: true,
    mustChangePin: true,
    failCount: 0,
    lockedUntil: null,
  });
  batch.set(adminDb.collection("staff_public").doc(staffId), {
    username: entry.username,
    name: entry.name,
    role: "SuperAdmin",
    color: NEW_ACCOUNT_COLOR,
    active: true,
  });
  await batch.commit();

  await adminAuth.createUser({
    uid: staffId,
    email: toStaffEmail(entry.username),
    password: toStaffPassword(entry.pin),
    disabled: false,
  });
  await adminAuth.setCustomUserClaims(staffId, {
    role: "SuperAdmin",
    perms,
    name: entry.name,
    mustChangePin: true,
  });

  console.log(`✅ created ${entry.username} (SuperAdmin)`);
}

async function main() {
  for (const entry of ROSTER) {
    try {
      if (entry.oldUsername) {
        await renameExisting(entry as RosterEntry & { oldUsername: string });
      } else {
        await createNew(entry);
      }
    } catch (err) {
      console.error(`❌ ${entry.username} failed:`, err);
    }
  }

  console.log("\nCredentials (each forces a PIN change on next login):\n");
  console.log("Name".padEnd(20), "Username".padEnd(18), "PIN");
  for (const e of ROSTER) {
    console.log(e.name.padEnd(20), e.username.padEnd(18), e.pin);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Roster apply failed:", err);
  process.exit(1);
});
