// Centralized CORS policy for Kivo edge functions.
// Only the production domain (and Lovable preview hosts, used for QA) are allowed.
// Gateway webhooks are server-to-server and must NOT use these helpers.

export const PRODUCTION_ORIGIN = "https://kivohub.com.br";

const ALLOWED_ORIGINS = [
  PRODUCTION_ORIGIN,
  "https://www.kivohub.com.br",
];

const ALLOWED_ORIGIN_SUFFIXES = [
  ".lovable.app",
  ".lovableproject.com",
];

const ALLOW_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-kivo-cron-secret, x-kivo-internal-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version";

export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    const host = new URL(origin).hostname;
    return ALLOWED_ORIGIN_SUFFIXES.some((s) => host.endsWith(s));
  } catch {
    return false;
  }
}

/** Static headers, for internal/cron functions that are never called from a browser. */
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": PRODUCTION_ORIGIN,
  "Access-Control-Allow-Headers": ALLOW_HEADERS,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
};

/** Per-request headers: echoes the origin only when it is allowlisted. */
export function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin! : PRODUCTION_ORIGIN,
    "Access-Control-Allow-Headers": ALLOW_HEADERS,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}
