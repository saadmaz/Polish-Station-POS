"use server";
// Persistent, server-owned session that lets a device auto-resume without
// re-entering a PIN, independent of Firebase Auth's own client-side
// persistence. Firebase Auth stays the thing firestore.rules actually checks
// (see firestore.rules' Identity section) -- this cookie only decides
// whether to silently mint a fresh custom token on the next visit. Login
// itself still goes straight to Firebase from the browser (src/lib/auth.tsx);
// this session is created in the background right after that succeeds.
import { createServerFn } from "@tanstack/react-start";
import {
  getCookie,
  setCookie,
  deleteCookie,
  getRequestIP,
  getRequestHeader,
} from "@tanstack/react-start/server";
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { adminAuth, adminDb } from "./firebase-admin";
import { withTimeout, withRetry } from "./retry";
import { createRateLimiter } from "./public-api";

// Exported (not just used locally) so changeOwnPinFn in auth.ts can compute
// the same doc id from its own request's cookie -- see the note on
// revokeAllSessions below for why that can't be a shared plain helper here.
export const SESSION_COOKIE_NAME = "ps_session";
const SLIDING_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, refreshed on every resume
const ABSOLUTE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days, fixed at creation
const SLIDING_SECONDS = SLIDING_MS / 1000;

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SLIDING_SECONDS,
  };
}

// Keyed by IP, which on a shop connection is shared by every till/phone/
// laptop behind the same NAT -- generously sized so ordinary multi-device
// daily use (each device resumes once per reload/restart) never collides
// with it. This isn't protecting a guessable secret either way: the cookie
// itself is a 256-bit token, so rate-limiting these two endpoints only
// blunts an outright automated flood, not credential guessing -- unlike
// verifyStepUpPinFn in auth.ts, which DOES gate a guessable 4-digit PIN and
// stays tight.
const isCreateRateLimited = createRateLimiter(5 * 60 * 1000, 200);
const isResumeRateLimited = createRateLimiter(5 * 60 * 1000, 400);

const CreateSessionSchema = z.object({ idToken: z.string().min(1) });

/** Called in the background right after a successful client-side Firebase
 *  login -- never on the login critical path, so a stall here never turns
 *  into "couldn't reach the server" on the PIN screen. */
export const createSessionFn = createServerFn({ method: "POST" })
  .validator((raw: unknown) => CreateSessionSchema.parse(raw))
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    // TEMPORARY diagnostic logging (2026-09-05), same reasoning/removal note
    // as resumeSessionFn above.
    const ip = getRequestIP({ xForwardedFor: true }) ?? "unknown";
    if (isCreateRateLimited(ip)) {
      console.error(`[sessions] create: rate limited (ip=${ip})`);
      return { success: false };
    }

    let uid: string;
    try {
      const decoded = await withTimeout(
        adminAuth.verifyIdToken(data.idToken),
        8_000,
        "token verify",
      );
      uid = decoded.uid;
    } catch (err) {
      console.error("[sessions] create: token verify failed:", err);
      return { success: false };
    }

    const token = randomBytes(32).toString("hex"); // 256 bits, never stored
    const tokenHash = hashSessionToken(token);
    const now = Date.now();

    try {
      await withTimeout(
        adminDb
          .collection("sessions")
          .doc(tokenHash)
          .set({
            staffId: uid,
            createdAt: new Date(now).toISOString(),
            lastSeenAt: new Date(now).toISOString(),
            expiresAt: new Date(now + SLIDING_MS).toISOString(),
            absoluteExpiresAt: new Date(now + ABSOLUTE_MS).toISOString(),
            userAgent: getRequestHeader("user-agent") ?? "unknown",
            ip,
            revoked: false,
            revokedAt: null,
          }),
        10_000,
        "session create",
      );
    } catch (err) {
      console.error(`[sessions] createSessionFn(${uid}) failed:`, err);
      return { success: false };
    }

    console.error(`[sessions] create: success staffId=${uid} hash=${tokenHash.slice(0, 8)}`);
    setCookie(SESSION_COOKIE_NAME, token, cookieOptions());
    return { success: true };
  });

export type ResumeSessionResult = { success: true; customToken: string } | { success: false };

/** Called once on app mount, before the PIN screen would otherwise render,
 *  to silently re-establish a Firebase session from the cookie alone. Any
 *  failure (missing/expired/revoked/deactivated) clears the cookie and falls
 *  back to the PIN screen -- never left half-resumed. */
