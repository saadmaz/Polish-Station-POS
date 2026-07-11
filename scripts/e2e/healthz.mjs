// Verifies the /healthz warm-up endpoint: it must return 200 "ok", which
// proves the server-side firebase-admin dynamic import + Firestore read
// actually succeeded (a failure would return "degraded"). This is the same
// path start.mjs self-invokes on boot and the crons/tabs ping to keep the
// login path warm — so if this is green, the warm-up genuinely exercises the
// machinery loginFn depends on.
import { BASE_URL, check, assert, summarize } from "./_shared.mjs";

console.log("Health / warm-up endpoint:");

await check("/healthz returns 200 and the admin Firestore read succeeded", async () => {
  const res = await fetch(`${BASE_URL}/healthz`, { cache: "no-store" });
  assert(res.status === 200, `expected 200, got ${res.status}`);
  const body = (await res.text()).trim();
  assert(
    body === "ok",
    `expected "ok" (firebase-admin + Firestore warmed), got "${body}" — warm-up read failed`,
  );
});

await check("/healthz sets no-store so keep-warm pings never get a cached hit", async () => {
  const res = await fetch(`${BASE_URL}/healthz`, { cache: "no-store" });
  const cc = res.headers.get("cache-control") || "";
  assert(cc.includes("no-store"), `expected no-store cache-control, got "${cc}"`);
});

summarize("Health / warm-up endpoint");
