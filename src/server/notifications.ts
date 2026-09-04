"use server";
// Real, staff-initiated customer-facing email: the ONE surviving toggle from
// what used to be a five-toggle, entirely-fake NotifyPanel (SMS/WhatsApp-
// photos/marketing-email all removed -- no provider or capability backs any
// of them anywhere in this codebase; see src/routes/_app.settings.tsx).
// Reuses the same Resend account already proven working for internal lead
// alerts (src/server/public-api.ts's sendLeadAlert), same verified sending
// domain, just a different recipient and body. Staff-initiated, same as the
// existing WhatsApp/SMS deep-links in src/routes/_app.notifications.tsx --
// NOT automatic-on-event, so there's no webhook/delivery-status pipeline
// here: this records that the send request was accepted by Resend, never
// that it was delivered. Don't overload this into claiming delivery.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireCaller } from "./staff-admin";
import { withTimeout } from "./retry";
import { formatCurrency } from "@/lib/currency";

export const getEmailProviderStatusFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ configured: boolean }> => ({ configured: !!process.env.RESEND_API_KEY }),
);

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

const SendReceiptEmailSchema = z.object({
  idToken: z.string().min(1),
  toEmail: z.string().trim().email(),
  customerName: z.string().trim().min(1).max(100),
  invoiceId: z.string().trim().min(1).max(40),
  total: z.number().nonnegative(),
  lines: z
    .array(
      z.object({
        name: z.string().max(200),
        qty: z.number(),
        unitPrice: z.number(),
        discount: z.number(),
      }),
    )
    .max(50),
});

export type SendReceiptEmailResult =
  { success: true } | { success: false; error: "unauthorized" | "not_configured" | "send_failed" };

export const sendReceiptEmailFn = createServerFn({ method: "POST" })
  .validator((raw: unknown) => SendReceiptEmailSchema.parse(raw))
  .handler(async ({ data }): Promise<SendReceiptEmailResult> => {
    // Any active staff member, same as the ungated WhatsApp review-request
    // send already in POS -- this isn't a settings-module action, it's a
    // per-sale action available to whoever can already see the checkout.
    const caller = await requireCaller(data.idToken);
    if (!caller) return { success: false, error: "unauthorized" };

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return { success: false, error: "not_configured" };

    const rows = data.lines
      .map((l) => {
        const lineTotal = l.qty * l.unitPrice - l.discount;
        return `<tr><td style="padding:4px 12px 4px 0">${escapeHtml(l.name)}</td><td style="padding:4px 12px" align="right">${l.qty}</td><td style="padding:4px 0" align="right">${formatCurrency(lineTotal)}</td></tr>`;
      })
      .join("");
    const html = `
      <p>Hi ${escapeHtml(data.customerName)},</p>
      <p>Thanks for visiting Polish Station. Here's your receipt for <strong>${escapeHtml(data.invoiceId)}</strong>:</p>
      <table>${rows}</table>
      <p style="margin-top:12px"><strong>Total: ${formatCurrency(data.total)}</strong></p>
    `;

    try {
      const res = await withTimeout(
        fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "Polish Station <receipts@alerts.polishstation.lk>",
            to: [data.toEmail],
            subject: `Your receipt · ${data.invoiceId}`,
            html,
          }),
        }),
        15_000,
        "resend receipt send",
      );
      if (!res.ok) {
        console.error(`[notifications] receipt email failed: ${res.status} ${await res.text()}`);
        return { success: false, error: "send_failed" };
      }
    } catch (err) {
      console.error("[notifications] receipt email error:", err);
      return { success: false, error: "send_failed" };
    }

    return { success: true };
  });