export const resumeSessionFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<ResumeSessionResult> => {
    // TEMPORARY diagnostic logging (2026-09-05): every return branch here
    // fails silently by design (a normal "not logged in" is not an error),
    // which made "why didn't this device auto-resume" undiagnosable from
    // stderr.log alone. Remove once the reported "still gets logged out"
    // issue is root-caused -- see [[project_auth_model]].
    const token = getCookie(SESSION_COOKIE_NAME);
    if (!token) {
      console.error("[sessions] resume: no cookie");
      return { success: false };
    }

    const ip = getRequestIP({ xForwardedFor: true }) ?? "unknown";
    if (isResumeRateLimited(ip)) {
      console.error(`[sessions] resume: rate limited (ip=${ip})`);
      return { success: false };
    }

    const tokenHash = hashSessionToken(token);
    const ref = adminDb.collection("sessions").doc(tokenHash);
    const snap = await withTimeout(ref.get(), 8_000, "session lookup").catch((err) => {
      console.error(`[sessions] resume: doc lookup failed (hash=${tokenHash.slice(0, 8)}):`, err);
      return null;
    });

    if (!snap?.exists) {
      console.error(`[sessions] resume: no doc for hash=${tokenHash.slice(0, 8)}`);
      deleteCookie(SESSION_COOKIE_NAME, { path: "/" });
      return { success: false };
    }

    const session = snap.data()!;
    const now = Date.now();
    const expiresAt = Date.parse(session.expiresAt as string);
    const absoluteExpiresAt = Date.parse(session.absoluteExpiresAt as string);

    if (session.revoked || now > expiresAt || now > absoluteExpiresAt) {
      console.error(
        `[sessions] resume: rejected staffId=${session.staffId} revoked=${session.revoked} ` +
          `expired=${now > expiresAt} absoluteExpired=${now > absoluteExpiresAt}`,
      );
      deleteCookie(SESSION_COOKIE_NAME, { path: "/" });
      return { success: false };
    }

    const staffId = session.staffId as string;

    // A deactivation should already have called revokeAllSessions, but this
    // is the last line of defence if that best-effort call ever failed.
    const staffSnap = await withTimeout(
      adminDb.collection("staff").doc(staffId).get(),
      8_000,
      "resume staff lookup",
    ).catch((err) => {
      console.error(`[sessions] resume: staff lookup failed staffId=${staffId}:`, err);
      return null;
    });
    if (!staffSnap?.exists || staffSnap.data()?.active === false) {
      console.error(`[sessions] resume: staff missing/inactive staffId=${staffId}`);
      deleteCookie(SESSION_COOKIE_NAME, { path: "/" });
      return { success: false };
    }

    let customToken: string;
    try {
      customToken = await withTimeout(
        adminAuth.createCustomToken(staffId),
        8_000,
        "custom token mint",
      );
    } catch (err) {
      console.error(`[sessions] resume: custom token mint failed staffId=${staffId}:`, err);
      return { success: false };
    }

    // Sliding expiry, capped at the fixed absolute lifetime. Best-effort: a
    // failed touch shouldn't stop this resume from succeeding.
    const newExpiresAt = Math.min(now + SLIDING_MS, absoluteExpiresAt);
    void ref
      .update({
        lastSeenAt: new Date(now).toISOString(),
        expiresAt: new Date(newExpiresAt).toISOString(),
      })
      .catch((err) => console.error(`[sessions] resume touch(${tokenHash}) failed:`, err));

    console.error(`[sessions] resume: success staffId=${staffId}`);
    setCookie(SESSION_COOKIE_NAME, token, cookieOptions());
    return { success: true, customToken };
  },
);

/** Explicit "Log out"/"Switch user"/lock actions all funnel through this
 *  (see logout() in src/lib/auth.tsx) -- clearing client state alone is not
 *  logout, the session doc itself must be revoked. Idempotent: a no-op when
 *  there's no cookie (e.g. an offline-unlock session never had one). */
export const logoutFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ success: true }> => {
    const token = getCookie(SESSION_COOKIE_NAME);
    if (token) {
      const tokenHash = hashSessionToken(token);
      await withTimeout(
        adminDb
          .collection("sessions")
          .doc(tokenHash)
          .set({ revoked: true, revokedAt: new Date().toISOString() }, { merge: true }),
        8_000,
        "session revoke",
      ).catch((err) => console.error(`[sessions] logoutFn revoke(${tokenHash}) failed:`, err));
    }
    deleteCookie(SESSION_COOKIE_NAME, { path: "/" });
    return { success: true };
  },
);

/**
 * Revokes every non-revoked session for a staff id, optionally sparing one
 * (the session performing a self PIN change, so that action doesn't log its
 * own caller out). Plain async function, not a createServerFn: called
 * server-side from staff.ts/auth.ts, never directly by a client.
 *
 * Queried by staffId alone (auto-indexed, no composite index needed) and
 * filtered for `revoked` in memory -- a staff member has at most a handful
 * of live sessions, so this is cheap.
 */
export async function revokeAllSessions(staffId: string, exceptTokenHash?: string): Promise<void> {
  try {
    const snap = await withRetry(
      () => adminDb.collection("sessions").where("staffId", "==", staffId).get(),
      "sessions lookup for revoke-all",
    );
    const now = new Date().toISOString();
    const batch = adminDb.batch();
    let any = false;
    for (const d of snap.docs) {
      if (d.id === exceptTokenHash) continue;
      if (d.data().revoked === true) continue;
      batch.update(d.ref, { revoked: true, revokedAt: now });
      any = true;
    }
    if (any) await withRetry(() => batch.commit(), "sessions revoke-all commit");
  } catch (err) {
    console.error(`[sessions] revokeAllSessions(${staffId}) failed:`, err);
  }
}
