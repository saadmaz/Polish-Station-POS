import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { z } from "zod";
import {
  preflight,
  json,
  createRateLimiter,
  sendLeadAlert,
  GENERIC_ERROR,
} from "@/server/public-api";

// Public, unauthenticated intake for the polishstation.lk booking form.
//
// Deliberately does NOT call createBookingFn (src/server/bookings.ts): that
// schema wants an exact HH:MM slot and a serviceId that resolves against a
// real `services` doc, has no `email` field, and wants `plate` +
// `vehicleModel` as separate fields. The site instead collects a broad
// `timeWindow`, a free-text `vehicle` string, and a `serviceId` that's one of
// the site's own static slugs, not guaranteed to match a `services` doc id.
// So this is a request, not a confirmed slotted Booking — which matches the
// site's own copy ("we'll confirm your slot by phone shortly"). It's stored
// in `leads` with type "booking"; staff triage it into a real Booking by
// hand from the Leads screen.

const BookingSchema = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(6).max(24),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
  vehicle: z.string().trim().min(1).max(150),
  serviceId: z.string().trim().min(1).max(100),
  preferredDate: z.string().trim().min(1).max(40),
  timeWindow: z.string().trim().min(1).max(100),
  notes: z.string().trim().max(1000).optional().default(""),
  // Honeypot: always sent by the site, normally empty. Any non-empty value
  // means a bot bypassed the client-side check and posted directly.
  company: z.string().trim().max(200).optional().default(""),
});

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 3;
const isRateLimited = createRateLimiter(RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX);

function leadId(): string {
  return `L-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export const Route = createFileRoute("/api/public/booking")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => preflight(request),
      POST: async ({ request }) => {
        let data: z.infer<typeof BookingSchema>;
        try {
          data = BookingSchema.parse(await request.json());
        } catch {
          return json(request, { ok: false, error: "Please check your details and try again." });
        }

        // Bot caught by the honeypot: pretend it worked so it never learns
        // its submission was flagged, but don't write anything.
        if (data.company) return json(request, { ok: true });

        if (isRateLimited(data.phone)) {
          return json(request, { ok: false, error: GENERIC_ERROR });
        }

        try {
          const { adminDb } = await import("@/server/firebase-admin");
          const id = leadId();
          await adminDb
            .collection("leads")
            .doc(id)
            .set({
              id,
              type: "booking",
              name: data.name,
              phone: data.phone,
              email: data.email || null,
              vehicle: data.vehicle,
              serviceId: data.serviceId,
              preferredDate: data.preferredDate,
              timeWindow: data.timeWindow,
              notes: data.notes,
              status: "new",
              source: "polishstation.lk",
              createdAt: new Date().toISOString(),
              ip: request.headers.get("x-forwarded-for"),
            });
        } catch (err) {
          console.error("[api.public.booking] Firestore write failed:", err);
          return json(request, { ok: false, error: GENERIC_ERROR });
        }

        await sendLeadAlert(`New booking request from ${data.name}`, {
          Name: data.name,
          Phone: data.phone,
          ...(data.email ? { Email: data.email } : {}),
          Vehicle: data.vehicle,
          Service: data.serviceId,
          "Preferred date": data.preferredDate,
          "Time window": data.timeWindow,
          ...(data.notes ? { Notes: data.notes } : {}),
        });

        return json(request, { ok: true });
      },
    },
  },
});
