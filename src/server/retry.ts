// Generic network-resilience helpers, split out of auth.ts so they can be
// imported by server-only modules (staff-cache.ts) without dragging that
// file's "use server" boundary — and everything it pulls in — along for the
// ride. Pure/no side effects: safe to import from anywhere.

// Fail fast instead of letting a stalled Firestore connection hold a request
// until the web server's own timeout (LiteSpeed 408s at ~60s+, and the user
// just sees a frozen UI the whole time).
export function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

/** Retry a flaky-network operation instead of letting a stall hang the request.
 *  This host's outbound route to Firestore goes bad for seconds at a time; a
 *  single stalled call is what left the "Create user" button spinning forever.
 *  A stalled attempt is abandoned and re-issued, which usually lands once the
 *  bad window passes.
 *
 *  ONLY wrap operations that are safe to re-issue: reads, and writes that are
 *  idempotent (set/delete, NOT `create`, which is single-shot by design; see
 *  claimUsername in staff.ts for that case). */
export async function withRetry<T>(
  fn: () => Promise<T>,
  what: string,
  attempts = 4,
  timeoutMs = 6_000,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await withTimeout(fn(), timeoutMs, what);
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`${what} failed`);
}
