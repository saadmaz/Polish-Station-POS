import "dotenv/config";
import { readFileSync } from "node:fs";
import { initializeApp, getApps, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// One-off: deploys ONLY storage.rules, never firestore.rules — the sibling
// scripts/deploy-rules.ts in the project deploys both together, but
// firestore.rules right now holds a drafted-but-intentionally-held-back
// change (the staff owner-only read rule — see its own "DRAFTED + TESTED,
// NOT YET DEPLOYED" comment) that must not go out before its prerequisite
// app redeploy happens. Same REST-API approach as deploy-rules.ts (not
// `firebase deploy`, which needs an IAM permission this service account
// doesn't have on this project) — just scoped to the one file.

const projectId =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.VITE_FIREBASE_PROJECT_ID ||
  process.env.GCLOUD_PROJECT;

if (!projectId) {
  console.error("❌ No project id (set FIREBASE_PROJECT_ID)");
  process.exit(1);
}

const bucket =
  process.env.FIREBASE_STORAGE_BUCKET ||
  process.env.VITE_FIREBASE_STORAGE_BUCKET ||
  `${projectId}.firebasestorage.app`;

if (getApps().length === 0) {
  const useADC = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
  initializeApp({
    credential: useADC
      ? applicationDefault()
      : cert({
          projectId,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
        }),
  });
}

const app = getApps()[0];
const { access_token: token } = await (
  app.options.credential as {
    getAccessToken: () => Promise<{ access_token: string }>;
  }
).getAccessToken();

getFirestore(); // fail fast on an obviously-broken credential

async function rest(method: string, path: string, body?: unknown) {
  const res = await fetch(`https://firebaserules.googleapis.com/v1/${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

async function createRuleset(fileName: string, rulesPath: string): Promise<string> {
  const content = readFileSync(rulesPath, "utf8");
  const rs = await rest("POST", `projects/${projectId}/rulesets`, {
    source: { files: [{ name: fileName, content }] },
  });
  console.log(`  ruleset ${fileName}: ${rs.name}`);
  return rs.name as string;
}

async function release(releaseName: string, rulesetName: string) {
  const full = `projects/${projectId}/releases/${releaseName}`;
  try {
    await rest("PATCH", full, { release: { name: full, rulesetName } });
    console.log(`  released ${releaseName}`);
  } catch (e) {
    if (String(e).includes("→ 404")) {
      await rest("POST", `projects/${projectId}/releases`, { name: full, rulesetName });
      console.log(`  created release ${releaseName}`);
    } else {
      throw e;
    }
  }
}

try {
  console.log(`Deploying STORAGE rules only to ${projectId} (bucket ${bucket})`);
  await release(
    `firebase.storage/${bucket}`,
    await createRuleset("storage.rules", "storage.rules"),
  );
  console.log("✅ Storage rules deployed (firestore.rules untouched)");
  process.exit(0);
} catch (e) {
  console.error("❌ Storage rules deploy failed:", e instanceof Error ? e.message : e);
  process.exit(1);
}
