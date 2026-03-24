import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-hub-signature",
};

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

  // Idempotency: check if already processed
  const { data: existingEvent } = await supabase
    .from("webhook_events")
    .select("id, status")
    .eq("provider", "PAGARME")
    .eq("external_event_id", String(externalEventId))
    .maybeSingle();

  if (existingEvent) {
    console.log(`Duplicate webhook ${externalEventId}, skipping`);
    return new Response(JSON.stringify({ ok: true, duplicate: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Find payment record from charge data
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

  // Save webhook event
  const { data: webhookEvent } = await supabase
    .from("webhook_events")
    .insert({
      provider: "PAGARME",
      event_type: eventType,
      external_event_id: String(externalEventId),
      payload,
      status: "RECEIVED",
      workspace_id: paymentRecord?.workspace_id || null,
    })
    .select("id")
    .single();

  if (!webhookEvent) {
    return new Response(JSON.stringify({ ok: false, error: "Failed to save event" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    if (eventType === "order.paid" || eventType === "charge.paid") {
      await handlePaid(supabase, paymentRecord, chargeData, gatewayPaymentId);
    } else if (eventType === "order.payment_failed" || eventType === "charge.payment_failed") {
      await handleFailed(supabase, paymentRecord, chargeData);
    } else if (eventType === "order.refunded" || eventType === "charge.refunded") {
      await handleRefunded(supabase, paymentRecord, chargeData);
    } else if (eventType === "charge.chargeback") {
      await handleChargeback(supabase, paymentRecord, chargeData);
    } else {
      console.log(`Unhandled event type: ${eventType}`);
    }

    // Mark event as processed
    await supabase.from("webhook_events").update({
      status: "PROCESSED",
      processed_at: new Date().toISOString(),
      attempts: 1,
    }).eq("id", webhookEvent.id);

  } catch (err) {
    console.error("Webhook processing error:", err);
    await supabase.from("webhook_events").update({
      status: "FAILED",
      error_message: err.message || "Unknown error",
      attempts: 1,
    }).eq("id", webhookEvent.id);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

// ─── Event Handlers ───

async function handlePaid(supabase: any, paymentRecord: any, chargeData: any, gatewayPaymentId: string) {
  if (!paymentRecord) {
    throw new Error(`Payment not found for gateway_payment_id: ${gatewayPaymentId}`);
  }

  // Update payment
  await supabase.from("payments").update({
    status: "SUCCEEDED",
    processed_at: new Date().toISOString(),
  }).eq("id", paymentRecord.id);

  // Update PIX paid_at if applicable
  await supabase.from("pix_payment_data").update({
    paid_at: new Date().toISOString(),
  }).eq("payment_id", paymentRecord.id);

  // Update order
  await supabase.from("orders").update({
    status: "COMPLETED",
    paid_at: new Date().toISOString(),
  }).eq("id", paymentRecord.order_id);

  // Get order details for entitlements
  const { data: orderItems } = await supabase
    .from("order_items")
    .select("product_id")
    .eq("order_id", paymentRecord.order_id);

  const { data: order } = await supabase
    .from("orders")
    .select("customer_id, checkout_session_id")
    .eq("id", paymentRecord.order_id)
    .single();

  if (order?.customer_id && orderItems) {
    // Create entitlements idempotently
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

      // Increment sales_count
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

  console.log(`Order ${paymentRecord.order_id} marked as COMPLETED`);
}

async function handleFailed(supabase: any, paymentRecord: any, chargeData: any) {
  if (!paymentRecord) return;

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
}

async function handleRefunded(supabase: any, paymentRecord: any, chargeData: any) {
  if (!paymentRecord) return;

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

  // Revoke entitlements
  await supabase.from("entitlements").update({
    revoked_at: new Date().toISOString(),
  }).eq("order_id", paymentRecord.order_id);

  console.log(`Order ${paymentRecord.order_id} REFUNDED`);
}

async function handleChargeback(supabase: any, paymentRecord: any, chargeData: any) {
  if (!paymentRecord) return;

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
}
