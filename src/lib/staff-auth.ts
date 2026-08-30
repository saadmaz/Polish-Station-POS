// Derives the Firebase Auth identity (email + password) backing a staff
// member's username + PIN. Pure, no firebase/react imports (same rule as
// permissions.ts) so it's safe to import from client code, server code, and
// standalone Admin-SDK scripts alike. The single source of truth for this
// derivation: client login and every server-side account-provisioning call
// must agree exactly, or a correct username+PIN stops resolving to the
// matching Firebase Auth account.

/** Usernames are matched case-insensitively; the email derived below (and the
 *  `usernames/{key}` index doc) is keyed by this lowercased form while the
 *  staff doc keeps the display casing. */
export const usernameKey = (u: string) => u.trim().toLowerCase();

// Never resolves to anything real -- just a namespace so a username can stand
// in for an email address that Firebase Auth requires.
const STAFF_EMAIL_DOMAIN = "staff.polishstation.internal";

export const toStaffEmail = (username: string) => `${usernameKey(username)}@${STAFF_EMAIL_DOMAIN}`;

// Firebase Auth requires a 6+ character password; this prefix only pads
// length to satisfy that, it adds no entropy beyond the 4-digit PIN itself.
export const toStaffPassword = (pin: string) => `ps-pin-${pin}`;
