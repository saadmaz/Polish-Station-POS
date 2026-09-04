"use server";
// Staff-side booking creation/updates, moved off the direct client Firestore
// writes store.tsx used before (addBooking/updateBooking/checkinBooking/
// markDepositPaid) so lead-time/max-advance policy is enforced server-side
// for the staff path too, not just the public /book widget's createBookingFn
// (src/server/bookings.ts). Same seniority gate firestore.rules already used
// for direct bookings writes (hasModule("bookings") && Advisor+) -- this
// doesn't loosen anything, it just moves the same check server-side where it
// can't be bypassed by skipping the client.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { adminDb } from "./firebase-admin";
import { withRetry, withTimeout } from "./retry";
import { requireCaller, type Caller } from "./staff-admin";
import { getBookingRules } from "./bookings-data";
import { hasModule, isManagerOrAbove } from "@/lib/permissions";
import {
  DEFAULT_BOOKING_RULES,
  computeRequiredDeposit,
  isWithinLeadTime,
  isWithinMaxAdvance,
  isInsideCancelWindow,
} from "@/lib/booking-rules";
import type { Booking, BookingStatus, ServiceCategory } from "@/lib/db";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Same gate firestore.rules already enforces for a direct bookings write:
 *  the bookings module, held by a Manager+ or an Advisor. */
async function requireBookingsAccess(idToken: string): Promise<Caller | null> {
  const caller = await requireCaller(idToken);
  if (!caller) return null;
  if (!hasModule(caller.role, caller.permissions, "bookings")) return null;
  if (!isManagerOrAbove(caller.role) && caller.role !== "Advisor") return null;
  return caller;
}

async function nextBookingId(): Promise<string> {
  return withRetry(
    () =>
      adminDb.runTransaction(async (tx) => {
        const ref = adminDb.collection("counters").doc("bookings");
        const snap = await tx.get(ref);
        const stored = snap.exists ? Number(snap.data()!.next) : 0;
        const n = Math.max(Number.isFinite(stored) ? stored : 0, 200);
        tx.set(ref, { next: n + 1 });
        return `B-${n}`;
      }),
    "booking id allocation",
  );
}

function writeAudit(
  caller: Caller,
  entry: { action: string; entityId: string; before: unknown; after: unknown },
) {
  const ref = adminDb.collection("audit").doc();
  void ref
    .set({
      ...entry,
      entity: "Booking",
      staffId: caller.uid,
      staffName: caller.uid, // best-effort id-only; staff doc lookup for the display name isn't worth another round trip on this host, see requireCaller's own comments on stall-proneness
      id: ref.id,
      createdAt: new Date().toISOString(),
    })
    .catch((err) => console.error("[staff-bookings] audit write failed:", err));
}

// ── Create ────────────────────────────────────────────────────────────────────

const CreateStaffBookingSchema = z.object({
  idToken: z.string().min(1),
  customerId: z.string().nullable(),
  customerName: z.string().trim().min(1).max(100),
  phone: z.string().trim().max(24),
  plate: z.string().trim().max(20),
  vehicleModel: z.string().trim().max(60),
  serviceId: z.string().trim().min(1),
  date: z.string().regex(DATE_RE),
  time: z.string().regex(TIME_RE),
  tech: z.string().trim().max(60),
  bay: z.string().trim().max(30),
  notes: z.string().trim().max(500),
  overrideReason: z.string().trim().max(300).optional(),
});

export type CreateStaffBookingResult =
  | { success: true; booking: Booking }
  | {
      success: false;
      error: "unauthorized" | "invalid_service" | "outside_lead_time" | "outside_advance_window";
    };

