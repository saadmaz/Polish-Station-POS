import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { z } from "zod";
import { preflight, json } from "@/server/public-api";

// Public, unauthenticated intake for the polishstation.lk newsletter signup.
// See src/routes/api.public.contact.ts for the pattern this follows, and
// src/server/public-api.ts for the shared CORS plumbing. No rate limit here
// (unlike contact/booking): the write below is an idempotent upsert keyed by
// email, so repeat submissions from the same address are harmless. No Resend
// alert either, a subscriber isn't an urgent inquiry the way a lead is.

const NewsletterSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  // Honeypot: always sent by the site, normally empty. Any non-empty value
  // means a bot bypassed the client-side check and posted directly.
  company: z.string().trim().max(200).optional().default(""),
});

export const Route = createFileRoute("/api/public/newsletter")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => preflight(request),
      POST: async ({ request }) => {
        let data: z.infer<typeof NewsletterSchema>;
        try {
          data = NewsletterSchema.parse(await request.json());
        } catch {
          return json(request, { ok: false, error: "Please enter a valid email address." });
        }

        // Bot caught by the honeypot: pretend it worked so it never learns
        // its submission was flagged, but don't write anything.
        if (data.company) return json(request, { ok: true });

        try {
          const { adminDb } = await import("@/server/firebase-admin");
          await adminDb.collection("newsletterSubscribers").doc(data.email).set(
            {
              id: data.email,
              email: data.email,
              status: "subscribed",
              source: "polishstation.lk",
              subscribedAt: new Date().toISOString(),
            },
            { merge: true },
          );
        } catch (err) {
          console.error("[api.public.newsletter] Firestore write failed:", err);
          return json(request, {
            ok: false,
            error: "Something went wrong — please try again shortly.",
          });
        }

        return json(request, { ok: true });
      },
    },
  },
});
