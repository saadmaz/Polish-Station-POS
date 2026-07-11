import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

// Warm-up / health endpoint. Purpose: keep the exact machinery a login
// depends on — firebase-admin init + an open Firestore REST connection — hot,
// so a real user's login never pays it cold.
//
// Background: on the shared LiteSpeed/Passenger host a cold worker takes ~9s
// just to boot the Node bundle, and firebase-admin + the first Firestore REST
// read add several more. A first-time user's login can't skip the uncached
// `usernames` index read, so on a cold worker the total can blow past
// LiteSpeed's proxy timeout → the 408 that surfaces as "Couldn't reach the
// server" on the PIN pad. The existing keep-warm pings hit `/`, which runs SSR
// but never imports firebase-admin — so that path was never actually warmed.
//
// This endpoint is hit by (a) start.mjs on boot, (b) any open tab every few
// minutes, and (c) the cron/Actions keep-warm — each of which now warms the
// login path AND the token-verification path (change-PIN / staff mgmt), not
// just the HTML tier.

// Warm the ID-token verification path. `loginFn` *mints* a custom token (local
// RSA signing, no network) but `changeOwnPinFn` and every staff-management
// function *verify* an ID token — and the first verifyIdToken per worker
// fetches Google's public signing certs over HTTPS (www.googleapis.com), an
// outbound call this shared host is known to stall on (the same reason
// Firestore uses preferRest). That cold fetch is what made the change-PIN
// screen hang. A structurally-valid ID token with a bogus signature drives
// verifyIdToken far enough to fetch + cache those certs (~hours), then fails
// harmlessly on the unknown key — so the first REAL verify is already warm.
async function warmTokenVerify(adminAuth: { verifyIdToken(t: string): Promise<unknown> }) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) return;
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const warmToken =
    `${enc({ alg: "RS256", kid: "warmup", typ: "JWT" })}.` +
    `${enc({
      aud: projectId,
      iss: `https://securetoken.google.com/${projectId}`,
      sub: "warmup",
      iat: now,
      exp: now + 3600,
      auth_time: now,
    })}.` +
    `d2FybXVw`; // "warmup" — intentionally invalid signature
  await adminAuth.verifyIdToken(warmToken).catch(() => {}); // expected to reject after the cert fetch
}

export const Route = createFileRoute("/healthz")({
  server: {
    handlers: {
      GET: async () => {
        try {
          // Dynamic import so firebase-admin never enters the client bundle
          // and is only pulled in server-side. The first call is what pays
          // init — which is the whole point of calling it from a warm-up.
          const { adminDb, adminAuth } = await import("@/server/firebase-admin");
          const { warmStaffCache } = await import("@/server/auth");
          // Warm every hot path in parallel:
          //  • staff cache      → login reads it from memory (no per-request I/O)
          //  • Firestore read   → keeps the admin Firestore connection warm
          //  • token verify     → the change-PIN / staff-management path
          await Promise.all([
            warmStaffCache(),
            adminDb.collection("staff").limit(1).get(),
            warmTokenVerify(adminAuth),
          ]);
          return new Response("ok", {
            headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
          });
        } catch (err) {
          // Best-effort: reaching this handler already proves the Node/SSR tier
          // is up, so still answer 200 (uptime monitors shouldn't page on a
          // transient Firestore blip) but signal degraded in the body/logs.
          console.error("[healthz] warm-up failed:", err);
          return new Response("degraded", {
            status: 200,
            headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
          });
        }
      },
    },
  },
});
