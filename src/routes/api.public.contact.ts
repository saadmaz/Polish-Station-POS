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

// Public, unauthenticated intake for the polishstation.lk contact form.
// Same spirit as createBookingFn in src/server/bookings.ts (Zod validation,
// Admin SDK write that bypasses firestore.rules, in-memory rate limiter),
// but a plain HTTP route so the cross-origin marketing site can call it with
// real CORS instead of same-origin RPC. See src/server/public-api.ts for the
// shared CORS/rate-limit/email plumbing.

const ContactSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(200),
  message: z.string().trim().min(1).max(3000),
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

export const Route = createFileRoute("/api/public/contact")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => preflight(request),
      POST: async ({ request }) => {
        let data: z.infer<typeof ContactSchema>;
        try {
          data = ContactSchema.parse(await request.json());
        } catch {
          return json(request, { ok: false, error: "Please check your details and try again." });
        }

        // Bot caught by the honeypot: pretend it worked so it never learns
        // its submission was flagged, but don't write anything.
        if (data.company) return json(request, { ok: true });

        if (isRateLimited(data.email)) {
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
              type: "contact",
              name: data.name,
              email: data.email,
              message: data.message,
              status: "new",
              source: "polishstation.lk",
              createdAt: new Date().toISOString(),
              ip: request.headers.get("x-forwarded-for"),
            });
        } catch (err) {
          console.error("[api.public.contact] Firestore write failed:", err);
          return json(request, { ok: false, error: GENERIC_ERROR });
        }

        await sendLeadAlert(`New contact inquiry from ${data.name}`, {
          Name: data.name,
          Email: data.email,
          Message: data.message,
        });

        return json(request, { ok: true });
      },
    },
  },
});
