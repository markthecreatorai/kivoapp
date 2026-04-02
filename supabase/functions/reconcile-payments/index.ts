import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PAGARME_BASE = "https://api.pagar.me/core/v5";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // Get all workspaces with Pagar.me configured
    const { data: workspaces } = await supabase
      .from("workspaces")
      .select("id, metadata")
      .not("metadata", "is", null);

    const report: any[] = [];

    for (const ws of workspaces || []) {
      const meta = (ws.metadata as Record<string, unknown>) || {};
      const apiKey = meta.pagarme_api_key as string;
      if (!apiKey) continue;

      // Find pending payments older than 2 hours for this workspace
      const cutoff = new Date(Date.now() - 2 * 3600000).toISOString();
      const { data: pendingPayments } = await supabase
        .from("payments")
        .select("id, order_id, gateway_payment_id, status, method, amount, created_at")
        .eq("workspace_id", ws.id)
        .eq("status", "PENDING")
        .lt("created_at", cutoff)
        .not("gateway_payment_id", "is", null)
        .limit(50);

      if (!pendingPayments || pendingPayments.length === 0) continue;

      for (const payment of pendingPayments) {
        // Skip simulated payments
        if (payment.gateway_payment_id?.startsWith("sim_")) continue;

        try {
          // Query Pagar.me for actual status
          const res = await fetch(`${PAGARME_BASE}/charges/${payment.gateway_payment_id}`, {
            headers: {
              Authorization: `Basic ${btoa(apiKey + ":")}`,
            },
          });

          if (!res.ok) {
            console.warn(`Pagar.me query failed for charge ${payment.gateway_payment_id}: ${res.status}`);
            continue;
          }

          const chargeData = await res.json();
          const gatewayStatus = chargeData.status;

          let newStatus: string | null = null;
          if (gatewayStatus === "paid") newStatus = "SUCCEEDED";
          else if (gatewayStatus === "failed" || gatewayStatus === "refused") newStatus = "FAILED";
          else if (gatewayStatus === "canceled" || gatewayStatus === "voided") newStatus = "CANCELED";
          else if (gatewayStatus === "refunded") newStatus = "REFUNDED";

          if (newStatus && newStatus !== payment.status) {
            // Update payment
            await supabase.from("payments").update({
              status: newStatus,
              processed_at: newStatus === "SUCCEEDED" ? new Date().toISOString() : undefined,
              failed_at: newStatus === "FAILED" ? new Date().toISOString() : undefined,
            }).eq("id", payment.id);

            // Update order
            const orderStatus = newStatus === "SUCCEEDED" ? "COMPLETED"
              : newStatus === "FAILED" ? "FAILED"
              : newStatus === "CANCELED" ? "CANCELED"
              : newStatus === "REFUNDED" ? "REFUNDED" : null;

            if (orderStatus) {
              await supabase.from("orders").update({
                status: orderStatus,
                paid_at: orderStatus === "COMPLETED" ? new Date().toISOString() : undefined,
              }).eq("id", payment.order_id);
            }

            // If paid, grant entitlements
            if (newStatus === "SUCCEEDED") {
              const { data: order } = await supabase
                .from("orders")
                .select("customer_id")
                .eq("id", payment.order_id)
                .single();
              const { data: items } = await supabase
                .from("order_items")
                .select("product_id")
                .eq("order_id", payment.order_id);

              if (order?.customer_id && items) {
                for (const item of items) {
                  const { data: exists } = await supabase
                    .from("entitlements")
                    .select("id")
                    .eq("order_id", payment.order_id)
                    .eq("product_id", item.product_id)
                    .eq("customer_id", order.customer_id)
                    .maybeSingle();
                  if (!exists) {
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
              workspace_id: ws.id,
              entity_type: "payment",
              entity_id: payment.id,
              action: "reconciliation_fix",
              metadata: {
                old_status: payment.status,
                new_status: newStatus,
                gateway_status: gatewayStatus,
                order_id: payment.order_id,
              },
            });

            report.push({
              payment_id: payment.id,
              order_id: payment.order_id,
              old_status: payment.status,
              new_status: newStatus,
              gateway_status: gatewayStatus,
            });
          }
        } catch (chargeErr) {
          console.error(`Reconcile error for payment ${payment.id}:`, chargeErr);
        }
      }
    }

    console.log(`Reconciliation complete: ${report.length} fixes applied`);

    return new Response(JSON.stringify({
      fixes: report.length,
      details: report,
      ran_at: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Reconciliation error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
