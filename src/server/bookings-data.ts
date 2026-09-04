// Split out of bookings.ts for the same reason server/staff-cache.ts was
// split out of auth.ts: bookings.ts is a "use server" file imported by the
// public /book page (src/routes/book.tsx). Its createServerFn handlers get
// their bodies swapped for an RPC stub in the client bundle, but a plain
// top-level helper like this one -- called BY those handlers but not nested
// inside them -- doesn't get stripped, which kept adminDb's import (and
// firebase-admin's Node-only dependency graph) alive in the client bundle.
import { adminDb } from "./firebase-admin";
import { withRetry, withTimeout } from "./retry";
import { DEFAULT_BOOKING_RULES, type BookingRules } from "@/lib/booking-rules";

const CLOSED_STATUSES = new Set(["Cancelled", "No-Show"]);

export async function activeBookingsOnDate(date: string) {
  const snap = await withTimeout(
    adminDb.collection("bookings").where("date", "==", date).get(),
    10_000,
    "bookings for date",
  );
  return snap.docs.map((d) => d.data()).filter((b) => !CLOSED_STATUSES.has(b.status as string));
}

/** Shared by both booking-creation entry points (the public widget in
 *  bookings.ts and the staff path in staff-bookings.ts) so there's one
 *  server-side read of settings/bookingRules, not two. Mirrors
 *  sanitizeBookingRules (src/lib/db.ts) without importing that file: it
 *  pulls in client localStorage-era Firestore helpers with no place in a
 *  server bundle. */
export async function getBookingRules(): Promise<BookingRules> {
  const snap = await withRetry(
    () => adminDb.collection("settings").doc("bookingRules").get(),
    "booking rules lookup",
  );
  if (!snap.exists) return DEFAULT_BOOKING_RULES;
  const d = snap.data()!;
  const num = (
    k:
      | "leadTimeMinutes"
      | "maxAdvanceDays"
      | "depositThreshold"
      | "depositPct"
      | "cancelWindowHours",
  ) =>
    typeof d[k] === "number" && Number.isFinite(d[k]) ? (d[k] as number) : DEFAULT_BOOKING_RULES[k];
  return {
    leadTimeMinutes: Math.max(0, num("leadTimeMinutes")),
    maxAdvanceDays: Math.max(0, num("maxAdvanceDays")),
    depositThreshold: Math.max(0, num("depositThreshold")),
    depositPct: Math.min(100, Math.max(0, num("depositPct"))),
    cancelWindowHours: Math.max(0, num("cancelWindowHours")),
    noShowPenaltyEnabled:
      typeof d.noShowPenaltyEnabled === "boolean"
        ? d.noShowPenaltyEnabled
        : DEFAULT_BOOKING_RULES.noShowPenaltyEnabled,
    autoConfirm:
      typeof d.autoConfirm === "boolean" ? d.autoConfirm : DEFAULT_BOOKING_RULES.autoConfirm,
  };
}
