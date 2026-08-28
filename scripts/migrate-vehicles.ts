import "dotenv/config";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { requireEmulatorOrExplicitProduction } from "./_require-emulator";
import { buildVehicleMigration } from "../src/lib/vehicle-migration";
import type { Customer, Booking } from "../src/lib/db";

// Backfills the `vehicles` / `plates` / `vehicleOwnerships` collections from
// the legacy Customer.vehicles[] embedded array and Booking.plate/
// vehicleModel free-text fields. See src/lib/vehicle-migration.ts for the
// planning logic this just wraps with real Firestore reads/writes.
//
// SAFETY: dry-run by default — reads real data, prints the full report,
// writes nothing. Pass --confirm to actually create the documents. Nothing
// existing is deleted or overwritten: this only ever creates new documents
// in the three new collections. Also refuses to run against anything but
// the emulator unless --production is passed (see _require-emulator.ts).
//
//   npx tsx scripts/migrate-vehicles.ts            # preview only
//   npx tsx scripts/migrate-vehicles.ts --confirm  # perform the migration

const CONFIRM = process.argv.includes("--confirm");
const BATCH_SIZE = 400; // stay under Firestore's 500-write batch limit

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

const db = getFirestore();

async function writeInBatches<T extends { id: string }>(
  collectionName: string,
  docs: T[],
): Promise<void> {
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const chunk = docs.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const doc of chunk) {
      batch.set(db.collection(collectionName).doc(doc.id), doc);
    }
    await batch.commit();
  }
}

async function main() {
  console.log(`Project: ${process.env.FIREBASE_PROJECT_ID}`);
  console.log(
    CONFIRM ? "Mode: ⚠️  LIVE WRITE\n" : "Mode: dry-run (no changes), pass --confirm to write\n",
  );

  const [customersSnap, bookingsSnap] = await Promise.all([
    db.collection("customers").get(),
    db.collection("bookings").get(),
  ]);
  const customers = customersSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Customer);
  const bookings = bookingsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Booking);

  console.log(`Read ${customers.length} customer(s), ${bookings.length} booking(s).\n`);

  const { vehicles, ownerships, plateIndex, report } = buildVehicleMigration(customers, bookings);

  console.log(`Vehicles to create:    ${report.vehiclesCreated}`);
  console.log(`Plate index entries:   ${Object.keys(plateIndex).length}`);
  console.log(`Ownerships to create:  ${report.ownershipsCreated}`);
  console.log(`Plate collisions:      ${report.collisions.length}`);
  console.log(`No usable plate:       ${report.noUsablePlate.length}`);
  console.log(`Low-confidence parses: ${report.lowConfidenceParses.length}`);

  if (report.collisions.length > 0) {
    console.log(
      "\n⚠️  Plate collisions (same plate claimed by different customers — review before trusting ownership):",
    );
    for (const c of report.collisions) {
      console.log(`   ${c.plate}:`);
      for (const s of c.sources) {
        console.log(
          `     - ${s.origin} · customer=${s.customerId ?? "(none)"} "${s.customerName}"`,
        );
      }
    }
  }

  if (report.noUsablePlate.length > 0) {
    console.log("\n⚠️  Records with no usable plate (no Vehicle can be created for these):");
    for (const s of report.noUsablePlate.slice(0, 20)) {
      console.log(`   - ${s.origin} · customer=${s.customerId ?? "(none)"} "${s.customerName}"`);
    }
    if (report.noUsablePlate.length > 20) {
      console.log(`   ... and ${report.noUsablePlate.length - 20} more`);
    }
  }

  if (report.lowConfidenceParses.length > 0) {
    console.log("\n⚠️  Low-confidence make/model parses (defaulted, needs a human look):");
    for (const p of report.lowConfidenceParses.slice(0, 20)) {
      console.log(`   - ${p.plate}: "${p.raw}"`);
    }
    if (report.lowConfidenceParses.length > 20) {
      console.log(`   ... and ${report.lowConfidenceParses.length - 20} more`);
    }
  }

  console.log(
    `\nEvery migrated vehicle defaults to sizeClass:"other" with needsSizeClassReview:true — there is no historical signal for size class anywhere in the existing data.`,
  );

  if (!CONFIRM) {
    console.log(
      "\nDry run complete. Nothing was written. Re-run with --confirm to create these documents.",
    );
    process.exit(0);
  }

  const plateDocs = Object.entries(plateIndex).map(([plate, entry]) => ({ id: plate, ...entry }));

  console.log("\nWriting…");
  await writeInBatches("vehicles", vehicles);
  await writeInBatches("plates", plateDocs);
  await writeInBatches("vehicleOwnerships", ownerships);
  console.log(
    `\n✅ Done: ${vehicles.length} vehicle(s), ${plateDocs.length} plate index entr${plateDocs.length === 1 ? "y" : "ies"}, ${ownerships.length} ownership(s) written.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Vehicle migration failed:", err);
  process.exit(1);
});
