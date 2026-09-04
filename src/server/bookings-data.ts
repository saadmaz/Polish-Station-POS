// Split out of bookings.ts for the same reason server/staff-cache.ts was
// split out of auth.ts: bookings.ts is a "use server" file imported by the
// public /book page (src/routes/book.tsx). Its createServerFn handlers get
// their bodies swapped for an RPC stub in the client bundle, but a plain
// top-level helper like this one -- called BY those handlers but not nested
// inside them -- doesn't get stripped, which kept adminDb's import (and
// firebase-admin's Node-only dependency graph) alive in the client bundle.
import { adminDb } from "./firebase-admin";
import { withTimeout } from "./retry";

const CLOSED_STATUSES = new Set(["Cancelled", "No-Show"]);

export async function activeBookingsOnDate(date: string) {
  const snap = await withTimeout(
    adminDb.collection("bookings").where("date", "==", date).get(),
    10_000,
    "bookings for date",
  );
  return snap.docs.map((d) => d.data()).filter((b) => !CLOSED_STATUSES.has(b.status as string));
}
