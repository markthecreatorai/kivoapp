// Shared guard for internal cron-triggered edge functions.
// Requires the X-Kivo-Cron-Secret header (legacy x-cron-secret also accepted)
// to match the CRON_SECRET project secret. Fails closed.

import { corsHeaders } from "./cors.ts";

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Returns null when the request is authorized, otherwise a Response to return
 * immediately from the handler.
 */
export function requireCronSecret(req: Request, fnName: string): Response | null {
  const expected = Deno.env.get("CRON_SECRET");
  if (!expected) {
    console.error(`[${fnName}] CRON_SECRET is not configured — failing closed`);
    return new Response(
      JSON.stringify({ error: "CRON_SECRET não configurado" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const provided =
    req.headers.get("x-kivo-cron-secret") || req.headers.get("x-cron-secret") || "";

  if (!provided || !timingSafeEqualStr(provided, expected)) {
    console.warn(`[${fnName}] unauthorized call — missing or invalid X-Kivo-Cron-Secret`);
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return null;
}
