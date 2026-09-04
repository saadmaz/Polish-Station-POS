"use server";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { adminDb } from "./firebase-admin";
import { withTimeout } from "./retry";
import { activeBookingsOnDate, getBookingRules } from "./bookings-data";
import { todayBusinessDate } from "@/lib/business-day";
import { isWithinLeadTime, isWithinMaxAdvance, computeRequiredDeposit } from "@/lib/booking-rules";

// Public, unauthenticated surface for the /book widget. firestore.rules
// requires isAuth() for both `services` reads and `bookings` writes (by
// design, see firestore.rules), so an anonymous visitor cannot use the
// client SDK for any of this. These server functions run on the Admin SDK,
// which bypasses rules entirely, the same way loginFn does for the login
// screen. Nothing here trusts client-submitted pricing or duration; both
// are re-derived from the `services` doc server-side.

// ── Bookable services ─────────────────────────────────────────────────────────

export interface BookableService {
  id: string;
  name: string;
  category: string;
  durationMin: number;
  price: number;
}

export const getBookableServicesFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<BookableService[]> => {
    const snap = await withTimeout(adminDb.collection("services").get(), 10_000, "services list");
    return snap.docs.map((d) => {
      const s = d.data();
      return {
        id: d.id,
        name: s.name as string,
        category: s.category as string,
        durationMin: s.durationMin as number,
        price: s.price as number,
      };
    });
  },
);

// ── Slot availability ────────────────────────────────────────────────────────

const MAX_PER_SLOT = 5;

const DateSchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

/** Times on the given date that are already at capacity; the widget disables these. */
export const getFullSlotsFn = createServerFn({ method: "GET" })
  .validator((raw: unknown) => DateSchema.parse(raw))
  .handler(async ({ data }): Promise<string[]> => {
    const bookings = await activeBookingsOnDate(data.date);
    const counts = new Map<string, number>();
    for (const b of bookings) {
      const t = b.time as string;
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()].filter(([, n]) => n >= MAX_PER_SLOT).map(([t]) => t);
  });

// ── Create booking ────────────────────────────────────────────────────────────

const CreateBookingSchema = z.object({
  serviceId: z.string().trim().min(1).max(100),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  name: z.string().trim().min(1).max(80),
  phone: z.string().trim().min(6).max(24),
  plate: z.string().trim().max(20).optional().default(""),
  vehicleModel: z.string().trim().max(60).optional().default(""),
  notes: z.string().trim().max(500).optional().default(""),
});

export type CreateBookingResult =
  | { success: true; bookingId: string }
  | {
      success: false;
      error:
        | "invalid_service"
        | "slot_full"
        | "rate_limited"
        | "invalid_date"
        | "outside_lead_time"
        | "outside_advance_window";
    };

// Best-effort abuse guard: this is the only write reachable with zero
// authentication anywhere in the app, so it gets its own cap independent of
// the per-slot capacity check below. In-memory, per-process, resets on a
// cold start like the caches in server/auth.ts. Good enough to stop a casual
// script from flooding the booking list; not a substitute for a CDN/WAF-level
// rate limiter if this page ever sees real abuse.
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 3;
const recentByPhone = new Map<string, number[]>();

function isRateLimited(phone: string): boolean {
  const now = Date.now();
  const hits = (recentByPhone.get(phone) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  hits.push(now);
  recentByPhone.set(phone, hits);
  return hits.length > RATE_LIMIT_MAX;
}

export const createBookingFn = createServerFn({ method: "POST" })
  .validator((raw: unknown) => CreateBookingSchema.parse(raw))
  .handler(async ({ data }): Promise<CreateBookingResult> => {
    if (isRateLimited(data.phone)) return { success: false, error: "rate_limited" };

    // The widget only ever offers today onward, but never trust the client
    // for something a replayed or hand-crafted request could abuse. Business
    // date, not the server host's UTC date: this runs on the Admin SDK,
    // whose host clock has no reason to be in Asia/Colombo.
    const today = todayBusinessDate();
    if (data.date < today) return { success: false, error: "invalid_date" };

    const serviceSnap = await withTimeout(
      adminDb.collection("services").doc(data.serviceId).get(),
      10_000,
      "service lookup",
    );
    if (!serviceSnap.exists) return { success: false, error: "invalid_service" };
    const service = serviceSnap.data()!;

    // No override on this path: it's unauthenticated, so there's no caller
    // to attribute a bypass to. The widget itself should already be hiding
    // out-of-window slots/dates (see getBookingRulesFn below) -- this is the
    // server-side backstop for a replayed or hand-crafted request.
    const rules = await getBookingRules();
    const nowIso = new Date().toISOString();
    if (!isWithinLeadTime(nowIso, data.date, data.time, rules)) {
      return { success: false, error: "outside_lead_time" };
    }
    if (!isWithinMaxAdvance(nowIso, data.date, rules)) {
      return { success: false, error: "outside_advance_window" };
    }

    const sameSlot = (await activeBookingsOnDate(data.date)).filter((b) => b.time === data.time);
    if (sameSlot.length >= MAX_PER_SLOT) return { success: false, error: "slot_full" };

    // Timestamp+random rather than a sequential "B-NNN" counter: computing the
    // next sequential number safely would mean reading the entire bookings
    // collection on every anonymous submission, on a host where extra
    // Firestore round trips are the thing that has repeatedly caused
    // production timeouts (see server/auth.ts). Staff-created bookings keep
    // the sequential "B-200..." scheme from the authenticated app; the two
    // formats coexist safely since nextSeqId() already ignores non-numeric
    // suffixes when computing the next staff-side number.
    const bookingId = `B-W${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const price = service.price as number;
    const depositAmount = computeRequiredDeposit(price, rules);

    await withTimeout(
      adminDb
        .collection("bookings")
        .doc(bookingId)
        .set({
          id: bookingId,
          customerId: null,
          customerName: data.name,
          phone: data.phone,
          plate: data.plate.toUpperCase(),
          vehicleModel: data.vehicleModel,
          serviceId: data.serviceId,
          serviceName: service.name as string,
          category: service.category as string,
          durationMin: service.durationMin as number,
          price,
          date: data.date,
          time: data.time,
          tech: "", // no fallback-routing logic keys on this one (unlike bay)
          bay: "—",
          // autoConfirm governs only this public path -- staff-created
          // bookings always land Confirmed (src/server/staff-bookings.ts).
          status: rules.autoConfirm ? "Confirmed" : "Pending",
          notes: data.notes,
          createdAt: nowIso,
          // Snapshotted at creation -- cancellation/no-show flagging must
          // read these, never the live settings doc, see booking-rules.ts.
          cancelWindowHours: rules.cancelWindowHours,
          noShowPenaltyEnabled: rules.noShowPenaltyEnabled,
          ...(depositAmount > 0 ? { depositAmount, depositStatus: "required" } : {}),
        }),
      10_000,
      "booking create",
    );

    return { success: true, bookingId };
  });

// ── Booking policy (public-safe subset) ────────────────────────────────────────
// Only the two fields that affect what the widget shows before submission --
// deliberately NOT the full BookingRules (deposit/cancellation policy is
// nobody else's business until they're already booking).

export interface PublicBookingRules {
  leadTimeMinutes: number;
  maxAdvanceDays: number;
}

export const getBookingRulesFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicBookingRules> => {
    const rules = await getBookingRules();
    return { leadTimeMinutes: rules.leadTimeMinutes, maxAdvanceDays: rules.maxAdvanceDays };
  },
);
