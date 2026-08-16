// Shared plumbing for the public, unauthenticated intake endpoints
// (src/routes/api.public.*.ts) that receive contact/newsletter/booking
// submissions from the separate marketing site (polishstation.lk, a static
// Vite build with no backend of its own). Same spirit as createBookingFn in
// src/server/bookings.ts — Zod validation in each route, Admin SDK writes
// that bypass firestore.rules, an in-memory best-effort rate limiter — but
// these are plain HTTP routes rather than TanStack Start server functions,
// because they're called cross-origin from a different domain and need real
// CORS handling, not same-origin RPC.

// Origins allowed to call these endpoints. Access-Control-Allow-Origin
// cannot be a wildcard list, so a matching request origin is echoed back;
// anything else gets no ACAO header at all, which is what makes the browser
// block the response client-side.
const ALLOWED_ORIGINS = new Set([
  "https://polishstation.lk",
  "https://www.polishstation.lk",
  "http://localhost:5173", // local dev of the marketing site against this deployed API
]);

export function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

/** Handles the browser's automatic CORS preflight for a cross-origin JSON POST. */
export function preflight(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) });
}

/** JSON response that always carries the CORS headers for the request's origin. */
export function json(request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request.headers.get("origin")),
      "Content-Type": "application/json",
    },
  });
}

// Shown verbatim to a real customer on a failed submission, so it stays
// short and human, never technical.
export const GENERIC_ERROR = "Too many requests — please try again shortly or WhatsApp us instead.";

/**
 * Sliding-window rate limiter, same shape as bookings.ts's isRateLimited:
 * in-memory, per-process, resets on a cold start. Good enough to stop a
 * casual script; not a substitute for a CDN/WAF-level limiter.
 */
export function createRateLimiter(windowMs: number, max: number) {
  const recentByKey = new Map<string, number[]>();
  return function isRateLimited(key: string): boolean {
    const now = Date.now();
    const hits = (recentByKey.get(key) ?? []).filter((t) => now - t < windowMs);
    hits.push(now);
    recentByKey.set(key, hits);
    return hits.length > max;
  };
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/**
 * Best-effort email alert to the studio's inbox via Resend. Never throws:
 * the Firestore write it follows has already succeeded, so a missed email
 * must not make the customer's submission look like it failed. Silently
 * skips if RESEND_API_KEY / LEADS_NOTIFY_EMAIL aren't configured.
 */
export async function sendLeadAlert(
  subject: string,
  fields: Record<string, string>,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.LEADS_NOTIFY_EMAIL;
  if (!apiKey || !to) return;

  const rows = Object.entries(fields)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0"><b>${escapeHtml(k)}</b></td><td>${escapeHtml(v)}</td></tr>`,
    )
    .join("");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Polish Station Leads <leads@alerts.polishstation.lk>",
        to: [to],
        subject,
        html: `<table>${rows}</table>`,
      }),
    });
    if (!res.ok) {
      console.error(`[public-api] Resend alert failed: ${res.status} ${await res.text()}`);
    }
  } catch (err) {
    console.error("[public-api] Resend alert error:", err);
  }
}
