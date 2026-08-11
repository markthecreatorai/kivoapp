import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { feeTierForPlan } from "../_shared/plan.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, asaas-access-token",
};

const MAX_ATTEMPTS = 5;
const RETRY_DELAYS = [60, 300, 900, 3600, 7200];

/** Comparação em tempo constante de duas strings. */
function timingSafeEqualStr(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  const len = Math.max(ea.length, eb.length);
  for (let i = 0; i < len; i++) {
    diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  }
  return diff === 0;
}


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

  // Fail closed: sem token configurado, não processa nada.
  if (!webhookToken) {
    console.error("ASAAS_WEBHOOK_TOKEN not set — refusing to process webhook");
    return new Response(JSON.stringify({ error: "Webhook not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const headerToken = req.headers.get("asaas-access-token") || "";
  if (!timingSafeEqualStr(headerToken, webhookToken)) {
    console.error("Invalid Asaas webhook token");
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }


  const eventType = payload?.event || "unknown";
  const paymentData = payload?.payment;
  // A UNIQUE do banco é (provider, external_event_id) — a chave precisa carregar o
  // tipo do evento, senão PAYMENT_CONFIRMED e PAYMENT_RECEIVED da mesma cobrança
  // colidem e o webhook devolve 500 em loop.
  const rawEventId = payload?.id || paymentData?.id || crypto.randomUUID();
  const externalEventId = `${rawEventId}:${eventType}`;

  // Idempotency check
  const { data: existingEvent } = await supabase
    .from("webhook_events")
    .select("id, status, attempts")
    .eq("provider", "ASAAS")
    .eq("external_event_id", String(externalEventId))
    .maybeSingle();

  if (existingEvent?.status === "PROCESSED") {
    return new Response(JSON.stringify({ ok: true, duplicate: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let paymentRecord: any = null;
  const gatewayPaymentId = paymentData?.id;
  const externalReference = paymentData?.externalReference;

  if (externalReference) {
    const { data } = await supabase
      .from("payments")
      .select("id, order_id, workspace_id, status, gateway_payment_id")
      .eq("order_id", externalReference)
      .maybeSingle();
    paymentRecord = data;
  }
  if (!paymentRecord && gatewayPaymentId) {
    const { data } = await supabase
      .from("payments")
      .select("id, order_id, workspace_id, status, gateway_payment_id")
      .eq("gateway_payment_id", String(gatewayPaymentId))
      .maybeSingle();
    paymentRecord = data;
  }

  const statusBefore = paymentRecord?.status || null;

  const webhookInsert: any = {
    provider: "ASAAS",
    event_type: eventType,
    external_event_id: String(externalEventId),
    payload,
    status: "RECEIVED",
    workspace_id: paymentRecord?.workspace_id || null,
    order_id: paymentRecord?.order_id || null,
    status_before: statusBefore,
    attempts: (existingEvent?.attempts ?? 0) + 1,
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
    const { data: we, error: weErr } = await supabase
      .from("webhook_events")
      .insert(webhookInsert)
      .select("id")
      .single();
    if (weErr || !we) {
      // Corrida entre duas entregas do mesmo evento: recupera a linha existente
      const { data: raced } = await supabase
        .from("webhook_events")
        .select("id")
        .eq("provider", "ASAAS")
        .eq("external_event_id", String(externalEventId))
        .maybeSingle();
      if (!raced) {
        console.error("Failed to persist webhook_event:", weErr);
        return new Response(JSON.stringify({ ok: false }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      webhookEventId = raced.id;
    } else {
      webhookEventId = we.id;
    }
  }

  try {
    let statusAfter: string | null = null;

    // ── Subscription lifecycle events ──
    if (eventType.startsWith("SUBSCRIPTION_")) {
      statusAfter = await handleSubscriptionEvent(supabase, eventType, payload);
    }
    // ── Payment events with subscription context → plan subscription invoice ──
    else if ((eventType === "PAYMENT_CONFIRMED" || eventType === "PAYMENT_RECEIVED") && paymentData?.subscription) {
      statusAfter = await handleSubscriptionInvoicePaid(supabase, paymentData);
    } else if ((eventType === "PAYMENT_OVERDUE" || eventType === "PAYMENT_FAILED") && paymentData?.subscription) {
      statusAfter = await handleSubscriptionInvoiceFailed(supabase, paymentData);
    }
    // ── Regular payment events ──
    else if (eventType === "PAYMENT_CONFIRMED" || eventType === "PAYMENT_RECEIVED") {
      statusAfter = await handlePaid(supabase, paymentRecord, paymentData);
    } else if (eventType === "PAYMENT_OVERDUE" || eventType === "PAYMENT_FAILED") {
      statusAfter = await handleFailed(supabase, paymentRecord, paymentData);
    } else if (eventType === "PAYMENT_REFUNDED" || eventType === "PAYMENT_REFUND_IN_PROGRESS") {
      statusAfter = await handleRefunded(supabase, paymentRecord, paymentData);
    } else if (eventType === "PAYMENT_DELETED") {
      statusAfter = await handleCanceled(supabase, paymentRecord);
    } else if (eventType === "PAYMENT_CHARGEBACK_REQUESTED") {
      statusAfter = await handleChargeback(supabase, paymentRecord, paymentData);
    } else {
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
      error_message: (err as Error).message || "Unknown error",
      next_retry_at: nextRetryAt,
      last_attempt_at: new Date().toISOString(),
    }).eq("id", webhookEventId);

    // 500 para que o Asaas reenvie o evento.
    return new Response(JSON.stringify({ ok: false, error: "processing_failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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

  // ── Validação: a cobrança do evento precisa pertencer a este pedido ──
  const eventPaymentId = paymentData?.id ? String(paymentData.id) : null;
  const storedPaymentId = paymentRecord.gateway_payment_id ? String(paymentRecord.gateway_payment_id) : null;
  if (eventPaymentId && storedPaymentId && eventPaymentId !== storedPaymentId) {
    console.error(
      `Asaas payment ${eventPaymentId} does not belong to order ${paymentRecord.order_id} (stored=${storedPaymentId}) — ignoring`,
    );
    return "PAYMENT_MISMATCH";
  }

  // ── Carrega o pedido ANTES de qualquer efeito colateral ──
  const { data: order, error: orderLoadErr } = await supabase
    .from("orders")
    .select("id, status, paid_at, customer_id, checkout_session_id, customer_email, customer_name, total_amount, subtotal_amount, discount_amount, affiliate_link_id, workspace_id, payment_method")
    .eq("id", paymentRecord.order_id)
    .maybeSingle();

  if (orderLoadErr) {
    console.error("Failed to load order:", orderLoadErr);
    throw new Error(`Order load failed: ${orderLoadErr.message}`);
  }
  if (!order) {
    console.warn(`Order ${paymentRecord.order_id} not found for Asaas payment ${eventPaymentId}`);
    return "ORDER_NOT_FOUND";
  }

  // Pedidos de teste nunca geram entitlement nem financeiro.
  if (order.status === "TEST") {
    console.log(`Order ${order.id} is TEST — skipping all provisioning`);
    return "TEST_IGNORED";
  }

  // Idempotência: pedido já concluído não repete efeitos.
  if (order.status === "COMPLETED" && order.paid_at) {
    console.log(`Order ${order.id} already COMPLETED (paid_at=${order.paid_at}) — skipping duplicate processing`);
    return "ALREADY_COMPLETED";
  }

  // ─── Update transaction record ───
  try {
    const { data: tx } = await supabase
      .from("transactions")
      .select("id, payment_method, gross_amount, gateway_fee, platform_fee, net_amount")
      .eq("order_id", paymentRecord.order_id)
      .maybeSingle();

    if (tx) {
      // Calculate available_at based on method
      let availableAt: string;
      const now = new Date();
      if (tx.payment_method === "pix") {
        availableAt = now.toISOString(); // D+0
      } else if (tx.payment_method === "boleto") {
        availableAt = new Date(now.getTime() + 1 * 86400000).toISOString(); // D+1
      } else {
        availableAt = new Date(now.getTime() + 2 * 86400000).toISOString(); // D+2
      }

      // Update with real gateway fee if available from Asaas
      const updateData: any = {
        status: "paid",
        paid_at: new Date().toISOString(),
        available_at: availableAt,
      };

      if (paymentData?.netValue) {
        const realGatewayFee = tx.gross_amount - Math.round(Number(paymentData.netValue) * 100);
        if (realGatewayFee > 0) {
          updateData.gateway_fee = realGatewayFee;
          updateData.net_amount = tx.gross_amount - realGatewayFee - tx.platform_fee;
        }
      }

      await supabase.from("transactions").update(updateData).eq("id", tx.id);

      // Create security reserve if not yet created
      const { data: existingReserve } = await supabase
        .from("security_reserves")
        .select("id")
        .eq("order_id", paymentRecord.order_id)
        .maybeSingle();

      if (!existingReserve && tx.net_amount > 0) {
        const { data: ws } = await supabase
          .from("workspaces")
          .select("plan")
          .eq("id", paymentRecord.workspace_id)
          .maybeSingle();

        const feeTier = feeTierForPlan((ws as any)?.plan);
        const { data: feeConfig } = await supabase
          .from("fee_config")
          .select("reserve_percent, reserve_hold_days")
          .eq("plan_type", feeTier)
          .maybeSingle();

        const reservePercent = Number(feeConfig?.reserve_percent ?? 0);
        // reserve_hold_days is the absolute release window for the reserved slice (D+N from sale)
        const releaseDays = Number(feeConfig?.reserve_hold_days ?? 0);
        const finalNet = updateData.net_amount || tx.net_amount;
        // Reserve applies ONLY to credit card sales
        const isCard = tx.payment_method !== "pix" && tx.payment_method !== "boleto";
        const reserveAmount = isCard ? Math.round(finalNet * reservePercent / 100) : 0;

        console.log("[webhook-asaas] reserva", JSON.stringify({
          fee_tier: feeTier, db_row: feeConfig ?? null,
          payment_method: tx.payment_method, reserveAmount, releaseDays,
        }));

        if (reserveAmount > 0) {
          await supabase.from("security_reserves").insert({
            workspace_id: paymentRecord.workspace_id,
            order_id: paymentRecord.order_id,
            transaction_id: tx.id,
            amount: reserveAmount,
            release_at: new Date(Date.now() + releaseDays * 86400000).toISOString(),
            status: "held",
          });
        }
      }
    }
  } catch (txErr) {
    console.error("Transaction update error (non-fatal):", txErr);
  }

  const { error: payUpdErr } = await supabase.from("payments").update({
    status: "SUCCEEDED",
    processed_at: new Date().toISOString(),
    gateway_payment_id: storedPaymentId || eventPaymentId,
  }).eq("id", paymentRecord.id);
  if (payUpdErr) {
    console.error("Failed to update payment:", payUpdErr);
    throw new Error(`Payment update failed: ${payUpdErr.message}`);
  }

  const { error: pixUpdErr } = await supabase.from("pix_payment_data").update({
    paid_at: new Date().toISOString(),
  }).eq("payment_id", paymentRecord.id);
  if (pixUpdErr) console.error("Failed to update pix_payment_data (non-fatal):", pixUpdErr);

  // Marca COMPLETED apenas se ainda não estiver — guarda extra contra corrida de eventos.
  const { data: completedRows, error: orderUpdErr } = await supabase.from("orders").update({
    status: "COMPLETED",
    paid_at: new Date().toISOString(),
  }).eq("id", paymentRecord.order_id).neq("status", "COMPLETED").select("id");
  if (orderUpdErr) {
    console.error("Failed to complete order:", orderUpdErr);
    throw new Error(`Order update failed: ${orderUpdErr.message}`);
  }
  if (!completedRows || completedRows.length === 0) {
    console.log(`Order ${paymentRecord.order_id} was completed concurrently — skipping duplicate effects`);
    return "ALREADY_COMPLETED";
  }

  const { data: orderItems, error: itemsErr } = await supabase
    .from("order_items")
    .select("product_id")
    .eq("order_id", paymentRecord.order_id);
  if (itemsErr) {
    console.error("Failed to load order items:", itemsErr);
    throw new Error(`Order items load failed: ${itemsErr.message}`);
  }

  if (order?.customer_id && orderItems) {
    for (const item of orderItems) {
      const { error: entErr } = await supabase.from("entitlements").upsert({
        customer_id: order.customer_id,
        product_id: item.product_id,
        order_id: paymentRecord.order_id,
      }, { onConflict: "customer_id,product_id,order_id", ignoreDuplicates: true });
      if (entErr) {
        console.error("Failed to upsert entitlement:", entErr);
        throw new Error(`Entitlement upsert failed: ${entErr.message}`);
      }

      const { error: salesErr } = await supabase.rpc("increment_product_sales", {
        p_product_id: item.product_id,
      });
      if (salesErr) console.error("Failed to increment sales_count:", salesErr);
    }

  }

  if (order?.checkout_session_id) {
    const { error: csErr } = await supabase.from("checkout_sessions").update({
      status: "COMPLETED",
      completed_at: new Date().toISOString(),
    }).eq("id", order.checkout_session_id);
    if (csErr) console.error("Failed to complete checkout session:", csErr);
  }

  // ─── Liquidação financeira: split → wallet_ledger → reserva ───
  // ATENÇÃO: wallet_ledger, split_entries, reserve_entries e security_reserves
  // armazenam valores em CENTAVOS (integer). orders.total_amount é em reais (numeric).
  if (order) {
    const totalAmount = Math.round(Number(order.total_amount || 0) * 100); // centavos
    const netFee = paymentData?.netValue
      ? Math.max(0, totalAmount - Math.round(Number(paymentData.netValue) * 100))
      : 0;
    const nowIso = new Date().toISOString();
    const paymentMethod = (order.payment_method || "credit_card").toLowerCase();
    const isCard = paymentMethod !== "pix" && paymentMethod !== "boleto";

    // 1) Split rule aplicável (produto → workspace → default global)
    const { data: ruleData } = await supabase.rpc("get_split_rule", {
      p_workspace_id: order.workspace_id,
      p_product_id: orderItems?.[0]?.product_id || null,
      p_payment_method: order.payment_method || null,
    });
    const rule = ruleData?.[0] || {
      id: null, platform_percent: 8, creator_percent: 92, affiliate_percent: 0, hold_days: 30,
    };
    const holdDays = Number(rule.hold_days ?? 30);
    const splitAvailableAt = new Date(Date.now() + holdDays * 86400000).toISOString();

    // 2) FONTE ÚNICA DE VERDADE: RPC transacional process_order_commission.
    //    Ela trava o pedido (FOR UPDATE), valida COMPLETED + paid_at, resolve
    //    link/programa/afiliado, e grava split_entries + wallet_ledger +
    //    commissions de forma idempotente (ON CONFLICT). Nenhum cálculo de
    //    comissão é duplicado aqui.
    let creatorNet = 0;
    let splitId: string | null = null;

    const { data: commResult, error: commRpcErr } = await supabase.rpc("process_order_commission", {
      p_order_id: paymentRecord.order_id,
      p_gateway_fee_cents: netFee > 0 ? netFee : null,
      p_settle: true,
    });

    if (commRpcErr) {
      console.error("[webhook-asaas][ALERTA] process_order_commission falhou:", JSON.stringify(commRpcErr));
    } else if (commResult && (commResult as any).ok !== true) {
      console.error(
        "[webhook-asaas][ALERTA] process_order_commission recusou o pedido:",
        JSON.stringify(commResult),
      );
    } else if (commResult) {
      creatorNet = Number((commResult as any).creator_net_cents || 0);
      console.log("[webhook-asaas] split/comissão processados:", JSON.stringify(commResult));
    }

    const { data: settledSplit } = await supabase
      .from("split_entries")
      .select("id, creator_net, available_at")
      .eq("order_id", paymentRecord.order_id)
      .maybeSingle();
    splitId = settledSplit?.id || null;
    if (!creatorNet) creatorNet = Number(settledSplit?.creator_net || 0);
    const ledgerAvailableAt = settledSplit?.available_at || splitAvailableAt;

    // 3) Taxa do gateway no ledger (idempotente por order_id + type via índice único)
    if (netFee > 0) {
      const { error: feeErr } = await supabase.from("wallet_ledger").insert({
        workspace_id: order.workspace_id,
        order_id: paymentRecord.order_id,
        type: "fee",
        amount: -netFee,
        currency: (order as any).currency || "BRL",
        status: "settled",
        description: `Taxa Asaas #${paymentRecord.order_id.slice(0, 8)}`,
      });
      if (feeErr && (feeErr as any).code !== "23505") {
        console.error("Failed to insert wallet_ledger fee:", feeErr);
      }
    }
    console.log(
      `[webhook-asaas] liquidação order ${paymentRecord.order_id}: creator_net=${creatorNet} liberação=${ledgerAvailableAt} (${paymentMethod}, ${holdDays}d)`,
    );

    // 4) Reserva de segurança (só cartão, % do creator_net, idempotente por order)
    if (creatorNet > 0 && isCard) {
      const { data: existingReserve } = await supabase
        .from("reserve_entries")
        .select("id")
        .eq("order_id", paymentRecord.order_id)
        .maybeSingle();

      if (!existingReserve) {
        const { data: ws } = await supabase
          .from("workspaces")
          .select("plan")
          .eq("id", order.workspace_id)
          .maybeSingle();
        const feeTier = feeTierForPlan((ws as any)?.plan);
        const { data: feeConfig } = await supabase
          .from("fee_config")
          .select("reserve_percent, reserve_hold_days")
          .eq("plan_type", feeTier)
          .maybeSingle();

        const reservePercent = Number(feeConfig?.reserve_percent ?? 0);
        const reserveHoldDays = Number(feeConfig?.reserve_hold_days ?? 0);
        const reserveAmount = Math.round(creatorNet * reservePercent / 100);

        console.log("[webhook-asaas] reserve_entries", JSON.stringify({
          fee_tier: feeTier, reservePercent, reserveHoldDays, paymentMethod, reserveAmount,
        }));

        if (reservePercent > 0 && reserveAmount > 0) {
          const { error: resErr } = await supabase.from("reserve_entries").insert({
            workspace_id: order.workspace_id,
            order_id: paymentRecord.order_id,
            split_entry_id: splitId,
            amount: reserveAmount,
            reserve_percent: reservePercent,
            // retenção adicional além do hold normal (proteção contra chargeback)
            release_at: new Date(Date.now() + (holdDays + reserveHoldDays) * 86400000).toISOString(),
            status: "held",
          });
          if (resErr) console.error("Failed to insert reserve entry:", resErr);
        }
      }
    }
  }

  // Comissões de afiliado: NÃO são calculadas aqui.
  // Fonte única = RPC public.process_order_commission (chamada acima), que grava
  // split_entries.affiliate_fee e commissions.amount no mesmo cálculo, valida a
  // atribuição por link+sessão e é idempotente por (order_id, affiliate_id).




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

  // Update transaction
  await supabase.from("transactions").update({
    status: "failed",
    failed_at: new Date().toISOString(),
    failure_reason: paymentData?.failReason || "Payment failed",
  }).eq("order_id", paymentRecord.order_id);

  return "FAILED";
}

// Cancela comissões de afiliado do pedido (refund/chargeback) para não entrar no saldo a pagar
async function cancelOrderCommissions(supabase: any, orderId: string, reason: string) {
  try {
    const { error } = await supabase
      .from("commissions")
      .update({
        status: "CANCELLED",
        cancelled_at: new Date().toISOString(),
        cancel_reason: reason,
      })
      .eq("order_id", orderId)
      .in("status", ["PENDING", "APPROVED"]);
    if (error) console.error("[Affiliate] Falha ao cancelar comissão:", error);
    else console.log(`[Affiliate] Comissões canceladas para pedido ${orderId} (${reason})`);
  } catch (e) {
    console.error("[Affiliate] Erro ao cancelar comissão (non-fatal):", e);
  }
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

  // Cancela comissões de afiliado (não entram no saldo a pagar)
  await cancelOrderCommissions(supabase, paymentRecord.order_id, "Pedido reembolsado");

  // Ledger — cancela o crédito da venda e registra o reembolso.
  // ATENÇÃO: wallet_ledger é em CENTAVOS; paymentData.value vem em REAIS.
  const refundCents = Math.round(Number(refundAmount || 0) * 100);
  await supabase.from("wallet_ledger").update({ status: "canceled" })
    .eq("order_id", paymentRecord.order_id).eq("type", "sale");
  const refundDescription = `Reembolso Asaas #${paymentRecord.order_id.slice(0, 8)}`;
  const { data: existingRefundLedger } = await supabase
    .from("wallet_ledger")
    .select("id")
    .eq("order_id", paymentRecord.order_id)
    .eq("type", "refund")
    .maybeSingle();
  if (!existingRefundLedger) {
    await supabase.from("wallet_ledger").insert({
      workspace_id: paymentRecord.workspace_id,
      order_id: paymentRecord.order_id,
      type: "refund",
      amount: -refundCents,
      status: "settled",
      description: refundDescription,
    });
  }

  // Reverse split entry
  await supabase.from("split_entries").update({
    status: "refunded",
    refunded_at: new Date().toISOString(),
  }).eq("order_id", paymentRecord.order_id);

  // Forfeit any held reserve for this order
  await supabase.from("reserve_entries").update({
    status: "forfeited",
    released_at: new Date().toISOString(),
  }).eq("order_id", paymentRecord.order_id).eq("status", "held");

  // Update transaction + security_reserves (new model)
  await supabase.from("transactions").update({
    status: "refunded",
    refunded_at: new Date().toISOString(),
  }).eq("order_id", paymentRecord.order_id);

  await supabase.from("security_reserves").update({
    status: "forfeited",
    released_at: new Date().toISOString(),
  }).eq("order_id", paymentRecord.order_id).eq("status", "held");

  return "REFUNDED";
}

async function handleChargeback(supabase: any, paymentRecord: any, paymentData: any): Promise<string> {
  if (!paymentRecord) return "NOT_FOUND";

  const chargebackAmount = paymentData?.value || 0;

  // 1. Create chargeback case with SLA (7 days to submit evidence)
  const slaDeadline = new Date(Date.now() + 7 * 86400000).toISOString();
  const { data: cbCase } = await supabase.from("chargeback_cases").insert({
    workspace_id: paymentRecord.workspace_id,
    order_id: paymentRecord.order_id,
    payment_id: paymentRecord.id,
    gateway_dispute_id: paymentData?.id || null,
    amount: chargebackAmount,
    reason: paymentData?.chargebackReason || "Chargeback",
    status: "new",
    sla_deadline_at: slaDeadline,
    financial_impact: chargebackAmount,
  }).select("id").single();

  // 2. Timeline entry
  if (cbCase) {
    await supabase.from("chargeback_timeline").insert({
      case_id: cbCase.id,
      action: "case_opened",
      note: `Chargeback recebido do Asaas. Valor: ${chargebackAmount}. Prazo para evidência: 7 dias.`,
      metadata: { gateway_id: paymentData?.id, amount: chargebackAmount },
    });
  }

  // 3. Update order status
  await supabase.from("orders").update({ status: "DISPUTED" }).eq("id", paymentRecord.order_id);

  // 3b. Cancela comissões de afiliado do pedido contestado
  await cancelOrderCommissions(supabase, paymentRecord.order_id, "Chargeback aberto");

  // 4. Reverse split entry (freeze creator balance)
  await supabase.from("split_entries").update({
    status: "refunded",
    refunded_at: new Date().toISOString(),
  }).eq("order_id", paymentRecord.order_id);

  // 5. Forfeit any held reserve for this order (legacy + new model)
  await supabase.from("reserve_entries").update({
    status: "forfeited",
    released_at: new Date().toISOString(),
  }).eq("order_id", paymentRecord.order_id).eq("status", "held");

  await supabase.from("security_reserves").update({
    status: "forfeited",
    released_at: new Date().toISOString(),
  }).eq("order_id", paymentRecord.order_id).eq("status", "held");

  // 5b. Update transaction to disputed
  await supabase.from("transactions").update({
    status: "disputed",
  }).eq("order_id", paymentRecord.order_id);

  // 6. Ledger reversal — wallet_ledger em CENTAVOS, paymentData.value em REAIS.
  const chargebackCents = Math.round(Number(chargebackAmount || 0) * 100);
  await supabase.from("wallet_ledger").update({ status: "canceled" })
    .eq("order_id", paymentRecord.order_id).eq("type", "sale");
  const { data: existingCbLedger } = await supabase
    .from("wallet_ledger")
    .select("id")
    .eq("order_id", paymentRecord.order_id)
    .eq("type", "chargeback")
    .maybeSingle();
  if (!existingCbLedger) {
    const { error: cbLedgerErr } = await supabase.from("wallet_ledger").insert({
      workspace_id: paymentRecord.workspace_id,
      order_id: paymentRecord.order_id,
      type: "chargeback",
      amount: -chargebackCents,
      status: "settled",
      description: `Chargeback #${paymentRecord.order_id.slice(0, 8)}`,
    });
    if (cbLedgerErr) console.error("[webhook-asaas] falha ao lançar chargeback no ledger:", cbLedgerErr);
  }

  // 7. Check if creator balance went negative → block payouts
  const { data: balanceData } = await supabase.rpc("get_creator_balance", {
    p_workspace_id: paymentRecord.workspace_id,
  });
  const creatorBalance = balanceData?.[0]?.available_balance || 0;
  if (creatorBalance < 0) {
    // Block all pending payouts for this workspace
    await supabase.from("payout_requests").update({
      status: "failed",
      failed_reason: "Saldo negativo por chargeback — payout bloqueado",
      processed_at: new Date().toISOString(),
    }).eq("workspace_id", paymentRecord.workspace_id).in("status", ["requested", "processing"]);
  }

  // 8. Auto-increase reserve for high-risk workspaces
  const { data: riskData } = await supabase.rpc("calculate_payout_risk", {
    p_workspace_id: paymentRecord.workspace_id,
  });
  const riskScore = riskData?.[0]?.risk_score || 0;
  if (riskScore >= 40) {
    // Increase reserve to 20% and extend window to 60 days
    await supabase.from("reserve_policies").upsert({
      workspace_id: paymentRecord.workspace_id,
      reserve_percent: Math.min(20 + Math.floor(riskScore / 10), 50),
      release_window_days: 60,
      auto_adjust_by_risk: true,
    }, { onConflict: "workspace_id" });
  }

  // 9. Send Telegram alert
  try {
    const telegramKey = Deno.env.get("TELEGRAM_API_KEY");
    const chatId = Deno.env.get("TELEGRAM_CHAT_ID");
    if (telegramKey && chatId) {
      const msg = `🚨 CHARGEBACK\nWorkspace: ${paymentRecord.workspace_id.slice(0, 8)}\nOrder: ${paymentRecord.order_id.slice(0, 8)}\nValor: R$ ${Number(chargebackAmount).toFixed(2)}\nRisk Score: ${riskScore}`;
      await fetch(`https://api.telegram.org/bot${telegramKey}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: msg }),
      });
    }
  } catch (e) {
    console.error("Telegram alert error (non-fatal):", e);
  }

  // 10. Notify creator
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    await fetch(`${supabaseUrl}/functions/v1/notify-creator`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        event_type: "chargeback_opened",
        workspace_id: paymentRecord.workspace_id,
        data: { order_number: paymentRecord.order_id.slice(0, 8), amount: chargebackAmount, reason: paymentData?.chargebackReason },
      }),
    });
  } catch (e) { console.error("Notify creator error (non-fatal):", e); }

  console.log(`Asaas: Chargeback case created for order ${paymentRecord.order_id}`);
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

// ── Platform Subscription Event Handler ──

async function handleSubscriptionEvent(supabase: any, eventType: string, payload: any): Promise<string> {
  const subData = payload?.subscription || payload;
  const asaasSubId = subData?.id;
  if (!asaasSubId) return "NO_SUBSCRIPTION_ID";

  const { data: sub } = await supabase
    .from("workspace_subscriptions")
    .select("id, workspace_id, status, plan_code, next_plan_code, change_effective_at, last_event_at")
    .eq("provider_subscription_id", asaasSubId)
    .maybeSingle();

  if (!sub) {
    return await handleCircleSubscriptionEvent(supabase, eventType, asaasSubId, subData);
  }

  let newStatus: string;
  switch (eventType) {
    // Never downgrade an already-paid subscription because of a late CREATED event
    case "SUBSCRIPTION_CREATED":
      newStatus = ["active", "trialing"].includes(sub.status) ? sub.status : "pending";
      break;
    case "SUBSCRIPTION_UPDATED": newStatus = sub.status; break;
    case "SUBSCRIPTION_DELETED":
    case "SUBSCRIPTION_INACTIVATED": newStatus = "canceled"; break;
    case "SUBSCRIPTION_REACTIVATED": newStatus = "active"; break;
    default: newStatus = sub.status; break;
  }

  // Out-of-order protection
  const eventTimestamp = subData?.dateCreated || new Date().toISOString();
  if (sub.last_event_at && new Date(eventTimestamp) < new Date(sub.last_event_at)) {
    console.log(`Skipping out-of-order subscription event ${eventType} for ${asaasSubId}`);
    return "OUT_OF_ORDER_SKIPPED";
  }

  const updatePayload: any = {
    status: newStatus,
    last_event_id: payload?.id || eventType,
    last_event_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (newStatus === "canceled") {
    updatePayload.canceled_at = new Date().toISOString();
  }

  // On reactivation, clear canceled_at
  if (eventType === "SUBSCRIPTION_REACTIVATED") {
    updatePayload.canceled_at = null;
  }

  await supabase.from("workspace_subscriptions").update(updatePayload).eq("id", sub.id);

  // ── Terminate referral on cancellation ──
  if (newStatus === "canceled") {
    try {
      await terminateReferralOnCancel(supabase, sub);
    } catch (refErr) {
      console.error("Referral termination error (non-fatal):", refErr);
    }
  }

  await supabase.from("audit_logs").insert({
    workspace_id: sub.workspace_id,
    entity_type: "subscription",
    entity_id: sub.id,
    action: "subscription_state_changed",
    metadata: { event_type: eventType, old_status: sub.status, new_status: newStatus, provider_subscription_id: asaasSubId },
  });

  console.log(`Subscription ${asaasSubId}: ${sub.status} → ${newStatus} (${eventType})`);
  return newStatus;
}

async function handleSubscriptionInvoicePaid(supabase: any, paymentData: any): Promise<string> {
  const asaasSubId = paymentData?.subscription;
  if (!asaasSubId) return "NOT_FOUND";

  const { data: wsSub } = await supabase
    .from("workspace_subscriptions")
    .select("id, workspace_id, status, plan_code, billing_cycle, next_plan_code, change_effective_at")
    .eq("provider_subscription_id", asaasSubId)
    .maybeSingle();

  if (wsSub) {
    const isAnnual = wsSub.billing_cycle === "annual";
    const periodEnd = new Date();
    periodEnd.setDate(periodEnd.getDate() + (isAnnual ? 365 : 30));

    const updateData: any = {
      status: "active",
      current_period_start: new Date().toISOString(),
      current_period_end: periodEnd.toISOString(),
      last_event_id: paymentData?.id,
      last_event_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Apply scheduled downgrade on renewal
    if (wsSub.next_plan_code && wsSub.change_effective_at && new Date(wsSub.change_effective_at) <= new Date()) {
      updateData.plan_code = wsSub.next_plan_code;
      updateData.next_plan_code = null;
      updateData.change_effective_at = null;
    }

    await supabase.from("workspace_subscriptions").update(updateData).eq("id", wsSub.id);

    await supabase.from("audit_logs").insert({
      workspace_id: wsSub.workspace_id,
      entity_type: "subscription",
      entity_id: wsSub.id,
      action: "subscription_state_changed",
      metadata: {
        event_type: "invoice_paid",
        old_status: wsSub.status,
        new_status: "active",
        plan_code: updateData.plan_code || wsSub.plan_code,
        downgrade_applied: !!updateData.plan_code && updateData.plan_code !== wsSub.plan_code,
      },
    });

    // ── Referral commission processing ──
    try {
      await processReferralCommission(supabase, wsSub, paymentData);
    } catch (refErr) {
      console.error("Referral commission error (non-fatal):", refErr);
    }

    console.log(`Workspace subscription ${wsSub.id} renewed. Plan: ${updateData.plan_code || wsSub.plan_code}`);
    return "active";
  }

  return await handleSubscriptionPaid(supabase, paymentData);
}

async function handleSubscriptionInvoiceFailed(supabase: any, paymentData: any): Promise<string> {
  const asaasSubId = paymentData?.subscription;
  if (!asaasSubId) return "NOT_FOUND";

  const { data: wsSub } = await supabase
    .from("workspace_subscriptions")
    .select("id, workspace_id, status, plan_code")
    .eq("provider_subscription_id", asaasSubId)
    .maybeSingle();

  if (wsSub) {
    await supabase.from("workspace_subscriptions").update({
      status: "past_due",
      last_event_id: paymentData?.id,
      last_event_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", wsSub.id);

    await supabase.from("audit_logs").insert({
      workspace_id: wsSub.workspace_id,
      entity_type: "subscription",
      entity_id: wsSub.id,
      action: "subscription_state_changed",
      metadata: { event_type: "invoice_failed", old_status: wsSub.status, new_status: "past_due", plan_code: wsSub.plan_code },
    });

    console.log(`Workspace subscription ${wsSub.id} marked past_due`);
    return "past_due";
  }

  return "NOT_FOUND";
}

async function handleCircleSubscriptionEvent(supabase: any, eventType: string, asaasSubId: string, subData: any): Promise<string> {
  console.log(`No workspace subscription found for ${asaasSubId}, checking circle subscriptions`);
  return "NOT_FOUND";
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

// ── Referral Commission Helpers ──
// Fonte única = RPC public.record_subscription_referral_commission:
// idempotente por (payment_id, event_type), payment_id TEXTUAL (pay_...),
// valida a atribuição travada do usuário indicado e atualiza first_paid_at.

async function processReferralCommission(supabase: any, wsSub: any, paymentData: any) {
  const { data: wsOwner, error: ownerErr } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", wsSub.workspace_id)
    .eq("role", "OWNER")
    .maybeSingle();

  if (ownerErr) {
    console.error("[Referral] Falha ao buscar owner do workspace:", JSON.stringify(ownerErr));
    return;
  }
  if (!wsOwner?.user_id) return;

  const referredUserId = wsOwner.user_id;
  const providerEventId = paymentData?.id ? String(paymentData.id) : "";
  const paymentAmount = Number(paymentData?.value || 0);

  if (!providerEventId) {
    console.error("[Referral] Evento sem payment id — comissão não registrada");
    return;
  }
  if (paymentAmount <= 0) {
    console.error(`[Referral] Valor inválido (${paymentAmount}) no evento ${providerEventId}`);
    return;
  }

  const { data: result, error: rpcErr } = await supabase.rpc(
    "record_subscription_referral_commission",
    {
      p_referred_user_id: referredUserId,
      p_payment_id: providerEventId,
      p_amount: paymentAmount,
      p_event_type: null,
      p_subscription_id: wsSub.id,
    },
  );

  if (rpcErr) {
    console.error("[Referral] RPC de comissão falhou:", JSON.stringify(rpcErr));
    return;
  }

  if (!result?.ok) {
    // Sem atribuição válida: registra reassinatura sem indicação, se houver histórico
    if (result?.error === "no_attribution") {
      const { data: terminated } = await supabase
        .from("referral_attributions")
        .select("id, referrer_user_id")
        .eq("referred_user_id", referredUserId)
        .eq("referral_status", "terminated")
        .maybeSingle();

      if (terminated) {
        const { error: auditErr } = await supabase.from("referral_audit_log").insert({
          referrer_user_id: terminated.referrer_user_id,
          referred_user_id: referredUserId,
          event_type: "resubscription_without_referral",
          subscription_id: wsSub.id,
          plan_id: wsSub.plan_code,
          payment_provider_event_id: providerEventId,
        });
        if (auditErr) console.error("[Referral] Falha no audit log:", JSON.stringify(auditErr));
      }
      return;
    }
    console.error("[Referral] Comissão não registrada:", JSON.stringify(result));
    return;
  }

  if (result.duplicate) {
    console.log(`[Referral] Evento ${providerEventId} já processado — nada duplicado`);
    return;
  }

  if (result.first_payment) {
    const { error: auditErr } = await supabase.from("referral_audit_log").insert({
      referrer_user_id: result.referrer_user_id,
      referred_user_id: referredUserId,
      event_type: "first_subscription_paid",
      subscription_id: wsSub.id,
      plan_id: wsSub.plan_code,
      payment_provider_event_id: providerEventId,
      metadata: { amount: paymentAmount, commission: result.amount },
    });
    if (auditErr) console.error("[Referral] Falha no audit log:", JSON.stringify(auditErr));
  }

  console.log(
    `[Referral] Comissão R$${result.amount} registrada para ${result.referrer_user_id} (${result.first_payment ? "primeira" : "recorrente"})`,
  );
}

async function terminateReferralOnCancel(supabase: any, sub: any) {
  // Find workspace owner
  const { data: wsOwner } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", sub.workspace_id)
    .eq("role", "OWNER")
    .maybeSingle();

  if (!wsOwner?.user_id) return;

  const { data: attribution } = await supabase
    .from("referral_attributions")
    .select("id, referrer_user_id")
    .eq("referred_user_id", wsOwner.user_id)
    .eq("referral_status", "active")
    .maybeSingle();

  if (!attribution) return;

  await supabase
    .from("referral_attributions")
    .update({
      referral_status: "terminated",
      referral_terminated_at: new Date().toISOString(),
    })
    .eq("id", attribution.id);

  await supabase.from("referral_audit_log").insert({
    referrer_user_id: attribution.referrer_user_id,
    referred_user_id: wsOwner.user_id,
    event_type: "referral_terminated_on_cancel",
    subscription_id: sub.id,
    metadata: { workspace_id: sub.workspace_id },
  });

  console.log(`[Referral] Terminated referral for user ${wsOwner.user_id} on subscription cancel`);
}
