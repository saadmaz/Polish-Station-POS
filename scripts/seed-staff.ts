import "dotenv/config";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import bcrypt from "bcryptjs";

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

// PINs come from .env so they are never stored in source code.
// Add STAFF_PIN_s1 through STAFF_PIN_s9 to your .env before running.
const STAFF = [
  { id: "s1", name: "Thalal", role: "Admin", color: "oklch(0.55 0.21 27)", pinVar: "STAFF_PIN_s1" },
  {
    id: "s2",
    name: "Ismail",
    role: "Manager",
    color: "oklch(0.60 0.13 240)",
    pinVar: "STAFF_PIN_s2",
  },
  {
    id: "s3",
    name: "Salman",
    role: "Advisor",
    color: "oklch(0.65 0.16 145)",
    pinVar: "STAFF_PIN_s3",
  },
  {
    id: "s4",
    name: "Mijwadh",
    role: "Cashier",
    color: "oklch(0.78 0.15 75)",
    pinVar: "STAFF_PIN_s4",
  },
  {
    id: "s5",
    name: "Ayesha",
    role: "Cashier",
    color: "oklch(0.65 0.14 320)",
    pinVar: "STAFF_PIN_s5",
  },
  {
    id: "s6",
    name: "Saad",
    role: "Technician",
    color: "oklch(0.45 0.20 20)",
    pinVar: "STAFF_PIN_s6",
  },
  {
    id: "s7",
    name: "Ibrahim",
    role: "Technician",
    color: "oklch(0.60 0.15 280)",
    pinVar: "STAFF_PIN_s7",
  },
  {
    id: "s8",
    name: "Abdullah",
    role: "Technician",
    color: "oklch(0.55 0.15 190)",
    pinVar: "STAFF_PIN_s8",
  },
  {
    id: "s9",
    name: "Abbas",
    role: "Technician",
    color: "oklch(0.50 0.18 30)",
    pinVar: "STAFF_PIN_s9",
  },
];

async function main() {
  // Validate all PIN env vars are present and correctly formatted
  const errors: string[] = [];
  for (const s of STAFF) {
    const pin = process.env[s.pinVar];
    if (!pin) errors.push(`${s.pinVar} is not set`);
    else if (!/^\d{4}$/.test(pin)) errors.push(`${s.pinVar} must be exactly 4 digits`);
  }
  if (errors.length > 0) {
    console.error("❌ Validation failed:");
    errors.forEach((e) => console.error("   •", e));
    console.error("\nAdd these to your .env file and try again.");
    process.exit(1);
  }

  console.log("Seeding staff to Firestore...\n");

  for (const s of STAFF) {
    const pin = process.env[s.pinVar]!;
    const pinHash = await bcrypt.hash(pin, 12);

    // Private record — contains pinHash. Readable only by the staff member or Manager+.
    // Written by Admin SDK only (client write is denied in Firestore rules).
    await adminDb.collection("staff").doc(s.id).set({
      name: s.name,
      role: s.role,
      color: s.color,
      pinHash,
      active: true,
      failCount: 0,
      lockedUntil: null,
    });

    // Public record — name, role, color only. Used by the login screen before auth.
    await adminDb.collection("staff_public").doc(s.id).set({
      name: s.name,
      role: s.role,
      color: s.color,
    });

    console.log(`✅  ${s.name.padEnd(12)} ${s.role}`);
  }

  console.log("\nDone — staff seeded successfully.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
