// Error reporting — active only when VITE_SENTRY_DSN is set in .env.
// Without a DSN the functions are no-ops that log to console, so the app
// works in any environment without a Sentry account.

import * as Sentry from "@sentry/react";

export function initErrorReporting(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn || typeof window === "undefined") return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE ?? "production",
    // Capture 10 % of transactions for performance monitoring
    tracesSampleRate: 0.1,
    ignoreErrors: [
      // Browser quirks — not actionable
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      /^Loading chunk \d+ failed/,
      /^Failed to fetch dynamically imported module/,
    ],
  });
}

export function reportError(error: unknown, context: Record<string, unknown> = {}): void {
  if (import.meta.env.VITE_SENTRY_DSN) {
    Sentry.captureException(error, { extra: context });
  } else {
    console.error("[error]", error, context);
  }
}
