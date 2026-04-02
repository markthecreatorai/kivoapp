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
    }
    // ── Subscription events (Circle) ──
    else if (eventType === "subscription.created" || eventType === "subscription.updated") {
      statusAfter = await handleSubscriptionUpdate(supabase, chargeData);
    } else if (eventType === "subscription.canceled" || eventType === "subscription.expired") {
      statusAfter = await handleSubscriptionCanceled(supabase, chargeData, eventType);
    } else if (eventType === "subscription.payment_failed") {
      statusAfter = await handleSubscriptionPaymentFailed(supabase, chargeData);
    } else if (eventType === "invoice.paid") {
      statusAfter = await handleInvoicePaid(supabase, chargeData);
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
      error_message: (err as Error).message || "Unknown error",
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

  // Affiliate commission attribution (fire-and-forget)
  try {
    if (order) {
      // Check if order has an affiliate_link_id via checkout_session
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
        // Get affiliate info
        const { data: affLink } = await supabase
          .from("affiliate_links")
          .select("id, affiliate_id, product_id")
          .eq("id", affiliateLinkId)
          .maybeSingle();

        if (affLink) {
          // Check idempotency
          const { data: existingComm } = await supabase
            .from("commissions")
            .select("id")
            .eq("order_id", paymentRecord.order_id)
            .eq("affiliate_id", affLink.affiliate_id)
            .maybeSingle();

          if (!existingComm) {
            // Determine commission percentage
            let commissionPercent = 20; // default

            // Check product-specific commission rule first
            for (const item of (orderItems || [])) {
              const { data: rule } = await supabase
                .from("commission_rules")
                .select("percent")
                .eq("product_id", item.product_id)
                .eq("is_active", true)
                .maybeSingle();
              if (rule) {
                commissionPercent = rule.percent;
                break;
              }
            }

            // Fallback to program default
            const { data: prog } = await supabase
              .from("affiliate_programs")
              .select("default_commission_percent, hold_days")
              .eq("workspace_id", order.workspace_id)
              .maybeSingle();
            if (prog && commissionPercent === 20) {
              commissionPercent = prog.default_commission_percent;
            }
            const holdDays = prog?.hold_days || 14;

            const totalAmount = Number(order.total_amount || 0);
            const commissionAmount = Math.round(totalAmount * (commissionPercent / 100));

            // Create commission record
            await supabase.from("commissions").insert({
              affiliate_id: affLink.affiliate_id,
              order_id: paymentRecord.order_id,
              amount: commissionAmount,
              status: "PENDING",
              hold_until: new Date(Date.now() + holdDays * 86400000).toISOString(),
            });

            // Mark attribution as converted
            await supabase.from("affiliate_attributions")
              .update({ converted_at: new Date().toISOString() })
              .eq("affiliate_link_id", affiliateLinkId)
              .is("converted_at", null);

            console.log(`Affiliate commission created: ${commissionAmount} for affiliate ${affLink.affiliate_id}`);
          }
        }
      }
    }
  } catch (affErr) {
    console.error("Affiliate commission error (non-fatal):", affErr);
  }

  // Auto NFS-e emission (fire-and-forget)
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
          headers: {
            "Authorization": `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ order_id: paymentRecord.order_id }),
        });
        console.log(`NFS-e emission triggered for order ${paymentRecord.order_id}`);
      }
    }
  } catch (nfseErr) {
    console.error("NFS-e auto-emission error (non-fatal):", nfseErr);
  }

  // ─── Transactional Emails (fire-and-forget) ───
  try {
    if (order) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

      // Get product name for email
      let productName = "seu produto";
      if (orderItems && orderItems.length > 0) {
        const { data: prod } = await supabase
          .from("products")
          .select("name")
          .eq("id", orderItems[0].product_id)
          .maybeSingle();
        if (prod) productName = prod.name;
      }

      // Get workspace name
      const { data: ws } = await supabase
        .from("workspaces")
        .select("name, slug")
        .eq("id", order.workspace_id)
        .maybeSingle();

      const valor = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
        .format(Number(order.total_amount || 0) / 100);

      const memberUrl = ws?.slug
        ? `https://kivostore.lovable.app/member/dashboard`
        : "#";

      const emailData = {
        nome: order.customer_name || undefined,
        produto: productName,
        valor,
        member_url: memberUrl,
        workspace_name: ws?.name || "Kivo",
      };

      // 1. Purchase confirmed
      await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          template_key: "purchase_confirmed",
          recipient_email: order.customer_email,
          workspace_id: order.workspace_id,
          order_id: paymentRecord.order_id,
          customer_id: order.customer_id,
          idempotency_key: `purchase_confirmed_${paymentRecord.order_id}`,
          data: emailData,
        }),
      });
      console.log(`Purchase confirmed email queued for ${order.customer_email}`);

      // 2. Welcome member (idempotent per customer)
      if (order.customer_id) {
        await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            template_key: "welcome_member",
            recipient_email: order.customer_email,
            workspace_id: order.workspace_id,
            order_id: paymentRecord.order_id,
            customer_id: order.customer_id,
            idempotency_key: `welcome_member_${order.customer_id}_${order.workspace_id}`,
            data: emailData,
          }),
        });
        console.log(`Welcome member email queued for ${order.customer_email}`);
      }
    }
  } catch (emailErr) {
    console.error("Post-payment email error (non-fatal):", emailErr);
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

// ─── Circle Subscription Event Handlers ───

async function handleSubscriptionUpdate(supabase: any, data: any): Promise<string> {
  const providerSubId = data?.id;
  if (!providerSubId) return "UNKNOWN";

  const pgStatus = data?.status;
  const statusMap: Record<string, string> = {
    active: "active",
    trialing: "trialing",
    pending: "pending",
    future: "pending",
  };
  const newStatus = statusMap[pgStatus] || "active";

  const { data: sub } = await supabase
    .from("circle_subscriptions")
    .select("id, community_id, user_id, status")
    .eq("provider_subscription_id", providerSubId)
    .maybeSingle();

  if (!sub) {
    console.log(`No circle_subscription found for provider_sub ${providerSubId}`);
    return "NOT_FOUND";
  }

  await supabase.from("circle_subscriptions").update({
    status: newStatus,
    dunning_attempts: 0,
  }).eq("id", sub.id);

  // Ensure member is active
  if (newStatus === "active" || newStatus === "trialing") {
    await supabase.from("community_members").update({
      status: "ACTIVE",
    }).eq("community_id", sub.community_id).eq("user_id", sub.user_id);
  }

  console.log(`Circle subscription ${sub.id} updated to ${newStatus}`);
  return newStatus;
}

async function handleSubscriptionCanceled(supabase: any, data: any, eventType: string): Promise<string> {
  const providerSubId = data?.id;
  if (!providerSubId) return "UNKNOWN";

  const newStatus = eventType === "subscription.expired" ? "expired" : "canceled";

  const { data: sub } = await supabase
    .from("circle_subscriptions")
    .select("id, community_id, user_id")
    .eq("provider_subscription_id", providerSubId)
    .maybeSingle();

  if (!sub) return "NOT_FOUND";

  await supabase.from("circle_subscriptions").update({
    status: newStatus,
    canceled_at: new Date().toISOString(),
  }).eq("id", sub.id);

  // Block community access
  await supabase.from("community_members").update({
    status: "LEFT",
  }).eq("community_id", sub.community_id).eq("user_id", sub.user_id).eq("role", "MEMBER");

  console.log(`Circle subscription ${sub.id} ${newStatus}`);
  return newStatus;
}

async function handleSubscriptionPaymentFailed(supabase: any, data: any): Promise<string> {
  const providerSubId = data?.id || data?.subscription?.id;
  if (!providerSubId) return "UNKNOWN";

  const { data: sub } = await supabase
    .from("circle_subscriptions")
    .select("id, community_id, user_id, dunning_attempts")
    .eq("provider_subscription_id", providerSubId)
    .maybeSingle();

  if (!sub) return "NOT_FOUND";

  const newAttempts = (sub.dunning_attempts || 0) + 1;
  const maxDunning = 3;

  if (newAttempts >= maxDunning) {
    // Max dunning reached → expire
    await supabase.from("circle_subscriptions").update({
      status: "expired",
      dunning_attempts: newAttempts,
      last_dunning_at: new Date().toISOString(),
    }).eq("id", sub.id);

    await supabase.from("community_members").update({
      status: "LEFT",
    }).eq("community_id", sub.community_id).eq("user_id", sub.user_id).eq("role", "MEMBER");

    console.log(`Circle subscription ${sub.id} expired after ${newAttempts} failed dunning attempts`);
  } else {
    // Mark as past_due
    await supabase.from("circle_subscriptions").update({
      status: "past_due",
      dunning_attempts: newAttempts,
      last_dunning_at: new Date().toISOString(),
    }).eq("id", sub.id);

    console.log(`Circle subscription ${sub.id} past_due (attempt ${newAttempts}/${maxDunning})`);
  }

  // Fire dunning notification (email + in-app + telegram)
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    await fetch(`${supabaseUrl}/functions/v1/send-dunning-email`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subscription_id: sub.id,
        dunning_attempt: newAttempts,
        user_id: sub.user_id,
        community_id: sub.community_id,
      }),
    });
  } catch (e) {
    console.error("Dunning email trigger error (non-fatal):", e);
  }

  return newAttempts >= maxDunning ? "expired" : "past_due";
}

async function handleInvoicePaid(supabase: any, data: any): Promise<string> {
  const providerSubId = data?.subscription?.id || data?.subscription_id;
  if (!providerSubId) return "UNKNOWN";

  const { data: sub } = await supabase
    .from("circle_subscriptions")
    .select("id, community_id, user_id, plan_id")
    .eq("provider_subscription_id", providerSubId)
    .maybeSingle();

  if (!sub) return "NOT_FOUND";

  // Get plan to calculate next billing
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

  // Ensure member active
  await supabase.from("community_members").update({
    status: "ACTIVE",
  }).eq("community_id", sub.community_id).eq("user_id", sub.user_id);

  console.log(`Circle subscription ${sub.id} renewed via invoice.paid`);
  return "active";
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
