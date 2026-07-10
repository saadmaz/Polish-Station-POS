import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth }      from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // The private key comes from .env as a single-line string with literal \n characters.
      // This replaces them with real newlines so the PEM format is valid.
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

export const adminAuth = getAuth();
export const adminDb   = getFirestore();

// The shared host (cPanel/LiteSpeed) breaks long-lived gRPC/HTTP2 outbound
// connections, which the Firestore SDK uses by default — every server-side
// read stalled 40-90s in silent gRPC retries and usually died as a 408.
// REST mode makes each read an ordinary HTTPS request, which the host allows.
adminDb.settings({ preferRest: true });
