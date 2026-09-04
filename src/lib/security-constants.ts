// Single source of truth for the security-posture numbers surfaced on the
// Staff & Access screen (src/components/access-panel.tsx). Kept
// dependency-free (no React, no Firebase) on purpose so it can be imported
// directly in a test without dragging in a live Firebase client app -- see
// security-stats.test.ts, which asserts the tiles can't silently drift from
// these values.

/** Inactivity timeout before an authenticated session is force-logged-out
 *  client-side. See src/lib/auth.tsx's resetTimer/logout. */
export const SESSION_TIMEOUT_MS = 15 * 60 * 1000;

/** Governs ONLY the offline/cached-PIN login on an enrolled till (see
 *  src/lib/offline-auth.ts's checkAttempt). The PRIMARY online username+PIN
 *  login has no lockout this app controls at all -- it goes straight to
 *  Firebase Auth's own undocumented auth/too-many-requests throttle (see
 *  src/lib/auth.tsx's mapFirebaseAuthError, which only guesses a 60s
 *  countdown for the UI). There is deliberately no tile/constant for that
 *  path: it has no authoritative source in this codebase to render. */
export const LOCKOUT_THRESHOLD = 5;
/** Doubles per additional failure past LOCKOUT_THRESHOLD (30s, 60s, 120s...). */
export const LOCKOUT_BASE_MS = 30_000;
