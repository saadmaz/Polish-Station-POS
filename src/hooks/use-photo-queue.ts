// Mount exactly once (in _app.tsx's AppLayout) — starts the background
// retry loop for the offline photo queue (see src/lib/photo-queue.ts) and
// exposes the pending count for the chrome indicator (Phase 6: "Persistent
// 'N photos pending upload' indicator in the app chrome, not only on the
// inspection screen" — a silent queue loses data). Mounting this more than
// once would just duplicate the online-listener/interval, not corrupt
// anything (flushPhotoQueue() re-entrancy-guards itself), but there's no
// reason to.
import { useEffect, useState } from "react";
import { PHOTO_CAPTURE_ENABLED } from "@/lib/inspection";
import { PHOTO_QUEUE_CHANGED_EVENT, flushPhotoQueue, pendingPhotoCount } from "@/lib/photo-queue";

const POLL_INTERVAL_MS = 30_000;

export function usePhotoQueue(): { pendingCount: number } {
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    // flushPhotoQueue() already no-ops while the flag is off (see its own
    // comment) — this skips even the count poll, so the app chrome doesn't
    // show a "N photos pending upload" badge that can now never resolve to
    // zero (nothing will ever flush them while capture is disabled).
    if (!PHOTO_CAPTURE_ENABLED) return;
    let cancelled = false;

    async function refresh() {
      const count = await pendingPhotoCount().catch(() => 0);
      if (!cancelled) setPendingCount(count);
    }

    async function flushAndRefresh() {
      await flushPhotoQueue().catch(() => {});
      await refresh();
    }

    void flushAndRefresh(); // catch up on anything left over from a previous session, right away
    window.addEventListener("online", flushAndRefresh);
    // Recount (not a full flush — we're not necessarily online) the moment
    // captureInspectionPhoto() enqueues something or flushPhotoQueue()
    // clears an item, so the badge reacts immediately instead of waiting
    // for the next poll or reconnect.
    window.addEventListener(PHOTO_QUEUE_CHANGED_EVENT, refresh);
    const interval = setInterval(flushAndRefresh, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.removeEventListener("online", flushAndRefresh);
      window.removeEventListener(PHOTO_QUEUE_CHANGED_EVENT, refresh);
      clearInterval(interval);
    };
  }, []);

  return { pendingCount };
}
