import "dotenv/config";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

// Deletes EVERY staff account that is not a SuperAdmin, leaving only the super
// admin(s). Unlike reset-staff.ts (which only deactivates the legacy s1..s9),
// this is a hard delete: it removes the private staff doc, the public roster
// doc, and the username index entry, then revokes any live session.
//
// SAFETY: dry-run by default — it lists exactly who WOULD be deleted and
// changes nothing. Pass --confirm to actually delete.
//
//   npx tsx scripts/purge-staff.ts            # preview only
//   npx tsx scripts/purge-staff.ts --confirm  # perform the deletion

const CONFIRM = process.argv.includes("--confirm");

if (getApps().length === 0) {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !privateKey) {
    console.error(
      "❌ Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY in .env",
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

const adminDb = getFirestore();
const adminAuth = getAuth();

async function main() {
  console.log(`Project: ${process.env.FIREBASE_PROJECT_ID}`);
  console.log(
    CONFIRM ? "Mode: ⚠️  LIVE DELETE\n" : "Mode: dry-run (no changes) — pass --confirm to delete\n",
  );

  const snap = await adminDb.collection("staff").get();
  const all = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }));

  const keep = all.filter((s) => s.role === "SuperAdmin");
  const remove = all.filter((s) => s.role !== "SuperAdmin");

  console.log(`Total staff: ${all.length}`);
  console.log(`Keeping (SuperAdmin): ${keep.length}`);
  keep.forEach((s) => console.log(`   ✅ keep  ${s.id}  ${s.name ?? "?"} (@${s.username ?? "?"})`));
  console.log(`Deleting (non-SuperAdmin): ${remove.length}`);
  remove.forEach((s) =>
    console.log(`   🗑️  del   ${s.id}  ${s.name ?? "?"} (@${s.username ?? "?"}) [${s.role}]`),
  );

  if (keep.length === 0) {
    console.error("\n❌ Refusing to run: no SuperAdmin found — this would delete every account.");
    process.exit(1);
  }

  if (remove.length === 0) {
    console.log("\nNothing to delete — only SuperAdmin(s) remain.");
    process.exit(0);
  }

  if (!CONFIRM) {
    console.log("\nDry run complete. Re-run with --confirm to delete the accounts listed above.");
    process.exit(0);
  }

  let deleted = 0;
  for (const s of remove) {
    const batch = adminDb.batch();
    batch.delete(adminDb.collection("staff").doc(s.id));
    batch.delete(adminDb.collection("staff_public").doc(s.id));
    const username = s.username;
    if (typeof username === "string" && username) {
      batch.delete(adminDb.collection("usernames").doc(username.toLowerCase()));
    }
    await batch.commit();
    await adminAuth.revokeRefreshTokens(s.id).catch(() => {}); // best-effort: no session to revoke if they never logged in
    console.log(`   🗑️  deleted ${s.id} (${s.name ?? "?"})`);
    deleted++;
  }

  console.log(`\n✅ Done — ${deleted} account(s) deleted, ${keep.length} SuperAdmin(s) kept.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Purge failed:", err);
  process.exit(1);
});
