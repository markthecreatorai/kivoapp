import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

async function sendTelegramAlert(message: string, severity: string) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");
  const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID");

  if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY || !TELEGRAM_CHAT_ID) {
    console.log("Telegram not configured, skipping external alert");
    return false;
  }

  const emoji = severity === "critical" ? "🔴" : "⚠️";
  const text = `${emoji} <b>KIVO Ops Alert</b>\n\n<b>Severidade:</b> ${severity.toUpperCase()}\n<b>Mensagem:</b> ${message}\n<b>Hora:</b> ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`;

  try {
    const response = await fetch(`${GATEWAY_URL}/sendMessage`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": TELEGRAM_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: "HTML",
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error(`Telegram send failed [${response.status}]: ${err}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error("Telegram send error:", e);
    return false;
  }
}

async function createAlert(
  supabase: any,
  alertType: string,
  alertKey: string,
  message: string,
  severity: string
): Promise<boolean> {
  const { data: existing } = await supabase
    .from("ops_alert_log")
    .select("id")
    .eq("alert_type", alertType)
    .eq("alert_key", alertKey)
    .maybeSingle();

  if (existing) return false;

  // Send external notification
  const notified = await sendTelegramAlert(message, severity);

  await supabase.from("ops_alert_log").insert({
    alert_type: alertType,
    alert_key: alertKey,
    message,
    severity,
    notified_externally: notified,
    external_channel: notified ? "telegram" : null,
  });

  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const results = { checked: 0, alerts_created: 0, notified_externally: 0 };

  try {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const hourKey = new Date().toISOString().slice(0, 13); // dedup by hour

    // 1) Payment failure rate
    const [failedRes, totalRes] = await Promise.all([
      supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "FAILED").gte("created_at", thirtyMinAgo),
      supabase.from("orders").select("id", { count: "exact", head: true }).gte("created_at", thirtyMinAgo),
    ]);

    const failed = failedRes.count || 0;
    const total = totalRes.count || 0;
    const failRate = total > 10 ? (failed / total) * 100 : 0;
    results.checked = total;

    if (failRate > 8) {
      const created = await createAlert(
        supabase,
        "payment_failure_rate",
        `payment_fail_${hourKey}`,
        `Taxa de falha de pagamento alta: ${failRate.toFixed(1)}% (${failed}/${total} nos últimos 30min)`,
        failRate > 20 ? "critical" : "warning"
      );
      if (created) results.alerts_created++;
    }

    // 2) Dead-letter webhooks
    const { count: deadLetterCount } = await supabase
      .from("webhook_delivery_log")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed")
      .gte("created_at", thirtyMinAgo);

    if ((deadLetterCount || 0) > 0) {
      const created = await createAlert(
        supabase,
        "webhook_dead_letter",
        `dead_letter_${hourKey}`,
        `${deadLetterCount} webhook(s) em dead-letter nos últimos 30min`,
        "critical"
      );
      if (created) results.alerts_created++;
    }

    // 3) Health check
    const baseUrl = Deno.env.get("SUPABASE_URL")!;
    try {
      const healthResp = await fetch(`${baseUrl}/functions/v1/health-check`, {
        headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}` },
        signal: AbortSignal.timeout(10000),
      });
      const healthData = await healthResp.json();
      if (healthData.status === "down" || healthData.status === "degraded") {
        const downServices = (healthData.checks || [])
          .filter((c: any) => c.status !== "ok")
          .map((c: any) => c.service)
          .join(", ");
        const created = await createAlert(
          supabase,
          "health_check",
          `health_${healthData.status}_${hourKey}`,
          `Sistema ${healthData.status}: ${downServices || "serviços degradados"}`,
          healthData.status === "down" ? "critical" : "warning"
        );
        if (created) results.alerts_created++;
      }
    } catch {
      // Health check unreachable — create alert
      const created = await createAlert(
        supabase,
        "health_check",
        `health_unreachable_${hourKey}`,
        "Health check não respondeu (timeout 10s)",
        "critical"
      );
      if (created) results.alerts_created++;
    }

    // 4) Recurring critical errors (email failures)
    const { count: emailFailCount } = await supabase
      .from("email_logs")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed")
      .gte("created_at", thirtyMinAgo);

    if ((emailFailCount || 0) >= 5) {
      const created = await createAlert(
        supabase,
        "recurring_email_failures",
        `email_fail_${hourKey}`,
        `${emailFailCount} falhas de email nos últimos 30min`,
        "warning"
      );
      if (created) results.alerts_created++;
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
