import "dotenv/config";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { requireEmulatorOrExplicitProduction } from "./_require-emulator";
import { parsePreferredWindowFromNotes } from "../src/lib/lead";
import type { Lead } from "../src/lib/db";

// One-off backfill for leads written before preferredWindow existed as a
// field: the site's "Preferred time" picker had nowhere to go but `notes`
// (e.g. "hii\n\nPreferred time: 8:00 AM - 11:00 AM"). This pulls that text
// out into the new preferredWindow field and leaves `notes` holding only the
// customer's actual free text.
//
// Only touches records where the embedded text matches one of the four known
// window labels EXACTLY (see PREFERRED_WINDOW_LABELS in src/lib/lead.ts) --
// anything else is left untouched and printed for manual review, never
// guessed at.
//
// SAFETY: dry-run by default — reads real data, prints the report, writes
// nothing. Pass --confirm to actually patch the affected leads. Refuses to
// run against anything but the emulator unless --production is passed (see
// _require-emulator.ts).
//
//   npx tsx scripts/migrate-lead-preferred-window.ts            # preview only
//   npx tsx scripts/migrate-lead-preferred-window.ts --confirm  # perform the migration

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

async function main() {
  console.log(`Project: ${process.env.FIREBASE_PROJECT_ID}`);
  console.log(
    CONFIRM ? "Mode: ⚠️  LIVE WRITE\n" : "Mode: dry-run (no changes), pass --confirm to write\n",
  );

  const snap = await db.collection("leads").get();
  const leads = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Lead);
  console.log(`Read ${leads.length} lead(s).\n`);

  const candidates = leads.filter((l) => !l.preferredWindow && l.notes);
  const patches: { id: string; preferredWindow: string; notes: string }[] = [];
  const needsReview: { id: string; notes: string }[] = [];

  for (const l of candidates) {
    const parsed = parsePreferredWindowFromNotes(l.notes!);
    if (parsed) {
      patches.push({ id: l.id, preferredWindow: parsed.window, notes: parsed.notes });
    } else if (/preferred time/i.test(l.notes!)) {
      // Mentions a preferred time but didn't match one of the four known
      // labels exactly -- don't guess, flag for a human instead.
      needsReview.push({ id: l.id, notes: l.notes! });
    }
  }

  console.log(`Leads to backfill (unambiguous match): ${patches.length}`);
  for (const p of patches.slice(0, 10)) {
    console.log(`   ${p.id} -> ${p.preferredWindow} · notes now: "${p.notes}"`);
  }

  if (needsReview.length > 0) {
    console.log(`\n⚠️  Needs manual review (mentions a time but doesn't match cleanly): ${needsReview.length}`);
    for (const r of needsReview) {
      console.log(`   ${r.id} · notes: "${r.notes}"`);
    }
  }

  if (patches.length === 0) {
    console.log("\nNothing to backfill.");
    process.exit(0);
  }

  if (!CONFIRM) {
    console.log("\nDry run complete. Nothing was written. Re-run with --confirm to patch these leads.");
    process.exit(0);
  }

  console.log("\nWriting…");
  for (let i = 0; i < patches.length; i += BATCH_SIZE) {
    const chunk = patches.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const p of chunk) {
      batch.set(
        db.collection("leads").doc(p.id),
        { preferredWindow: p.preferredWindow, notes: p.notes },
        { merge: true },
      );
    }
    await batch.commit();
  }
  console.log(`\n✅ Done: ${patches.length} lead(s) backfilled with preferredWindow.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Lead preferredWindow backfill failed:", err);
  process.exit(1);
});