export const createStaffBookingFn = createServerFn({ method: "POST" })
  .validator((raw: unknown) => CreateStaffBookingSchema.parse(raw))
  .handler(async ({ data }): Promise<CreateStaffBookingResult> => {
    const caller = await requireBookingsAccess(data.idToken);
    if (!caller) return { success: false, error: "unauthorized" };

    const serviceSnap = await withTimeout(
      adminDb.collection("services").doc(data.serviceId).get(),
      10_000,
      "service lookup",
    );
    if (!serviceSnap.exists) return { success: false, error: "invalid_service" };
    const service = serviceSnap.data()!;

    const rules = await getBookingRules();
    const nowIso = new Date().toISOString();
    const overrideReason = data.overrideReason?.trim() || undefined;

    if (!isWithinLeadTime(nowIso, data.date, data.time, rules) && !overrideReason) {
      return { success: false, error: "outside_lead_time" };
    }
    if (!isWithinMaxAdvance(nowIso, data.date, rules) && !overrideReason) {
      return { success: false, error: "outside_advance_window" };
    }

    const price = service.price as number;
    const depositAmount = computeRequiredDeposit(price, rules);
    const id = await nextBookingId();

    const booking: Booking = {
      id,
      customerId: data.customerId,
      customerName: data.customerName,
      phone: data.phone,
      plate: data.plate.toUpperCase(),
      vehicleModel: data.vehicleModel,
      serviceId: data.serviceId,
      serviceName: service.name as string,
      category: service.category as ServiceCategory,
      durationMin: service.durationMin as number,
      price,
      date: data.date,
      time: data.time,
      tech: data.tech,
      bay: data.bay || "—",
      status: "Confirmed", // staff bookings always Confirmed -- autoConfirm governs the public widget only
      notes: data.notes,
      createdAt: nowIso,
      cancelWindowHours: rules.cancelWindowHours,
      noShowPenaltyEnabled: rules.noShowPenaltyEnabled,
      ...(depositAmount > 0 ? { depositAmount, depositStatus: "required" as const } : {}),
      ...(overrideReason ? { ruleOverrideReason: overrideReason } : {}),
    };

    await withTimeout(
      adminDb.collection("bookings").doc(id).set(booking),
      10_000,
      "booking create",
    );
    writeAudit(caller, { action: "ADD_BOOKING", entityId: id, before: null, after: booking });

    return { success: true, booking };
  });

// ── Update (cancel / check-in / deposit paid / no-show / complete) ────────────

const UpdateStaffBookingSchema = z.object({
  idToken: z.string().min(1),
  bookingId: z.string().min(1),
  action: z.enum(["cancel", "checkin", "deposit_paid", "no_show", "complete"]),
});

export type UpdateStaffBookingResult =
  { success: true; flagged: boolean } | { success: false; error: "unauthorized" | "not_found" };

const ACTION_STATUS: Partial<
  Record<z.infer<typeof UpdateStaffBookingSchema>["action"], BookingStatus>
> = {
  cancel: "Cancelled",
  checkin: "Checked-In",
  no_show: "No-Show",
  complete: "Completed",
};

export const updateStaffBookingFn = createServerFn({ method: "POST" })
  .validator((raw: unknown) => UpdateStaffBookingSchema.parse(raw))
  .handler(async ({ data }): Promise<UpdateStaffBookingResult> => {
    const caller = await requireBookingsAccess(data.idToken);
    if (!caller) return { success: false, error: "unauthorized" };

    const ref = adminDb.collection("bookings").doc(data.bookingId);
    const snap = await withTimeout(ref.get(), 10_000, "booking lookup");
    if (!snap.exists) return { success: false, error: "not_found" };
    const before = snap.data() as Booking;

    // Flag-only per the app's own constraints (no stored payment method /
    // automated charging exists anywhere): neither check ever blocks the
    // action, both just tell the caller whether the policy was violated so
    // the UI can show an informational toast. Reads the SNAPSHOT taken at
    // booking creation, never the live settings doc -- see booking-rules.ts.
    let flagged = false;
    if (data.action === "cancel") {
      const cancelWindowHours = before.cancelWindowHours ?? DEFAULT_BOOKING_RULES.cancelWindowHours;
      flagged = isInsideCancelWindow(
        new Date().toISOString(),
        before.date,
        before.time,
        cancelWindowHours,
      );
    } else if (data.action === "no_show") {
      flagged = before.noShowPenaltyEnabled ?? DEFAULT_BOOKING_RULES.noShowPenaltyEnabled;
    }

    const after: Booking = { ...before };
    if (data.action === "deposit_paid") {
      after.depositStatus = "paid";
    } else {
      after.status = ACTION_STATUS[data.action]!;
    }

    await withTimeout(ref.set(after), 10_000, "booking update");
    writeAudit(caller, {
      action: `${data.action.toUpperCase()}_BOOKING`,
      entityId: data.bookingId,
      before,
      after,
    });

    return { success: true, flagged };
  });
