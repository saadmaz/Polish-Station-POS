// Phone normalization for matching a Lead/booking-form phone number against
// an existing Customer, mirroring normalizePlate() in vehicle.ts. Used only
// for in-memory equality comparison (see convertLeadToBooking/
// convertLeadToInvoiceLink in store.tsx) — there is no Firestore doc-id
// index keyed on this the way plates/ indexes normalizePlate(), since
// customer matching already happens as an in-memory scan everywhere else in
// this codebase (booking-sheet.tsx, _app.leads.tsx).

/**
 * Strips everything but digits, then folds the common Sri Lankan local
 * format (leading 0, 10 digits) into the country-code form so "0771234567"
 * and "+94 77 123 4567" normalize to the same key. Any other length/shape is
 * returned as digits-only rather than guessed at further.
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0")) return `94${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith("94")) return digits;
  return digits;
}
