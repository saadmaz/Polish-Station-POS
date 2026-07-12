import "dotenv/config";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Reads the progress markers diagFn wrote. The LAST marker is the step the
// server function died on. Also cleans up the _diag collection with --clean.

if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}
const db = getFirestore();

async function main() {
  const snap = await db.collection("_diag").get();
  const runs = snap.docs
    .filter((d) => Array.isArray(d.data().steps))
    .sort((a, b) => (a.data().at ?? 0) - (b.data().at ?? 0));

  if (!runs.length) {
    console.log("no diag runs recorded");
  }
  for (const d of runs) {
    const steps: string[] = d.data().steps;
    console.log(`\n--- ${d.id} (${steps.length} steps) ---`);
    let prev = 0;
    for (const s of steps) {
      const [label, ts] = s.split(" @");
      const t = Number(ts);
      const delta = prev ? t - prev : 0;
      console.log(`  ${prev ? `+${String(delta).padStart(6)}ms` : "       start"}  ${label}`);
      prev = t;
    }
    const last = steps[steps.length - 1];
    if (!last.startsWith("09_DONE")) {
      console.log(`  ⛔ HUNG AFTER: ${last.split(" @")[0]}`);
    }
  }

  if (process.argv.includes("--clean")) {
    const all = await db.collection("_diag").get();
    for (const d of all.docs) await d.ref.delete();
    console.log(`\ncleaned ${all.size} _diag docs`);
  }
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
