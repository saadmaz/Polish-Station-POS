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
// login path, not just the HTML tier.
export const Route = createFileRoute("/healthz")({
  server: {
    handlers: {
      GET: async () => {
        try {
          // Dynamic import so firebase-admin never enters the client bundle
          // and is only pulled in server-side. The first call is what pays
          // init — which is the whole point of calling it from a warm-up.
          const { adminDb } = await import("@/server/firebase-admin");
          // A trivial bounded read initializes firebase-admin and opens the
          // keep-alive Firestore REST connection that loginFn reuses.
          await adminDb.collection("staff").limit(1).get();
          return new Response("ok", {
            headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
          });
        } catch (err) {
          // Best-effort: reaching this handler already proves the Node/SSR tier
          // is up, so still answer 200 (uptime monitors shouldn't page on a
          // transient Firestore blip) but signal degraded in the body/logs.
          console.error("[healthz] warm-up read failed:", err);
          return new Response("degraded", {
            status: 200,
            headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
          });
        }
      },
    },
  },
});
