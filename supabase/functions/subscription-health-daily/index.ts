import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth: CRON_SECRET only (no anon key fallback)
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret) {
    console.error("CRON_SECRET not configured");
    return new Response(JSON.stringify({ error: "Server misconfigured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const provided = req.headers.get("x-cron-secret") || "";
  if (provided !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // 1. Count by status
    const { data: allSubs } = await supabase
      .from("workspace_subscriptions")
      .select("id, status, workspace_id, provider_subscription_id, plan_code, last_event_at, canceled_at, created_at");

    const subs = allSubs || [];
    const active = subs.filter(s => s.status === "active").length;
    const pastDue = subs.filter(s => s.status === "past_due").length;
    const canceled = subs.filter(s => s.status === "canceled").length;
    const pending = subs.filter(s => s.status === "pending").length;
    const total = subs.length;

    // 2. Detect stale subscriptions (no webhook in 48h for active subs)
    const staleThreshold = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const staleSubs = subs.filter(s =>
      s.status === "active" && s.last_event_at && new Date(s.last_event_at) < new Date(staleThreshold)
    );

    // 3. Detect past_due > 7 days
    const criticalPastDue = subs.filter(s => {
      if (s.status !== "past_due") return false;
      if (!s.last_event_at) return true;
      return new Date(s.last_event_at) < new Date(Date.now() - 7 * 86400000);
    });

    // 4. Churn last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const recentCanceled = subs.filter(s =>
      s.status === "canceled" && s.canceled_at && new Date(s.canceled_at) >= new Date(sevenDaysAgo)
    ).length;

    // 5. Pending > 24h (stuck checkouts)
    const stuckPending = subs.filter(s => {
      if (s.status !== "pending") return false;
      return new Date(s.created_at) < new Date(Date.now() - 24 * 60 * 60 * 1000);
    });

    // 6. Reconciliation check
    const asaasApiKey = Deno.env.get("ASAAS_API_KEY");
    let reconcileFixes = 0;
    const divergences: any[] = [];

    if (asaasApiKey) {
      const activeSubs = subs.filter(s => s.status !== "canceled" && s.provider_subscription_id);
      for (const sub of activeSubs.slice(0, 50)) { // limit to 50 per run
        try {
          const res = await fetch(`https://api.asaas.com/v3/subscriptions/${sub.provider_subscription_id}`, {
            headers: { access_token: asaasApiKey },
          });
          if (!res.ok) continue;
          const asaasSub = await res.json();
          let expectedStatus: string;
          if (asaasSub.deleted || asaasSub.status === "INACTIVE") expectedStatus = "canceled";
          else if (asaasSub.status === "ACTIVE") expectedStatus = "active";
          else expectedStatus = sub.status;

          if (expectedStatus !== sub.status) {
            divergences.push({
              subscription_id: sub.id,
              workspace_id: sub.workspace_id,
              db_status: sub.status,
              asaas_status: expectedStatus,
            });
            // Auto-fix
            await supabase.from("workspace_subscriptions").update({
              status: expectedStatus,
              updated_at: new Date().toISOString(),
              ...(expectedStatus === "canceled" ? { canceled_at: new Date().toISOString() } : {}),
            }).eq("id", sub.id);
            reconcileFixes++;
          }
        } catch { /* skip individual errors */ }
      }
    }

    const report = {
      timestamp: new Date().toISOString(),
      totals: { total, active, past_due: pastDue, canceled, pending },
      churn_7d: recentCanceled,
      stale_subs: staleSubs.length,
      critical_past_due: criticalPastDue.length,
      stuck_pending: stuckPending.length,
      reconcile_fixes: reconcileFixes,
      divergences,
    };

    // 7. Alert via Telegram if thresholds breached
    const alerts: string[] = [];
    if (pastDue > 0 && pastDue / Math.max(active, 1) > 0.1) {
      alerts.push(`⚠️ Taxa past_due alta: ${pastDue}/${active} (${(pastDue / Math.max(active, 1) * 100).toFixed(1)}%)`);
    }
    if (criticalPastDue.length > 0) {
      alerts.push(`🚨 ${criticalPastDue.length} assinatura(s) past_due há +7 dias`);
    }
    if (stuckPending.length > 0) {
      alerts.push(`⏳ ${stuckPending.length} assinatura(s) travada(s) em pending há +24h`);
    }
    if (reconcileFixes > 2) {
      alerts.push(`🔧 Reconciliação corrigiu ${reconcileFixes} divergências`);
    }

    if (alerts.length > 0) {
      try {
        const telegramKey = Deno.env.get("TELEGRAM_API_KEY");
        const chatId = Deno.env.get("TELEGRAM_CHAT_ID");
        if (telegramKey && chatId) {
          const header = `📊 Subscription Health Daily\n${new Date().toISOString().split("T")[0]}`;
          const stats = `Active: ${active} | Past Due: ${pastDue} | Canceled: ${canceled} | Pending: ${pending}`;
          const msg = `${header}\n${stats}\n\n${alerts.join("\n")}`;

          const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
          const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";
          
          if (LOVABLE_API_KEY) {
            await fetch(`${GATEWAY_URL}/sendMessage`, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${LOVABLE_API_KEY}`,
                "X-Connection-Api-Key": telegramKey,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: "HTML" }),
            });
          } else {
            // Direct fallback
            await fetch(`https://api.telegram.org/bot${telegramKey}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chat_id: chatId, text: msg }),
            });
          }
        }
      } catch (e) {
        console.error("Telegram alert error:", e);
      }
    }

    // 8. Store report in audit_logs for admin dashboard
    await supabase.from("audit_logs").insert({
      workspace_id: "00000000-0000-0000-0000-000000000000", // system-level
      entity_type: "subscription_health",
      entity_id: "daily_report",
      action: "subscription_health_daily",
      metadata: report,
    });

    return new Response(JSON.stringify({ ok: true, report, alerts }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Health check error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
