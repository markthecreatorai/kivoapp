// Simple IP/key based rate limiter backed by public.rate_limit_log.
// Not a platform primitive — ad-hoc control to stop brute force / cost abuse.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export function getClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
}

/**
 * Counts hits for `key` on `endpoint` within the window and records the hit.
 * Fails open on infrastructure errors (never blocks legit traffic on DB issues).
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  endpoint: string,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const since = new Date(Date.now() - windowSeconds * 1000).toISOString();

  const { count, error } = await supabase
    .from("rate_limit_log")
    .select("id", { count: "exact", head: true })
    .eq("endpoint", endpoint)
    .eq("ip_address", key)
    .gte("created_at", since);

  if (error) {
    console.error(`[rate-limit] check failed for ${endpoint}:`, error.message);
    return { allowed: true, count: 0, limit };
  }

  const hits = count ?? 0;
  if (hits >= limit) return { allowed: false, count: hits, limit };

  const { error: insertErr } = await supabase
    .from("rate_limit_log")
    .insert({ endpoint, ip_address: key });
  if (insertErr) console.error(`[rate-limit] insert failed for ${endpoint}:`, insertErr.message);

  return { allowed: true, count: hits + 1, limit };
}
