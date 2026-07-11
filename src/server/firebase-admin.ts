import { generateKeyPairSync } from "node:crypto";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

// FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST (set by `firebase
// emulators:start` or the e2e harness) route every Firestore/Auth call to
// the local emulator. `adminAuth.createCustomToken()` still signs its JWT
// locally regardless of that, though: with no credential at all it falls
// back to Google's IAM signBlob API, which needs real cloud credentials
// that don't exist locally/in CI and crashed the whole process on the first
// login attempt during e2e testing. The emulator never checks who signed
// the token, so a throwaway keypair generated fresh per process satisfies
// the signer without ever touching a real credential or the network.
const usingEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

if (getApps().length === 0) {
  initializeApp({
    credential: cert(
      usingEmulator
        ? {
            projectId: process.env.FIREBASE_PROJECT_ID || "demo-pos-polishstation",
            clientEmail: "emulator@example.com",
            privateKey: generateKeyPairSync("rsa", {
              modulusLength: 2048,
              privateKeyEncoding: { type: "pkcs1", format: "pem" },
              publicKeyEncoding: { type: "pkcs1", format: "pem" },
            }).privateKey,
          }
        : {
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            // The private key comes from .env as a single-line string with literal \n characters.
            // This replaces them with real newlines so the PEM format is valid.
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
          },
    ),
  });
}

export const adminAuth = getAuth();
export const adminDb = getFirestore();

// The shared host (cPanel/LiteSpeed) breaks long-lived gRPC/HTTP2 outbound
// connections, which the Firestore SDK uses by default — every server-side
// read stalled 40-90s in silent gRPC retries and usually died as a 408.
// REST mode makes each read an ordinary HTTPS request, which the host allows.
// Left on gRPC against the emulator: REST-mode admin requests weren't
// getting the emulator's automatic firestore.rules bypass, so a *real*
// service account (e.g. resolveUsername's read of `usernames`, denied to
// every non-bypassed caller by firestore.rules) started getting rejected
// with PERMISSION_DENIED against the emulator specifically.
if (!usingEmulator) {
  adminDb.settings({ preferRest: true });
}
