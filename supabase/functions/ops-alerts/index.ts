import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const results = { checked: 0, alerts_created: 0 };

  try {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    // Check payment failure rate
    const [failedRes, totalRes] = await Promise.all([
      supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "FAILED").gte("created_at", thirtyMinAgo),
      supabase.from("orders").select("id", { count: "exact", head: true }).gte("created_at", thirtyMinAgo),
    ]);

    const failed = failedRes.count || 0;
    const total = totalRes.count || 0;
    const failRate = total > 10 ? (failed / total) * 100 : 0;
    results.checked = total;

    if (failRate > 8) {
      const alertKey = `payment_fail_${new Date().toISOString().slice(0, 13)}`;
      const { data: existing } = await supabase
        .from("ops_alert_log")
        .select("id")
        .eq("alert_type", "payment_failure_rate")
        .eq("alert_key", alertKey)
        .maybeSingle();

      if (!existing) {
        await supabase.from("ops_alert_log").insert({
          alert_type: "payment_failure_rate",
          alert_key: alertKey,
          message: `Taxa de falha de pagamento alta: ${failRate.toFixed(1)}% (${failed}/${total} nos últimos 30min)`,
          severity: failRate > 20 ? "critical" : "warning",
        });
        results.alerts_created++;
      }
    }

    // Check dead-letter webhooks
    const { count: deadLetterCount } = await supabase
      .from("webhook_delivery_log")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed")
      .gte("created_at", thirtyMinAgo);

    if ((deadLetterCount || 0) > 0) {
      const alertKey = `dead_letter_${new Date().toISOString().slice(0, 13)}`;
      const { data: existing } = await supabase
        .from("ops_alert_log")
        .select("id")
        .eq("alert_type", "webhook_dead_letter")
        .eq("alert_key", alertKey)
        .maybeSingle();

      if (!existing) {
        await supabase.from("ops_alert_log").insert({
          alert_type: "webhook_dead_letter",
          alert_key: alertKey,
          message: `${deadLetterCount} webhook(s) em dead-letter nos últimos 30min`,
          severity: "critical",
        });
        results.alerts_created++;
      }
    }

    // Check health status
    const baseUrl = Deno.env.get("SUPABASE_URL")!;
    try {
      const healthResp = await fetch(`${baseUrl}/functions/v1/health-check`, {
        headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}` },
        signal: AbortSignal.timeout(10000),
      });
      const healthData = await healthResp.json();
      if (healthData.status === "down" || healthData.status === "degraded") {
        const alertKey = `health_${healthData.status}_${new Date().toISOString().slice(0, 13)}`;
        const { data: existing } = await supabase
          .from("ops_alert_log")
          .select("id")
          .eq("alert_type", "health_check")
          .eq("alert_key", alertKey)
          .maybeSingle();

        if (!existing) {
          const downServices = (healthData.checks || [])
            .filter((c: any) => c.status !== "ok")
            .map((c: any) => c.service)
            .join(", ");
          await supabase.from("ops_alert_log").insert({
            alert_type: "health_check",
            alert_key: alertKey,
            message: `Sistema ${healthData.status}: ${downServices || "serviços degradados"}`,
            severity: healthData.status === "down" ? "critical" : "warning",
          });
          results.alerts_created++;
        }
      }
    } catch {
      // Health check unreachable
    }

    return new Response(JSON.stringify({ ok: true, ...results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message?.slice(0, 200) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
