import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Simple in-memory rate limit (per isolate)
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW = 60_000; // 1 min
const RATE_LIMIT_MAX = 60; // 60 req/min per IP

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (rateLimitMap.get(ip) || []).filter(t => now - t < RATE_LIMIT_WINDOW);
  if (timestamps.length >= RATE_LIMIT_MAX) return true;
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  // Cleanup old IPs periodically
  if (rateLimitMap.size > 10000) {
    for (const [k, v] of rateLimitMap) {
      if (v.every(t => now - t > RATE_LIMIT_WINDOW)) rateLimitMap.delete(k);
    }
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  if (isRateLimited(clientIp)) {
    return new Response(JSON.stringify({ error: "Rate limited", retryable: true }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const {
      event_name,
      workspace_id,
      session_id,
      event_props,
      utm_source,
      utm_medium,
      utm_campaign,
      page_path,
    } = body;

    // Input validation
    if (!event_name || typeof event_name !== "string") {
      return new Response(JSON.stringify({ error: "event_name required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (event_name.length > 100) {
      return new Response(JSON.stringify({ error: "event_name too long" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Sanitize and truncate inputs
    const sanitize = (v: unknown, max = 255): string | null => {
      if (!v || typeof v !== "string") return null;
      return v.slice(0, max);
    };

    const { error } = await supabase.from("analytics_events").insert({
      event_type: event_name.slice(0, 100),
      workspace_id: sanitize(workspace_id, 36) || null,
      visitor_id: sanitize(session_id, 100) || null,
      metadata: event_props && typeof event_props === "object" ? event_props : null,
      page_path: sanitize(page_path) || null,
      referrer: utm_source ? `${sanitize(utm_source, 50)}/${sanitize(utm_medium, 50) || ""}/${sanitize(utm_campaign, 50) || ""}` : null,
      user_agent: req.headers.get("user-agent")?.slice(0, 500) || null,
    });

    if (error) {
      // Mask potentially sensitive data in logs
      console.error("Insert error:", JSON.stringify({ code: error.code, message: error.message, event_name }));
      return new Response(JSON.stringify({ error: "Failed to track event" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Track event error:", JSON.stringify({ message: err.message?.slice(0, 200) }));
    return new Response(JSON.stringify({ error: "Internal error", retryable: true }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
