import "dotenv/config";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { randomUUID } from "node:crypto";
import { buildInspectionReportDoc } from "../src/lib/pdf";
import { latestNonSupersededInspection, type Inspection } from "../src/lib/inspection";
import type { Job } from "../src/lib/job";
import { requireEmulatorOrExplicitProduction } from "./_require-emulator";

// One-off: re-renders an already-signed inspection's report PDF with the
// current pdf.ts layout (e.g. after a layout change like the 2026-09-18
// length/signature-section trim) and republishes it as a new version --
// without touching any of the inspection's actual data, and without going
// through the normal client-side sign-off flow (which can't run here, and
// which firestore.rules wouldn't allow anyway: a "signed" inspection is
// immutable to every client write except the one sanctioned move to
// "superseded"). Runs entirely under the Admin SDK, which bypasses
// firestore.rules/storage.rules by design -- this is a deliberate,
// operator-requested exception to that immutability for republishing the
// PDF artifact only, never the recorded data.
//
// Usage: npx tsx scripts/regenerate-inspection-report.ts J-1046 --production

requireEmulatorOrExplicitProduction();

if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  });
}

const adminDb = getFirestore();
const bucket = getStorage().bucket();

async function main() {
  const jobId = process.argv[2];
  if (!jobId) {
    console.error("Usage: npx tsx scripts/regenerate-inspection-report.ts <jobId> [--production]");
    process.exit(1);
  }

  const snap = await adminDb.collection("inspections").where("jobId", "==", jobId).get();
  if (snap.empty) {
    console.error(`No inspections found for job ${jobId}`);
    process.exit(1);
  }
  const inspections = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Inspection);
  const inspection = latestNonSupersededInspection(inspections, jobId);
  if (!inspection) {
    console.error(`Every inspection for job ${jobId} is superseded -- nothing current to render`);
    process.exit(1);
  }
  console.log(
    `Found inspection ${inspection.id} (status: ${inspection.status}, current report version: ${
      inspection.documents?.report?.version ?? "none"
    })`,
  );

  const jobSnap = await adminDb.collection("jobs").doc(jobId).get();
  if (!jobSnap.exists) {
    console.error(`Job ${jobId} not found -- the Quote section needs it for service/price`);
    process.exit(1);
  }
  const job = jobSnap.data() as Job;

  const { doc, version } = await buildInspectionReportDoc(inspection, job);
  console.log(`Built report v${version}, ${doc.getNumberOfPages()} page(s)`);

  const storagePath = `jobs/${inspection.jobId}/documents/inspection-${inspection.id}-v${version}.pdf`;
  const buffer = Buffer.from(doc.output("arraybuffer"));
  // Mirrors the client SDK's getDownloadURL() format exactly (a download
  // token in file metadata, referenced in the URL) so this URL works
  // identically to one the app itself would have produced.
  const token = randomUUID();
  const file = bucket.file(storagePath);
  await file.save(buffer, {
    contentType: "application/pdf",
    metadata: { metadata: { firebaseStorageDownloadTokens: token } },
  });
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`;

  const generatedAt = new Date().toISOString();
  await adminDb
    .collection("inspections")
    .doc(inspection.id)
    .update({ "documents.report": { url, storagePath, version, generatedAt } });

  console.log(`\n✅ Report v${version} uploaded and Firestore updated.`);
  console.log(url);
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
