import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, asaas-access-token",
};

const MAX_ATTEMPTS = 5;
const RETRY_DELAYS = [60, 300, 900, 3600, 7200];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);
  const webhookToken = Deno.env.get("ASAAS_WEBHOOK_TOKEN");

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
  }

  // Token validation (Asaas sends token in header or query param)
  if (webhookToken) {
    const headerToken = req.headers.get("asaas-access-token") || "";
    if (headerToken !== webhookToken) {
      console.error("Invalid Asaas webhook token");
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }
  } else {
    console.warn("ASAAS_WEBHOOK_TOKEN not set — skipping token validation");
  }

  const eventType = payload?.event || "unknown";
  const paymentData = payload?.payment;
  const externalEventId = paymentData?.id || payload?.id || crypto.randomUUID();

  // Idempotency check
  const { data: existingEvent } = await supabase
    .from("webhook_events")
    .select("id, status")
    .eq("provider", "ASAAS")
    .eq("external_event_id", String(externalEventId))
    .eq("event_type", eventType)
    .maybeSingle();

  if (existingEvent?.status === "PROCESSED") {
    return new Response(JSON.stringify({ ok: true, duplicate: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Find payment record by externalReference (our order_id) or gateway_payment_id
  let paymentRecord: any = null;
  const gatewayPaymentId = paymentData?.id;
  const externalReference = paymentData?.externalReference;

  if (externalReference) {
    const { data } = await supabase
      .from("payments")
      .select("id, order_id, workspace_id, status")
      .eq("order_id", externalReference)
      .maybeSingle();
    paymentRecord = data;
  }
  if (!paymentRecord && gatewayPaymentId) {
    const { data } = await supabase
      .from("payments")
      .select("id, order_id, workspace_id, status")
      .eq("gateway_payment_id", String(gatewayPaymentId))
      .maybeSingle();
    paymentRecord = data;
  }

  const statusBefore = paymentRecord?.status || null;

  // Save webhook event
  const webhookInsert: any = {
    provider: "ASAAS",
    event_type: eventType,
    external_event_id: String(externalEventId),
    payload,
    status: "RECEIVED",
    workspace_id: paymentRecord?.workspace_id || null,
    order_id: paymentRecord?.order_id || null,
    status_before: statusBefore,
    attempts: existingEvent ? (existingEvent as any).attempts + 1 : 1,
  };

  let webhookEventId: string;
  if (existingEvent) {
    await supabase.from("webhook_events").update({
      status: "RECEIVED",
      attempts: webhookInsert.attempts,
      last_attempt_at: new Date().toISOString(),
    }).eq("id", existingEvent.id);
    webhookEventId = existingEvent.id;
  } else {
    const { data: we } = await supabase
      .from("webhook_events")
      .insert(webhookInsert)
      .select("id")
      .single();
    if (!we) {
      return new Response(JSON.stringify({ ok: false }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    webhookEventId = we.id;
  }

  try {
    let statusAfter: string | null = null;

    // ── Asaas event mapping ──
    // PAYMENT_CONFIRMED / PAYMENT_RECEIVED → paid
    // PAYMENT_OVERDUE / PAYMENT_FAILED → failed
    // PAYMENT_REFUNDED / PAYMENT_REFUND_IN_PROGRESS → refunded
    // PAYMENT_DELETED → canceled
    // PAYMENT_CHARGEBACK_REQUESTED → chargeback

    if (eventType === "PAYMENT_CONFIRMED" || eventType === "PAYMENT_RECEIVED") {
      statusAfter = await handlePaid(supabase, paymentRecord, paymentData);
    } else if (eventType === "PAYMENT_OVERDUE" || eventType === "PAYMENT_FAILED") {
      statusAfter = await handleFailed(supabase, paymentRecord, paymentData);
    } else if (eventType === "PAYMENT_REFUNDED" || eventType === "PAYMENT_REFUND_IN_PROGRESS") {
      statusAfter = await handleRefunded(supabase, paymentRecord, paymentData);
    } else if (eventType === "PAYMENT_DELETED") {
      statusAfter = await handleCanceled(supabase, paymentRecord);
    } else if (eventType === "PAYMENT_CHARGEBACK_REQUESTED") {
      statusAfter = await handleChargeback(supabase, paymentRecord, paymentData);
    }
    // ── Subscription events ──
    else if (eventType === "PAYMENT_CREATED" && paymentData?.subscription) {
      // Subscription invoice created — ignore for now
      statusAfter = "SUBSCRIPTION_INVOICE_CREATED";
    }
    // Subscription payment confirmed → reactivate circle subscription
    else if ((eventType === "PAYMENT_CONFIRMED" || eventType === "PAYMENT_RECEIVED") && paymentData?.subscription) {
      statusAfter = await handleSubscriptionPaid(supabase, paymentData);
    }
    else {
      console.log(`Unhandled Asaas event: ${eventType}`);
    }

    await supabase.from("webhook_events").update({
      status: "PROCESSED",
      processed_at: new Date().toISOString(),
      status_after: statusAfter,
      error_message: null,
    }).eq("id", webhookEventId);

  } catch (err) {
    console.error("Webhook processing error:", err);
    const currentAttempts = webhookInsert.attempts;
    const isDeadLetter = currentAttempts >= MAX_ATTEMPTS;
    const nextRetryAt = isDeadLetter
      ? null
      : new Date(Date.now() + (RETRY_DELAYS[currentAttempts - 1] || 7200) * 1000).toISOString();

    await supabase.from("webhook_events").update({
      status: isDeadLetter ? "DEAD_LETTER" : "FAILED",
      error_message: err.message || "Unknown error",
      next_retry_at: nextRetryAt,
      last_attempt_at: new Date().toISOString(),
    }).eq("id", webhookEventId);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

// ─── Event Handlers ───

async function handlePaid(supabase: any, paymentRecord: any, paymentData: any): Promise<string> {
  if (!paymentRecord) {
    console.warn(`Payment not found for Asaas payment ${paymentData?.id}`);
    return "NOT_FOUND";
  }

  await supabase.from("payments").update({
    status: "SUCCEEDED",
    processed_at: new Date().toISOString(),
  }).eq("id", paymentRecord.id);

  await supabase.from("pix_payment_data").update({
    paid_at: new Date().toISOString(),
  }).eq("payment_id", paymentRecord.id);

  await supabase.from("orders").update({
    status: "COMPLETED",
    paid_at: new Date().toISOString(),
  }).eq("id", paymentRecord.order_id);

  // Grant entitlements
  const { data: orderItems } = await supabase
    .from("order_items")
    .select("product_id")
    .eq("order_id", paymentRecord.order_id);

  const { data: order } = await supabase
    .from("orders")
    .select("customer_id, checkout_session_id, customer_email, customer_name, total_amount, workspace_id, payment_method")
    .eq("id", paymentRecord.order_id)
    .single();

  if (order?.customer_id && orderItems) {
    for (const item of orderItems) {
      const { data: existing } = await supabase
        .from("entitlements")
        .select("id")
        .eq("order_id", paymentRecord.order_id)
        .eq("product_id", item.product_id)
        .eq("customer_id", order.customer_id)
        .maybeSingle();

      if (!existing) {
        await supabase.from("entitlements").insert({
          customer_id: order.customer_id,
          product_id: item.product_id,
          order_id: paymentRecord.order_id,
        });
      }

      const { data: prod } = await supabase
        .from("products")
        .select("sales_count")
        .eq("id", item.product_id)
        .single();
      if (prod) {
        await supabase.from("products").update({
          sales_count: (prod.sales_count || 0) + 1,
        }).eq("id", item.product_id);
      }
    }
  }

  if (order?.checkout_session_id) {
    await supabase.from("checkout_sessions").update({
      status: "COMPLETED",
      completed_at: new Date().toISOString(),
    }).eq("id", order.checkout_session_id);
  }

  // Wallet ledger
  if (order) {
    const HOLD_DAYS = 14;
    const availableAt = new Date(Date.now() + HOLD_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const totalAmount = Number(order.total_amount || 0);
    const netFee = paymentData?.netValue ? totalAmount - Number(paymentData.netValue) : 0;
    const netAmount = totalAmount - netFee;

    const { data: existingLedger } = await supabase
      .from("wallet_ledger")
      .select("id")
      .eq("order_id", paymentRecord.order_id)
      .eq("type", "sale")
      .maybeSingle();

    if (!existingLedger) {
      await supabase.from("wallet_ledger").insert({
        workspace_id: order.workspace_id,
        order_id: paymentRecord.order_id,
        type: "sale",
        amount: netAmount,
        status: "pending",
        available_at: availableAt,
        description: `Venda #${paymentRecord.order_id.slice(0, 8)}`,
      });

      if (netFee > 0) {
        await supabase.from("wallet_ledger").insert({
          workspace_id: order.workspace_id,
          order_id: paymentRecord.order_id,
          type: "fee",
          amount: -netFee,
          status: "settled",
          description: `Taxa Asaas #${paymentRecord.order_id.slice(0, 8)}`,
        });
      }
    }
  }

  // Affiliate commissions (same logic as pagarme webhook)
  try {
    if (order) {
      let affiliateLinkId: string | null = null;
      if (order.checkout_session_id) {
        const { data: session } = await supabase
          .from("checkout_sessions")
          .select("affiliate_link_id")
          .eq("id", order.checkout_session_id)
          .maybeSingle();
        affiliateLinkId = session?.affiliate_link_id || null;
      }

      if (affiliateLinkId) {
        const { data: affLink } = await supabase
          .from("affiliate_links")
          .select("id, affiliate_id, product_id")
          .eq("id", affiliateLinkId)
          .maybeSingle();

        if (affLink) {
          const { data: existingComm } = await supabase
            .from("commissions")
            .select("id")
            .eq("order_id", paymentRecord.order_id)
            .eq("affiliate_id", affLink.affiliate_id)
            .maybeSingle();

          if (!existingComm) {
            let commissionPercent = 20;
            for (const item of (orderItems || [])) {
              const { data: rule } = await supabase
                .from("commission_rules")
                .select("percent")
                .eq("product_id", item.product_id)
                .eq("is_active", true)
                .maybeSingle();
              if (rule) { commissionPercent = rule.percent; break; }
            }

            const { data: prog } = await supabase
              .from("affiliate_programs")
              .select("default_commission_percent, hold_days")
              .eq("workspace_id", order.workspace_id)
              .maybeSingle();
            if (prog && commissionPercent === 20) commissionPercent = prog.default_commission_percent;
            const holdDays = prog?.hold_days || 14;
            const commissionAmount = Math.round(Number(order.total_amount) * (commissionPercent / 100));

            await supabase.from("commissions").insert({
              affiliate_id: affLink.affiliate_id,
              order_id: paymentRecord.order_id,
              amount: commissionAmount,
              status: "PENDING",
              hold_until: new Date(Date.now() + holdDays * 86400000).toISOString(),
            });

            await supabase.from("affiliate_attributions")
              .update({ converted_at: new Date().toISOString() })
              .eq("affiliate_link_id", affiliateLinkId)
              .is("converted_at", null);
          }
        }
      }
    }
  } catch (affErr) {
    console.error("Affiliate commission error (non-fatal):", affErr);
  }

  // Transactional emails
  try {
    if (order) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      let productName = "seu produto";
      if (orderItems?.length > 0) {
        const { data: prod } = await supabase.from("products").select("name").eq("id", orderItems[0].product_id).maybeSingle();
        if (prod) productName = prod.name;
      }
      const { data: ws } = await supabase.from("workspaces").select("name, slug").eq("id", order.workspace_id).maybeSingle();
      const valor = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(order.total_amount || 0));

      await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${serviceKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          template_key: "purchase_confirmed",
          recipient_email: order.customer_email,
          workspace_id: order.workspace_id,
          order_id: paymentRecord.order_id,
          customer_id: order.customer_id,
          idempotency_key: `purchase_confirmed_${paymentRecord.order_id}`,
          data: { nome: order.customer_name, produto: productName, valor, workspace_name: ws?.name || "Kivo" },
        }),
      });
    }
  } catch (emailErr) {
    console.error("Post-payment email error (non-fatal):", emailErr);
  }

  // Auto NFS-e
  try {
    if (order) {
      const { data: fiscalCfg } = await supabase
        .from("fiscal_settings")
        .select("is_auto_emission, nfse_provider")
        .eq("workspace_id", order.workspace_id)
        .maybeSingle();

      if (fiscalCfg?.is_auto_emission && fiscalCfg?.nfse_provider) {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        await fetch(`${supabaseUrl}/functions/v1/emit-nfse`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${serviceKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ order_id: paymentRecord.order_id }),
        });
      }
    }
  } catch (e) {
    console.error("NFS-e error (non-fatal):", e);
  }

  console.log(`Asaas: Order ${paymentRecord.order_id} COMPLETED`);
  return "SUCCEEDED";
}

async function handleFailed(supabase: any, paymentRecord: any, paymentData: any): Promise<string> {
  if (!paymentRecord) return "NOT_FOUND";

  await supabase.from("payments").update({
    status: "FAILED",
    failed_at: new Date().toISOString(),
    failure_reason: paymentData?.failReason || "Payment failed",
  }).eq("id", paymentRecord.id);

  await supabase.from("orders").update({ status: "FAILED" }).eq("id", paymentRecord.order_id);
  return "FAILED";
}

async function handleRefunded(supabase: any, paymentRecord: any, paymentData: any): Promise<string> {
  if (!paymentRecord) return "NOT_FOUND";

  const refundAmount = paymentData?.value || 0;
  await supabase.from("refunds").insert({
    order_id: paymentRecord.order_id,
    payment_id: paymentRecord.id,
    amount: refundAmount,
    status: "PROCESSED",
    processed_at: new Date().toISOString(),
    gateway_refund_id: paymentData?.id || null,
  });

  await supabase.from("orders").update({ status: "REFUNDED" }).eq("id", paymentRecord.order_id);
  await supabase.from("entitlements").update({ revoked_at: new Date().toISOString() }).eq("order_id", paymentRecord.order_id);

  // Ledger
  await supabase.from("wallet_ledger").update({ status: "canceled" })
    .eq("order_id", paymentRecord.order_id).eq("type", "sale");
  await supabase.from("wallet_ledger").insert({
    workspace_id: paymentRecord.workspace_id,
    order_id: paymentRecord.order_id,
    type: "refund",
    amount: -refundAmount,
    status: "settled",
    description: `Reembolso Asaas #${paymentRecord.order_id.slice(0, 8)}`,
  });

  // Reverse split entry
  await supabase.from("split_entries").update({
    status: "refunded",
    refunded_at: new Date().toISOString(),
  }).eq("order_id", paymentRecord.order_id);

  return "REFUNDED";
}

async function handleChargeback(supabase: any, paymentRecord: any, paymentData: any): Promise<string> {
  if (!paymentRecord) return "NOT_FOUND";

  await supabase.from("disputes").insert({
    order_id: paymentRecord.order_id,
    status: "OPEN",
    reason: "Chargeback",
    amount: paymentData?.value || 0,
    gateway_dispute_id: paymentData?.id || null,
  });

  await supabase.from("orders").update({ status: "DISPUTED" }).eq("id", paymentRecord.order_id);

  // Reverse split entry on chargeback
  await supabase.from("split_entries").update({
    status: "refunded",
    refunded_at: new Date().toISOString(),
  }).eq("order_id", paymentRecord.order_id);

  return "DISPUTED";
}

async function handleCanceled(supabase: any, paymentRecord: any): Promise<string> {
  if (!paymentRecord) return "NOT_FOUND";

  await supabase.from("payments").update({
    status: "CANCELED",
    failed_at: new Date().toISOString(),
    failure_reason: "Canceled",
  }).eq("id", paymentRecord.id);

  await supabase.from("orders").update({ status: "CANCELED" }).eq("id", paymentRecord.order_id);
  return "CANCELED";
}

// ── Circle Subscription Handlers ──

async function handleSubscriptionPaid(supabase: any, paymentData: any): Promise<string> {
  const subscriptionId = paymentData?.subscription;
  if (!subscriptionId) return "NOT_FOUND";

  const { data: sub } = await supabase
    .from("circle_subscriptions")
    .select("id, community_id, user_id, plan_id, dunning_attempts")
    .eq("provider_subscription_id", subscriptionId)
    .maybeSingle();

  if (!sub) return "NOT_FOUND";

  const { data: plan } = await supabase
    .from("circle_plans")
    .select("interval")
    .eq("id", sub.plan_id)
    .maybeSingle();

  const intervalMs = plan?.interval === "yearly" ? 365 * 86400000 : 30 * 86400000;

  await supabase.from("circle_subscriptions").update({
    status: "active",
    dunning_attempts: 0,
    next_billing_at: new Date(Date.now() + intervalMs).toISOString(),
  }).eq("id", sub.id);

  await supabase.from("community_members").update({
    status: "ACTIVE",
  }).eq("community_id", sub.community_id).eq("user_id", sub.user_id);

  console.log(`Circle subscription ${sub.id} renewed via Asaas payment`);
  return "active";
}
