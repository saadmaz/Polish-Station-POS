import "dotenv/config";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { requireEmulatorOrExplicitProduction } from "./_require-emulator";
import { buildInvoiceBookingBackfill } from "../src/lib/invoice-booking-backfill";
import type { Invoice, Booking, Service } from "../src/lib/db";

// Backfills Invoice.bookingId for every invoice written before that field
// existed, so the "Revenue Today == sum(revenue on Today's Timeline)"
// invariant holds for ALL invoices, not just ones created after the fix
// shipped. See src/lib/invoice-booking-backfill.ts for the planning logic.
//
// SAFETY: dry-run by default — reads real data, prints the report, writes
// nothing. Pass --confirm to actually create the synthetic bookings and
// patch the affected invoices. Nothing existing is deleted; invoices only
// gain one new field, and every synthetic booking is a brand-new document.
// Also refuses to run against anything but the emulator unless --production
// is passed (see _require-emulator.ts).
//
//   npx tsx scripts/migrate-invoice-bookings.ts            # preview only
//   npx tsx scripts/migrate-invoice-bookings.ts --confirm  # perform the migration

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
  merge = false,
): Promise<void> {
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const chunk = docs.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const doc of chunk) {
      batch.set(db.collection(collectionName).doc(doc.id), doc, merge ? { merge: true } : {});
    }
    await batch.commit();
  }
}

// Same scheme every other booking id uses ("B-201", ...). Computed once from
// the bookings already on file, then incremented per synthetic booking
// within this run — a live counter transaction isn't needed for a one-time
// offline backfill with no concurrent writers.
function makeSequentialBookingIdGenerator(existing: Booking[]): () => string {
  const nums = existing.map((b) => parseInt(b.id.replace("B-", ""), 10)).filter((n) => !isNaN(n));
  let next = (nums.length > 0 ? Math.max(...nums) : 200) + 1;
  return () => `B-${next++}`;
}

async function main() {
  console.log(`Project: ${process.env.FIREBASE_PROJECT_ID}`);
  console.log(
    CONFIRM ? "Mode: ⚠️  LIVE WRITE\n" : "Mode: dry-run (no changes), pass --confirm to write\n",
  );

  const [invoicesSnap, bookingsSnap, servicesSnap] = await Promise.all([
    db.collection("invoices").get(),
    db.collection("bookings").get(),
    db.collection("services").get(),
  ]);
  const invoices = invoicesSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Invoice);
  const bookings = bookingsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Booking);
  const services = servicesSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Service);

  console.log(
    `Read ${invoices.length} invoice(s), ${bookings.length} booking(s), ${services.length} service(s).\n`,
  );

  const missing = invoices.filter((i) => !i.bookingId);
  console.log(`Invoices missing bookingId: ${missing.length} of ${invoices.length}`);

  if (missing.length === 0) {
    console.log("\nNothing to backfill.");
    process.exit(0);
  }

  const { bookings: syntheticBookings, invoiceBookingIds } = buildInvoiceBookingBackfill(
    invoices,
    services,
    makeSequentialBookingIdGenerator(bookings),
  );

  console.log(`Synthetic bookings to create: ${syntheticBookings.length}`);
  console.log("Sample (first 5):");
  for (const b of syntheticBookings.slice(0, 5)) {
    console.log(`   ${b.id} · ${b.date} ${b.time} · "${b.serviceName}" · LKR ${b.price}`);
  }

  if (!CONFIRM) {
    console.log(
      "\nDry run complete. Nothing was written. Re-run with --confirm to create these bookings and patch the affected invoices.",
    );
    process.exit(0);
  }

  const invoicePatches = Object.entries(invoiceBookingIds).map(([id, bookingId]) => ({
    id,
    bookingId,
  }));

  console.log("\nWriting…");
  await writeInBatches("bookings", syntheticBookings);
  await writeInBatches("invoices", invoicePatches, /* merge */ true);
  console.log(
    `\n✅ Done: ${syntheticBookings.length} booking(s) created, ${invoicePatches.length} invoice(s) patched with bookingId.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Invoice/booking backfill failed:", err);
  process.exit(1);
});
