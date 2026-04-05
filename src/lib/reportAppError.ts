/**
 * Central error reporting — structured console.error,
 * ready for Sentry/Logtail integration.
 */
export interface AppErrorPayload {
  message: string;
  stack?: string;
  route?: string;
  timestamp?: string;
  context?: string;
  componentStack?: string;
}

export function reportAppError(payload: AppErrorPayload): void {
  const enriched = {
    ...payload,
    route: payload.route || window.location.pathname,
    timestamp: payload.timestamp || new Date().toISOString(),
    userAgent: navigator.userAgent,
  };

  console.error("[AppError]", enriched);

  // Future: send to Sentry, Logtail, etc.
  // fetch("/api/errors", { method: "POST", body: JSON.stringify(enriched) });
}
