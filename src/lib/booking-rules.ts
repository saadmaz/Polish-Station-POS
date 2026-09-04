// Single source of truth for booking-policy math: lead time, max-advance
// window, deposit computation, and cancellation-window flagging. Pure
// functions only (no firebase/react imports), imported by both the client
// (slot-picker filtering in book.tsx, live preview in booking-sheet.tsx) and
// both servers (src/server/bookings.ts for the public widget,
// src/server/staff-bookings.ts for staff) so there is exactly one
// implementation of this logic, never two copies that could drift.
//
// Cancellation/no-show enforcement reads the rules SNAPSHOTTED onto the
// booking at creation time (cancelWindowHours/noShowPenaltyEnabled fields on
// the Booking doc itself), never the live settings/bookingRules doc -- so
// editing a policy never retroactively rewrites the terms of a booking
// already taken. Lead-time/max-advance checks, by contrast, always read the
// CURRENT live rules, since those only ever apply at the moment a new
// booking (or a reschedule) is being created.
import { businessDateOf, businessDayBoundsUtc } from "./business-day";

export interface BookingRules {
  leadTimeMinutes: number;
  maxAdvanceDays: number;
  depositThreshold: number; // LKR; price at/above this requires a deposit
  depositPct: number; // 0-100, applied to price when deposit is required
  cancelWindowHours: number;
  // Flag-only: this app has no stored payment method or automated charging
  // anywhere, so there is no real "penalty" to apply -- a no-show inside
  // this policy is recorded (booking + audit log), not charged.
  noShowPenaltyEnabled: boolean;
  // Public /book widget only: staff-created bookings always land Confirmed
  // regardless of this setting (see src/server/staff-bookings.ts).
  autoConfirm: boolean;
}

export const DEFAULT_BOOKING_RULES: BookingRules = {
  leadTimeMinutes: 30,
  maxAdvanceDays: 60,
  depositThreshold: 25_000,
  depositPct: 20,
  cancelWindowHours: 24,
  noShowPenaltyEnabled: true,
  autoConfirm: true,
};

function slotInstantMs(date: string, time: string): number {
  const { startUtc } = businessDayBoundsUtc(date);
  const [h, m] = time.split(":").map(Number);
  return startUtc.getTime() + (h * 60 + m) * 60_000;
}

/** True if the slot is far enough in the future to respect the lead time. */
export function isWithinLeadTime(
  nowIso: string,
  date: string,
  time: string,
  rules: Pick<BookingRules, "leadTimeMinutes">,
): boolean {
  const minutesUntilSlot = (slotInstantMs(date, time) - new Date(nowIso).getTime()) / 60_000;
  return minutesUntilSlot >= rules.leadTimeMinutes;
}

/** True if the slot's business date isn't further out than the advance-booking cap. */
export function isWithinMaxAdvance(
  nowIso: string,
  date: string,
  rules: Pick<BookingRules, "maxAdvanceDays">,
): boolean {
  const { startUtc: nowDayStart } = businessDayBoundsUtc(businessDateOf(nowIso));
  const { startUtc: slotDayStart } = businessDayBoundsUtc(date);
  const daysOut = Math.round((slotDayStart.getTime() - nowDayStart.getTime()) / 86_400_000);
  return daysOut <= rules.maxAdvanceDays;
}

/** 0 if price is below the threshold, otherwise the rounded deposit amount. */
export function computeRequiredDeposit(
  price: number,
  rules: Pick<BookingRules, "depositThreshold" | "depositPct">,
): number {
  if (price < rules.depositThreshold) return 0;
  return Math.round((price * rules.depositPct) / 100);
}

/** True if `nowIso` falls inside the cancellation window before the slot
 *  (including any time after the slot itself, e.g. a very late cancel). */
export function isInsideCancelWindow(
  nowIso: string,
  date: string,
  time: string,
  cancelWindowHours: number,
): boolean {
  const hoursUntilSlot = (slotInstantMs(date, time) - new Date(nowIso).getTime()) / 3_600_000;
  return hoursUntilSlot < cancelWindowHours;
}
