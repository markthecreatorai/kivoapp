import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface HealthStatus {
  service: string;
  status: "ok" | "degraded" | "down";
  latency_ms?: number;
  error?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const results: HealthStatus[] = [];

  // 1. Check Supabase DB
  const dbStart = Date.now();
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { error } = await supabase.from("workspaces").select("id").limit(1);
    results.push({
      service: "database",
      status: error ? "degraded" : "ok",
      latency_ms: Date.now() - dbStart,
      error: error?.message,
    });
  } catch (e: any) {
    results.push({ service: "database", status: "down", latency_ms: Date.now() - dbStart, error: e.message });
  }

  // 2. Check critical edge functions by pinging their OPTIONS
  const functions = ["create-payment", "webhook-pagarme", "track-event"];
  const baseUrl = Deno.env.get("SUPABASE_URL")!.replace("/rest/v1", "").replace("https://", "");
  const projectRef = baseUrl.split(".")[0];

  for (const fn of functions) {
    const fnStart = Date.now();
    try {
      const resp = await fetch(
        `https://${projectRef}.supabase.co/functions/v1/${fn}`,
        { method: "OPTIONS", signal: AbortSignal.timeout(5000) }
      );
      results.push({
        service: `fn:${fn}`,
        status: resp.ok || resp.status === 204 ? "ok" : "degraded",
        latency_ms: Date.now() - fnStart,
      });
    } catch (e: any) {
      results.push({
        service: `fn:${fn}`,
        status: "down",
        latency_ms: Date.now() - fnStart,
        error: e.message,
      });
    }
  }

  // 3. Overall status
  const hasDown = results.some(r => r.status === "down");
  const hasDegraded = results.some(r => r.status === "degraded");
  const overall = hasDown ? "down" : hasDegraded ? "degraded" : "ok";

  return new Response(
    JSON.stringify({ status: overall, checks: results, timestamp: new Date().toISOString() }),
    {
      status: overall === "down" ? 503 : 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});
