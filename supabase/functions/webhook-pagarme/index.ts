import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-hub-signature",
};

const MAX_ATTEMPTS = 5;
const RETRY_DELAYS = [60, 300, 900, 3600, 7200]; // 1m, 5m, 15m, 1h, 2h

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);
  const webhookSecret = Deno.env.get("PAGARME_WEBHOOK_SECRET");

  let payload: any;
  let rawBody: string;

  try {
    rawBody = await req.text();
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
  }

  // HMAC signature validation
  if (webhookSecret) {
    const signature = req.headers.get("x-hub-signature") || "";
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw", encoder.encode(webhookSecret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
    const hexSig = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
    const expected = `sha1=${hexSig}`;
    if (signature !== expected) {
      console.error("Invalid webhook signature");
      return new Response("Invalid signature", { status: 401, headers: corsHeaders });
    }
  } else {
    console.warn("PAGARME_WEBHOOK_SECRET not set — skipping signature validation");
  }

  const eventType = payload?.type || payload?.event || "unknown";
  const externalEventId = payload?.id || payload?.data?.id || crypto.randomUUID();

  // Idempotency check
  const { data: existingEvent } = await supabase
    .from("webhook_events")
    .select("id, status")
    .eq("provider", "PAGARME")
    .eq("external_event_id", String(externalEventId))
    .maybeSingle();

  if (existingEvent && existingEvent.status === "PROCESSED") {
    console.log(`Duplicate webhook ${externalEventId}, skipping`);
    return new Response(JSON.stringify({ ok: true, duplicate: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Find payment record
  const chargeData = payload?.data;
  const gatewayPaymentId = chargeData?.charges?.[0]?.id || chargeData?.id;

  let paymentRecord: any = null;
  if (gatewayPaymentId) {
    const { data } = await supabase
      .from("payments")
      .select("id, order_id, workspace_id, status")
      .eq("gateway_payment_id", String(gatewayPaymentId))
      .maybeSingle();
    paymentRecord = data;
  }

  const statusBefore = paymentRecord?.status || null;

  // Save or update webhook event
  const webhookInsert = {
    provider: "PAGARME",
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
    const { data: webhookEvent } = await supabase
      .from("webhook_events")
      .insert(webhookInsert)
      .select("id")
      .single();
    if (!webhookEvent) {
      return new Response(JSON.stringify({ ok: false, error: "Failed to save event" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    webhookEventId = webhookEvent.id;
  }

  try {
    let statusAfter: string | null = null;

    if (eventType === "order.paid" || eventType === "charge.paid") {
      statusAfter = await handlePaid(supabase, paymentRecord, chargeData, gatewayPaymentId);
    } else if (eventType === "order.payment_failed" || eventType === "charge.payment_failed") {
      statusAfter = await handleFailed(supabase, paymentRecord, chargeData);
    } else if (eventType === "order.refunded" || eventType === "charge.refunded") {
      statusAfter = await handleRefunded(supabase, paymentRecord, chargeData);
    } else if (eventType === "charge.chargeback") {
      statusAfter = await handleChargeback(supabase, paymentRecord, chargeData);
    } else if (eventType === "order.canceled" || eventType === "charge.canceled") {
      statusAfter = await handleCanceled(supabase, paymentRecord);
    } else {
      console.log(`Unhandled event type: ${eventType}`);
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

async function handlePaid(supabase: any, paymentRecord: any, chargeData: any, gatewayPaymentId: string): Promise<string> {
  if (!paymentRecord) {
    throw new Error(`Payment not found for gateway_payment_id: ${gatewayPaymentId}`);
  }

  const lastTx = chargeData?.charges?.[0]?.last_transaction;

  // Update payment with card info if available
  const paymentUpdate: any = {
    status: "SUCCEEDED",
    processed_at: new Date().toISOString(),
  };
  if (lastTx?.card) {
    paymentUpdate.card_last4 = lastTx.card.last_four_digits || null;
    paymentUpdate.card_brand = lastTx.card.brand || null;
  }
  await supabase.from("payments").update(paymentUpdate).eq("id", paymentRecord.id);

  // Update PIX paid_at if applicable
  await supabase.from("pix_payment_data").update({
    paid_at: new Date().toISOString(),
  }).eq("payment_id", paymentRecord.id);

  // Update order
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

  // Update checkout session
  if (order?.checkout_session_id) {
    await supabase.from("checkout_sessions").update({
      status: "COMPLETED",
      completed_at: new Date().toISOString(),
    }).eq("id", order.checkout_session_id);
  }

  // Create wallet ledger entries (sale + fee)
  if (order) {
    const HOLD_DAYS = 14;
    const availableAt = new Date(Date.now() + HOLD_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const totalAmount = Number(order.total_amount || 0);
    const gatewayFee = Number(paymentRecord.gateway_fee || 0);
    const netAmount = totalAmount - gatewayFee;

    // Check idempotency - don't duplicate ledger entries
    const { data: existingLedger } = await supabase
      .from("wallet_ledger")
      .select("id")
      .eq("order_id", paymentRecord.order_id)
      .eq("type", "sale")
      .maybeSingle();

    if (!existingLedger) {
      // Sale entry (positive)
      await supabase.from("wallet_ledger").insert({
        workspace_id: order.workspace_id,
        order_id: paymentRecord.order_id,
        type: "sale",
        amount: netAmount,
        status: "pending",
        available_at: availableAt,
        description: `Venda #${paymentRecord.order_id.slice(0, 8)}`,
      });

      // Fee entry (negative, settled immediately)
      if (gatewayFee > 0) {
        await supabase.from("wallet_ledger").insert({
          workspace_id: order.workspace_id,
          order_id: paymentRecord.order_id,
          type: "fee",
          amount: -gatewayFee,
          status: "settled",
          description: `Taxa gateway #${paymentRecord.order_id.slice(0, 8)}`,
        });
      }
    }
  }

  // Send notifications (fire-and-forget)
  try {
    if (order) {
      const productNames = [];
      for (const item of (orderItems || [])) {
        const { data: p } = await supabase.from("products").select("name").eq("id", item.product_id).single();
        if (p) productNames.push(p.name);
      }

      // Log notification intent (notifications table)
      await supabase.from("audit_logs").insert({
        workspace_id: order.workspace_id,
        entity_type: "order",
        entity_id: paymentRecord.order_id,
        action: "payment_confirmed",
        metadata: {
          customer_email: order.customer_email,
          customer_name: order.customer_name,
          amount: order.total_amount,
          method: order.payment_method,
          products: productNames,
        },
      });
    }
  } catch (notifErr) {
    console.error("Notification logging error (non-fatal):", notifErr);
  }

  console.log(`Order ${paymentRecord.order_id} marked as COMPLETED`);
  return "SUCCEEDED";
}

async function handleFailed(supabase: any, paymentRecord: any, chargeData: any): Promise<string> {
  if (!paymentRecord) return "UNKNOWN";

  const failureReason = chargeData?.charges?.[0]?.last_transaction?.acquirer_message || "Payment failed";
  await supabase.from("payments").update({
    status: "FAILED",
    failed_at: new Date().toISOString(),
    failure_reason: failureReason,
  }).eq("id", paymentRecord.id);

  await supabase.from("orders").update({
    status: "FAILED",
  }).eq("id", paymentRecord.order_id);

  console.log(`Payment ${paymentRecord.id} marked as FAILED`);
  return "FAILED";
}

async function handleRefunded(supabase: any, paymentRecord: any, chargeData: any): Promise<string> {
  if (!paymentRecord) return "UNKNOWN";

  const refundAmount = chargeData?.amount ? chargeData.amount / 100 : 0;

  await supabase.from("refunds").insert({
    order_id: paymentRecord.order_id,
    payment_id: paymentRecord.id,
    amount: refundAmount,
    status: "PROCESSED",
    processed_at: new Date().toISOString(),
    gateway_refund_id: chargeData?.charges?.[0]?.last_transaction?.id || null,
  });

  await supabase.from("orders").update({
    status: "REFUNDED",
  }).eq("id", paymentRecord.order_id);

  await supabase.from("entitlements").update({
    revoked_at: new Date().toISOString(),
  }).eq("order_id", paymentRecord.order_id);

  // Ledger: refund entry (cancel previous sale entries + add refund debit)
  const refundAmountCents = chargeData?.amount || 0;
  await supabase.from("wallet_ledger").update({ status: "canceled" })
    .eq("order_id", paymentRecord.order_id).eq("type", "sale");

  await supabase.from("wallet_ledger").insert({
    workspace_id: paymentRecord.workspace_id,
    order_id: paymentRecord.order_id,
    type: "refund",
    amount: -refundAmountCents,
    status: "settled",
    description: `Reembolso #${paymentRecord.order_id.slice(0, 8)}`,
  });

  console.log(`Order ${paymentRecord.order_id} REFUNDED`);
  return "REFUNDED";
}

async function handleChargeback(supabase: any, paymentRecord: any, chargeData: any): Promise<string> {
  if (!paymentRecord) return "UNKNOWN";

  await supabase.from("disputes").insert({
    order_id: paymentRecord.order_id,
    status: "OPEN",
    reason: chargeData?.charges?.[0]?.last_transaction?.acquirer_message || "Chargeback",
    amount: chargeData?.amount ? chargeData.amount / 100 : 0,
    gateway_dispute_id: chargeData?.charges?.[0]?.id || null,
  });

  await supabase.from("orders").update({
    status: "DISPUTED",
  }).eq("id", paymentRecord.order_id);

  console.log(`Dispute created for order ${paymentRecord.order_id}`);
  return "DISPUTED";
}

async function handleCanceled(supabase: any, paymentRecord: any): Promise<string> {
  if (!paymentRecord) return "UNKNOWN";

  await supabase.from("payments").update({
    status: "CANCELED",
    failed_at: new Date().toISOString(),
    failure_reason: "Canceled",
  }).eq("id", paymentRecord.id);

  await supabase.from("orders").update({
    status: "CANCELED",
  }).eq("id", paymentRecord.order_id);

  console.log(`Order ${paymentRecord.order_id} CANCELED`);
  return "CANCELED";
}
