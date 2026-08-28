import "dotenv/config";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { requireEmulatorOrExplicitProduction } from "./_require-emulator";
import { buildBookingJobMigration } from "../src/lib/booking-job-migration";
import type { Booking, Invoice } from "../src/lib/db";
import type { JobStatus } from "../src/lib/job";

// Migrates existing Bookings into a Job/JobEvent pair per booking, mapping
// BookingStatus -> JobStatus explicitly (see src/lib/booking-job-migration.ts
// for the mapping table and the synthesized-event-chain reasoning). Booking
// itself is left completely unchanged — this only ever adds new documents.
//
// Also backfills Invoice.jobId for any invoice that already has a
// bookingId (from scripts/migrate-invoice-bookings.ts) but not yet a jobId,
// by following that booking through to the job this migration creates for
// it — the same "no invoice is left un-linked" guarantee, extended one hop
// further now that Job (not Booking) is where the dashboard reads from.
//
// SAFETY: dry-run by default — reads real data, prints the report, writes
// nothing. Pass --confirm to actually create the jobs/events and patch
// affected invoices. Also refuses to run against anything but the emulator
// unless --production is passed (see _require-emulator.ts).
//
//   npx tsx scripts/migrate-booking-jobs.ts            # preview only
//   npx tsx scripts/migrate-booking-jobs.ts --confirm  # perform the migration

const CONFIRM = process.argv.includes("--confirm");
const BATCH_SIZE = 400; // stay under Firestore's 500-write batch limit
const ACTOR = { id: "migration-script", name: "Booking/Job migration" };

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

function makeSequentialJobIdGenerator(): () => string {
  let next = 1;
  return () => `J-${next++}`;
}

async function main() {
  console.log(`Project: ${process.env.FIREBASE_PROJECT_ID}`);
  console.log(
    CONFIRM ? "Mode: ⚠️  LIVE WRITE\n" : "Mode: dry-run (no changes), pass --confirm to write\n",
  );

  const [bookingsSnap, invoicesSnap] = await Promise.all([
    db.collection("bookings").get(),
    db.collection("invoices").get(),
  ]);
  const bookings = bookingsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Booking);
  const invoices = invoicesSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Invoice);

  console.log(`Read ${bookings.length} booking(s), ${invoices.length} invoice(s).\n`);

  if (bookings.length === 0) {
    console.log("Nothing to migrate.");
    process.exit(0);
  }

  const { jobs, jobEvents, report } = buildBookingJobMigration(
    bookings,
    ACTOR,
    makeSequentialJobIdGenerator(),
  );

  console.log(`Jobs to create:       ${bookings.length}`);
  console.log(`JobEvents to create:  ${jobEvents.length}`);
  console.log("By mapped status:");
  for (const [status, count] of Object.entries(report.byMappedStatus) as [JobStatus, number][]) {
    if (count > 0) console.log(`   ${status.padEnd(12)} ${count}`);
  }

  const bookingIdToJobId = new Map(jobs.map((j) => [j.bookingId, j.id]));
  const invoicesToPatch = invoices.filter(
    (i) => !i.jobId && i.bookingId && bookingIdToJobId.has(i.bookingId),
  );
  console.log(
    `\nInvoices with bookingId but no jobId yet, now resolvable: ${invoicesToPatch.length}`,
  );

  if (!CONFIRM) {
    console.log(
      "\nDry run complete. Nothing was written. Re-run with --confirm to create these jobs/events and patch the affected invoices.",
    );
    process.exit(0);
  }

  const invoicePatches = invoicesToPatch.map((i) => ({
    id: i.id,
    jobId: bookingIdToJobId.get(i.bookingId!),
  }));

  console.log("\nWriting…");
  await writeInBatches("jobs", jobs);
  await writeInBatches("jobEvents", jobEvents);
  await writeInBatches("invoices", invoicePatches, /* merge */ true);
  console.log(
    `\n✅ Done: ${jobs.length} job(s), ${jobEvents.length} event(s) created, ${invoicePatches.length} invoice(s) patched with jobId.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Booking/Job migration failed:", err);
  process.exit(1);
});
