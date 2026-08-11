import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
// Auditoria de execução (public.cron_runs): sem isso o cron_runs_sweep marca TIMEOUT.
import { startCronRun } from "../_shared/cron-run.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function getAsaasBase() {
  const env = Deno.env.get("ASAAS_ENV") || "sandbox";
  return env === "production"
    ? "https://api.asaas.com/v3"
    : "https://sandbox.asaas.com/api/v3";
}

async function asaasGet(path: string, apiKey: string) {
  const res = await fetch(`${getAsaasBase()}${path}`, {
    headers: { "access_token": apiKey },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Asaas GET ${path} failed [${res.status}]: ${body}`);
  }
  return await res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // ── Auth: require x-cron-secret header ──
  const cronSecret = Deno.env.get("CRON_SECRET");
  const providedSecret = req.headers.get("x-cron-secret");
  if (!cronSecret || providedSecret !== cronSecret) {
    console.warn("Unauthorized reconcile-asaas call — missing or invalid x-cron-secret");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const startedAt = Date.now();
  const cronRun = await startCronRun(req);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const asaasKey = Deno.env.get("ASAAS_API_KEY");
  const supabase = createClient(supabaseUrl, serviceKey);

  if (!asaasKey) {
    await cronRun.finish("FAILED", {}, "ASAAS_API_KEY not configured");
    return new Response(JSON.stringify({
      error: "ASAAS_API_KEY not configured",
      summary: { reconciled: 0, divergences_fixed: 0, manual_review: 0 },
    }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const now = new Date();
    const summary = {
      reconciled: 0,
      divergences_fixed: 0,
      manual_review: 0,
      errors: [] as string[],
    };

    // ── 1. Reconcile one-time payments (PENDING > 2h) ──
    const twoHoursAgo = new Date(now.getTime() - 2 * 3600000).toISOString();
    const { data: pendingPayments } = await supabase
      .from("payments")
      .select("id, order_id, gateway_payment_id, status, workspace_id, created_at")
      .eq("status", "PENDING")
      .lt("created_at", twoHoursAgo)
      .not("gateway_payment_id", "is", null)
      .limit(100);

    for (const payment of (pendingPayments || [])) {
      try {
        // Check if gateway_payment_id looks like Asaas (pay_xxx)
        if (!payment.gateway_payment_id?.startsWith("pay_")) {
          summary.reconciled++;
          continue;
        }

        const asaasPayment = await asaasGet(`/payments/${payment.gateway_payment_id}`, asaasKey);
        const asaasStatus = asaasPayment.status;

        // Map Asaas status → local status
        let newStatus: string | null = null;
        let orderStatus: string | null = null;

        if (asaasStatus === "CONFIRMED" || asaasStatus === "RECEIVED") {
          newStatus = "SUCCEEDED";
          orderStatus = "COMPLETED";
        } else if (asaasStatus === "OVERDUE" || asaasStatus === "REFUND_REQUESTED") {
          newStatus = "FAILED";
          orderStatus = "FAILED";
        } else if (asaasStatus === "REFUNDED") {
          newStatus = "REFUNDED";
          orderStatus = "REFUNDED";
        } else if (asaasStatus === "PENDING" || asaasStatus === "AWAITING_RISK_ANALYSIS") {
          // Still pending — skip
          summary.reconciled++;
          continue;
        }

        if (newStatus && newStatus !== payment.status) {
          // Fix divergence
          await supabase.from("payments").update({
            status: newStatus,
            processed_at: newStatus === "SUCCEEDED" ? now.toISOString() : undefined,
          }).eq("id", payment.id);

          if (orderStatus) {
            await supabase.from("orders").update({
              status: orderStatus,
              ...(orderStatus === "COMPLETED" ? { paid_at: now.toISOString() } : {}),
            }).eq("id", payment.order_id);
          }

          // Grant entitlements if payment succeeded
          if (newStatus === "SUCCEEDED") {
            const { data: orderItems } = await supabase
              .from("order_items")
              .select("product_id")
              .eq("order_id", payment.order_id);
            const { data: order } = await supabase
              .from("orders")
              .select("customer_id")
              .eq("id", payment.order_id)
              .single();

            if (order?.customer_id && orderItems) {
              for (const item of orderItems) {
                const { data: existing } = await supabase
                  .from("entitlements")
                  .select("id")
                  .eq("order_id", payment.order_id)
                  .eq("product_id", item.product_id)
                  .eq("customer_id", order.customer_id)
                  .maybeSingle();
                if (!existing) {
                  await supabase.from("entitlements").insert({
                    customer_id: order.customer_id,
                    product_id: item.product_id,
                    order_id: payment.order_id,
                  });
                }
              }
            }
          }

          // Audit log
          await supabase.from("audit_logs").insert({
            workspace_id: payment.workspace_id,
            entity_type: "payment",
            entity_id: payment.id,
            action: "reconciliation_fix",
            metadata: {
              previous_status: payment.status,
              new_status: newStatus,
              asaas_status: asaasStatus,
              gateway_payment_id: payment.gateway_payment_id,
            },
          });

          summary.divergences_fixed++;
          console.log(`Fixed payment ${payment.id}: ${payment.status} → ${newStatus} (Asaas: ${asaasStatus})`);
        } else {
          summary.reconciled++;
        }
      } catch (err: any) {
        console.error(`Error reconciling payment ${payment.id}:`, err.message);
        summary.errors.push(`payment:${payment.id}:${err.message}`);
        summary.manual_review++;
      }
    }

    // ── 2. Reconcile circle subscriptions ──
    const { data: activeSubs } = await supabase
      .from("circle_subscriptions")
      .select("id, provider_subscription_id, status, community_id, user_id, dunning_attempts")
      .in("status", ["active", "trialing", "past_due"])
      .eq("provider", "asaas")
      .not("provider_subscription_id", "is", null)
      .limit(100);

    for (const sub of (activeSubs || [])) {
      try {
        const asaasSub = await asaasGet(`/subscriptions/${sub.provider_subscription_id}`, asaasKey);
        const asaasStatus = asaasSub.status;

        let newLocalStatus: string | null = null;

        if (asaasStatus === "ACTIVE" && sub.status !== "active") {
          newLocalStatus = "active";
        } else if (asaasStatus === "INACTIVE" || asaasStatus === "EXPIRED") {
          if (sub.status !== "expired" && sub.status !== "canceled") {
            newLocalStatus = "expired";
          }
        }

        if (newLocalStatus) {
          await supabase.from("circle_subscriptions").update({
            status: newLocalStatus,
            ...(newLocalStatus === "active" ? { dunning_attempts: 0 } : {}),
          }).eq("id", sub.id);

          // Update member access
          if (newLocalStatus === "active") {
            await supabase.from("community_members").update({
              status: "ACTIVE",
            }).eq("community_id", sub.community_id).eq("user_id", sub.user_id);
          } else if (newLocalStatus === "expired") {
            await supabase.from("community_members").update({
              status: "LEFT",
            }).eq("community_id", sub.community_id).eq("user_id", sub.user_id).eq("role", "MEMBER");
          }

          await supabase.from("audit_logs").insert({
            workspace_id: sub.community_id, // best available
            entity_type: "circle_subscription",
            entity_id: sub.id,
            action: "reconciliation_fix",
            metadata: {
              previous_status: sub.status,
              new_status: newLocalStatus,
              asaas_status: asaasStatus,
            },
          });

          summary.divergences_fixed++;
          console.log(`Fixed subscription ${sub.id}: ${sub.status} → ${newLocalStatus}`);
        } else {
          summary.reconciled++;
        }
      } catch (err: any) {
        console.error(`Error reconciling subscription ${sub.id}:`, err.message);
        summary.errors.push(`subscription:${sub.id}:${err.message}`);
        summary.manual_review++;
      }
    }

    // ── 3. Alert if divergences found ──
    if (summary.divergences_fixed > 0 || summary.manual_review > 0) {
      try {
        const telegramKey = Deno.env.get("TELEGRAM_API_KEY");
        const chatId = Deno.env.get("TELEGRAM_CHAT_ID");
        if (telegramKey && chatId) {
          const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";
          const lovableKey = Deno.env.get("LOVABLE_API_KEY");

          const message = `🔄 *Reconciliação Asaas*\n\n✅ OK: ${summary.reconciled}\n🔧 Corrigidos: ${summary.divergences_fixed}\n⚠️ Revisão manual: ${summary.manual_review}\n${summary.errors.length > 0 ? `\n❌ Erros: ${summary.errors.slice(0, 3).join(", ")}` : ""}`;

          await fetch(`${GATEWAY_URL}/bot${telegramKey}/sendMessage`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(lovableKey ? {
                "Authorization": `Bearer ${lovableKey}`,
                "X-Connection-Api-Key": telegramKey,
              } : {}),
            },
            body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "Markdown" }),
          });
        }
      } catch (alertErr) {
        console.error("Alert send error (non-fatal):", alertErr);
      }
    }

    const durationMs = Date.now() - startedAt;
    console.log(JSON.stringify({
      event: "reconcile_complete",
      started_at: new Date(startedAt).toISOString(),
      finished_at: new Date().toISOString(),
      duration_ms: durationMs,
      status: "ok",
      reconciled: summary.reconciled,
      divergences_fixed: summary.divergences_fixed,
      manual_review: summary.manual_review,
    }));

    await cronRun.finish("SUCCESS", { ...summary, duration_ms: durationMs });
    return new Response(JSON.stringify({
      success: true,
      summary,
      timestamp: now.toISOString(),
      duration_ms: durationMs,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    const durationMs = Date.now() - startedAt;
    console.error(JSON.stringify({
      event: "reconcile_error",
      started_at: new Date(startedAt).toISOString(),
      finished_at: new Date().toISOString(),
      duration_ms: durationMs,
      status: "error",
      error: err.message,
    }));
    await cronRun.finish("FAILED", { duration_ms: durationMs }, err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
