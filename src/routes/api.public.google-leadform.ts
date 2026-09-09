import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { z } from "zod";
import { sendLeadAlert } from "@/server/public-api";

// Google Ads "Lead Form" asset webhook delivery. Unlike the other
// api.public.*.ts routes, this is a server-to-server POST straight from
// Google's infra -- no browser origin, so no CORS handling and no honeypot
// (the shared secret below is the anti-spoofing measure instead). Payload
// shape, the google_key check, response codes, and lead_id-based dedup are
// all Google's contract, not ours:
// https://developers.google.com/google-ads/webhook/docs/implementation
//
// Configure in Google Ads: the Lead form asset's delivery options ->
// Webhook integration -> this route's full URL + a secret key, which must
// match GOOGLE_ADS_LEAD_WEBHOOK_KEY in this app's env. See
// docs/lead-lifecycle.md for the end-to-end setup procedure.

const ColumnSchema = z.object({
  column_id: z.string(),
  column_name: z.string().optional(),
  string_value: z.string().optional(),
});

const WebhookSchema = z.object({
  lead_id: z.string().min(1),
  google_key: z.string().min(1),
  is_test: z.boolean().optional().default(false),
  user_column_data: z.array(ColumnSchema).default([]),
});

function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function column(data: z.infer<typeof ColumnSchema>[], id: string): string | undefined {
  return data.find((c) => c.column_id === id)?.string_value?.trim() || undefined;
}

export const Route = createFileRoute("/api/public/google-leadform")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let data: z.infer<typeof WebhookSchema>;
        try {
          data = WebhookSchema.parse(await request.json());
        } catch {
          return reply(400, { message: "Malformed payload" });
        }

        const expectedKey = process.env.GOOGLE_ADS_LEAD_WEBHOOK_KEY;
        if (!expectedKey || data.google_key !== expectedKey) {
          return reply(401, { message: "Invalid webhook key" });
        }

        const name = column(data.user_column_data, "FULL_NAME");
        const phone = column(data.user_column_data, "PHONE_NUMBER");
        const email = column(data.user_column_data, "EMAIL");
        // Anything beyond the three standard fields above is a custom
        // question -- fold those into `message` since Lead has no
        // dedicated field for arbitrary form questions.
        const extras = data.user_column_data
          .filter((c) => !["FULL_NAME", "PHONE_NUMBER", "EMAIL"].includes(c.column_id))
          .map((c) => `${c.column_name ?? c.column_id}: ${c.string_value ?? ""}`)
          .join("\n");

        try {
          const { adminDb } = await import("@/server/firebase-admin");
          // Deterministic doc id from Google's lead_id: Google redelivers on
          // any non-2xx/timeout, so a retry of a lead we already stored must
          // be a no-op, not a duplicate or an overwrite of staff edits.
          const docId = `glf_${data.lead_id}`;
          await adminDb
            .collection("leads")
            .doc(docId)
            .create({
              id: docId,
              type: "contact",
              name: name || "Google Ads lead",
              status: "new",
              source: "google_ads",
              isTest: data.is_test,
              createdAt: new Date().toISOString(),
              ...(email ? { email } : {}),
              ...(phone ? { phoneRaw: phone } : {}),
              ...(extras ? { message: extras } : {}),
            });
        } catch (err) {
          if ((err as { code?: number }).code === 6 /* ALREADY_EXISTS */) {
            return reply(200, {});
          }
          console.error("[api.public.google-leadform] Firestore write failed:", err);
          return reply(500, { message: "Temporary error, please retry" });
        }

        if (!data.is_test) {
          await sendLeadAlert(`New Google Ads lead: ${name || "Unknown"}`, {
            Name: name ?? "—",
            Phone: phone ?? "—",
            Email: email ?? "—",
          });
        }

        return reply(200, {});
      },
    },
  },
});
