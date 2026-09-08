import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { z } from "zod";
import { WEBSITE_BOOKING_SERVICES, PREFERRED_WINDOWS } from "@/lib/db";
import { reconcileServiceIds } from "@/lib/lead";
import { toE164 } from "@/lib/phone";
import {
  preflight,
  json,
  createRateLimiter,
  sendLeadAlert,
  GENERIC_ERROR,
} from "@/server/public-api";

// Public, unauthenticated intake for the polishstation.lk booking-request
// page (Full name / Phone / Email optional / Vehicle make & model / Services
// checkboxes + "Other" / Preferred date / Notes optional).
//
// Deliberately does NOT call createBookingFn (src/server/bookings.ts): that
// schema wants an exact HH:MM slot and a serviceId that resolves against a
// real `services` doc, has no `email` field, and wants `plate` +
// `vehicleModel` as separate fields. The site instead collects a free-text
// `vehicle` string and a checkbox list of its own static service names (not
// guaranteed to match a `services` doc id), with no time slot at all. So
// this is a request, not a confirmed slotted Booking — which matches the
// site's own copy ("we'll confirm your slot by phone shortly"). It's stored
// in `leads` with type "booking"; staff triage it into a real Booking by
// hand from the Leads screen.

const BookingSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    phone: z.string().trim().min(6).max(24),
    email: z.string().trim().email().max(200).optional().or(z.literal("")),
    vehicle: z.string().trim().min(1).max(150),
    // At least one checkbox. Each value must be one of the site's own fixed
    // labels -- WEBSITE_BOOKING_SERVICES is the single source of truth
    // shared with src/lib/db.ts, so the site and this endpoint can't drift
    // out of sync with each other.
    services: z.array(z.enum(WEBSITE_BOOKING_SERVICES)).min(1, "Select at least one service"),
    // Required only when "Other" is among `services` -- enforced below via
    // .refine, since Zod can't express a cross-field requirement inline.
    otherService: z.string().trim().max(200).optional().default(""),
    // A native <input type="date"> always posts YYYY-MM-DD regardless of the
    // mm/dd/yyyy format it displays to the visitor -- this is NOT the same
    // string as what's shown on screen.
    preferredDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
    // Optional, not required: the site doesn't send this yet (its
    // "Preferred time" picker still gets appended to `notes` client-side
    // instead -- see docs/marketing-site-booking-prompt.md). Making this
    // required before the site actually sends it would fail every real
    // submission outright, the exact bug b4d95c6 just fixed for
    // services/preferredDate.
    preferredWindow: z.enum(PREFERRED_WINDOWS).optional(),
    notes: z.string().trim().max(1000).optional().default(""),
    // Marketing attribution, all optional -- captured client-side by the
    // site from query params/referrer, not guaranteed to be present.
    utmSource: z.string().trim().max(200).optional(),
    utmMedium: z.string().trim().max(200).optional(),
    utmCampaign: z.string().trim().max(200).optional(),
    landingPage: z.string().trim().max(500).optional(),
    // Honeypot: always sent by the site, normally empty. Any non-empty value
    // means a bot bypassed the client-side check and posted directly.
    company: z.string().trim().max(200).optional().default(""),
  })
  .refine((data) => !data.services.includes("Other") || data.otherService.length > 0, {
    message: "Please describe the 'Other' service",
    path: ["otherService"],
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
          const e164 = toE164(data.phone);
          await adminDb
            .collection("leads")
            .doc(id)
            .set({
              id,
              type: "booking",
              name: data.name,
              phone: e164 ?? data.phone,
              phoneRaw: data.phone,
              email: data.email || null,
              vehicle: data.vehicle,
              services: data.services,
              serviceIds: reconcileServiceIds(data),
              // Omit rather than write "" when "Other" wasn't picked -- see
              // the Firestore undefined-field convention this codebase
              // follows elsewhere; an empty string is a real (wrong) value
              // here, not the same as "field not applicable".
              ...(data.otherService ? { otherService: data.otherService } : {}),
              preferredDate: data.preferredDate,
              ...(data.preferredWindow ? { preferredWindow: data.preferredWindow } : {}),
              notes: data.notes,
              ...(data.utmSource ? { utmSource: data.utmSource } : {}),
              ...(data.utmMedium ? { utmMedium: data.utmMedium } : {}),
              ...(data.utmCampaign ? { utmCampaign: data.utmCampaign } : {}),
              ...(data.landingPage ? { landingPage: data.landingPage } : {}),
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
          Services: data.services.join(", "),
          ...(data.otherService ? { "Other service": data.otherService } : {}),
          "Preferred date": data.preferredDate,
          ...(data.notes ? { Notes: data.notes } : {}),
        });

        return json(request, { ok: true });
      },
    },
  },
});
