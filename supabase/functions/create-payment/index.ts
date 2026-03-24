import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PAGARME_BASE = "https://api.pagar.me/core/v5";

async function callPagarme(path: string, body: unknown, apiKey: string) {
  const res = await fetch(`${PAGARME_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${btoa(apiKey + ":")}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("Pagar.me error:", JSON.stringify(data));
    throw new Error(data?.message || `Pagar.me returned ${res.status}`);
  }
  return data;
}

function simulatePayment(method: string, totalAmount: number) {
  if (method === "pix") {
    return {
      status: "pending",
      gateway_payment_id: `sim_pix_${crypto.randomUUID().slice(0, 8)}`,
      pix: {
        qr_code: `00020126580014br.gov.bcb.pix0136${crypto.randomUUID()}5204000053039865802BR5925KIVO PAGAMENTOS6009SAO PAULO62070503***6304`,
        qr_code_url: "",
        expires_at: new Date(Date.now() + 30 * 60000).toISOString(),
      },
    };
  }
  if (method === "credit_card") {
    return {
      status: "paid",
      gateway_payment_id: `sim_cc_${crypto.randomUUID().slice(0, 8)}`,
    };
  }
  if (method === "boleto") {
    return {
      status: "pending",
      gateway_payment_id: `sim_bol_${crypto.randomUUID().slice(0, 8)}`,
      boleto: {
        barcode: `23793.38128 60000.${String(Date.now()).slice(-6)} 00000.000${Math.floor(Math.random() * 900) + 100} 1 ${String(Math.floor(totalAmount * 100)).padStart(10, "0")}`,
        pdf_url: "",
      },
    };
  }
  throw new Error("Método inválido");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      product_id, price_id, method, customer, workspace_id,
      checkout_session_id, card, installments, coupon_code,
      affiliate_link_id, idempotency_key, bump_product_ids,
    } = body;

    // Validate required fields
    if (!product_id || !price_id || !method || !customer?.email || !customer?.name || !customer?.cpf || !workspace_id) {
      return new Response(JSON.stringify({ error: "Campos obrigatórios não preenchidos" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cpf = customer.cpf.replace(/\D/g, "");
    if (cpf.length !== 11) {
      return new Response(JSON.stringify({ error: "CPF inválido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (method === "credit_card" && (!card?.number || !card?.cvv || !card?.exp_month || !card?.exp_year || !card?.holder_name)) {
      return new Response(JSON.stringify({ error: "Dados do cartão incompletos" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Idempotency check
    if (idempotency_key) {
      const { data: existingOrder } = await supabase
        .from("orders")
        .select("id, status")
        .eq("idempotency_key", idempotency_key)
        .maybeSingle();
      if (existingOrder) {
        return new Response(JSON.stringify({ order_id: existingOrder.id, status: existingOrder.status, message: "Pedido já existente" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Fetch workspace to get Pagar.me credentials from metadata
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("id, metadata")
      .eq("id", workspace_id)
      .single();

    if (!workspace) {
      return new Response(JSON.stringify({ error: "Workspace não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const wsMeta = (workspace.metadata as Record<string, unknown>) || {};
    const pagarmeApiKey = (wsMeta.pagarme_api_key as string) || Deno.env.get("PAGARME_API_KEY") || "";
    const useLive = !!pagarmeApiKey;

    // Fetch product
    const { data: product } = await supabase
      .from("products")
      .select("id, name, slug, workspace_id, type")
      .eq("id", product_id)
      .single();
    if (!product) {
      return new Response(JSON.stringify({ error: "Produto não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify product belongs to workspace
    if (product.workspace_id !== workspace_id) {
      return new Response(JSON.stringify({ error: "Produto não pertence a este workspace" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch price
    const { data: price } = await supabase
      .from("prices")
      .select("id, amount, pix_discount_percent, max_installments")
      .eq("id", price_id)
      .single();
    if (!price) {
      return new Response(JSON.stringify({ error: "Preço não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Calculate totals
    let subtotal = price.amount;
    let discountAmount = 0;

    // PIX discount
    if (method === "pix" && price.pix_discount_percent) {
      discountAmount += subtotal * (price.pix_discount_percent / 100);
    }

    // Bump products
    const bumpItems: { product_id: string; price_id: string; amount: number }[] = [];
    if (bump_product_ids && Array.isArray(bump_product_ids)) {
      for (const bumpId of bump_product_ids) {
        const { data: bumpPrice } = await supabase
          .from("prices")
          .select("id, amount, product_id")
          .eq("product_id", bumpId)
          .eq("is_default", true)
          .eq("is_active", true)
          .maybeSingle();
        if (bumpPrice) {
          bumpItems.push({ product_id: bumpPrice.product_id, price_id: bumpPrice.id, amount: bumpPrice.amount });
          subtotal += bumpPrice.amount;
        }
      }
    }

    const totalAmount = Math.max(0, subtotal - discountAmount);

    // Upsert customer
    const { data: existingCustomer } = await supabase
      .from("customers")
      .select("id")
      .eq("workspace_id", workspace_id)
      .eq("email", customer.email)
      .maybeSingle();

    let customerId: string;
    if (existingCustomer) {
      customerId = existingCustomer.id;
      await supabase.from("customers").update({
        name: customer.name, cpf, phone: customer.phone || null,
      }).eq("id", customerId);
    } else {
      const { data: newCust } = await supabase
        .from("customers")
        .insert({ workspace_id, email: customer.email, name: customer.name, cpf, phone: customer.phone || null })
        .select("id")
        .single();
      customerId = newCust!.id;
    }

    // Create order
    const { data: order } = await supabase
      .from("orders")
      .insert({
        workspace_id,
        product_id: product.id,
        customer_id: customerId,
        customer_email: customer.email,
        customer_name: customer.name,
        subtotal_amount: subtotal,
        discount_amount: discountAmount,
        total_amount: totalAmount,
        payment_method: method,
        status: "PENDING",
        idempotency_key: idempotency_key || null,
        checkout_session_id: checkout_session_id || null,
        affiliate_link_id: affiliate_link_id || null,
      })
      .select("id")
      .single();

    if (!order) {
      return new Response(JSON.stringify({ error: "Erro ao criar pedido" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create order items
    const orderItems = [
      { order_id: order.id, product_id: product.id, price_id: price.id, quantity: 1, unit_amount: price.amount, total_amount: price.amount, is_order_bump: false, is_upsell: false },
      ...bumpItems.map((b) => ({
        order_id: order.id, product_id: b.product_id, price_id: b.price_id, quantity: 1, unit_amount: b.amount, total_amount: b.amount, is_order_bump: true, is_upsell: false,
      })),
    ];
    await supabase.from("order_items").insert(orderItems);

    // Update checkout session
    if (checkout_session_id) {
      await supabase.from("checkout_sessions").update({
        customer_id: customerId,
        status: method === "pix" ? "AWAITING_PAYMENT" : "PROCESSING",
        subtotal_amount: subtotal,
        discount_amount: discountAmount,
        total_amount: totalAmount,
        coupon_code: coupon_code || null,
        affiliate_link_id: affiliate_link_id || null,
      }).eq("id", checkout_session_id);
    }

    // --- Payment Processing ---
    let gatewayResult: any;

    if (useLive) {
      console.log("Processing via Pagar.me live API for workspace", workspace_id);

      const pagarmeCustomer = {
        name: customer.name,
        email: customer.email,
        document: cpf,
        document_type: "CPF",
        type: "individual",
        phones: customer.phone ? {
          mobile_phone: {
            country_code: "55",
            area_code: customer.phone.replace(/\D/g, "").slice(0, 2),
            number: customer.phone.replace(/\D/g, "").slice(2),
          },
        } : undefined,
      };

      const pagarmeItems = [
        { amount: Math.round(price.amount * 100), description: product.name, quantity: 1, code: product.id },
        ...bumpItems.map((b, i) => ({ amount: Math.round(b.amount * 100), description: `Bump ${i + 1}`, quantity: 1, code: b.product_id })),
      ];

      let payments: any[];

      if (method === "pix") {
        payments = [{
          payment_method: "pix",
          pix: { expires_in: 1800 },
          amount: Math.round(totalAmount * 100),
        }];
      } else if (method === "credit_card") {
        payments = [{
          payment_method: "credit_card",
          credit_card: {
            installments: installments || 1,
            card: {
              number: card.number,
              holder_name: card.holder_name,
              exp_month: parseInt(card.exp_month),
              exp_year: parseInt(card.exp_year),
              cvv: card.cvv,
            },
            statement_descriptor: "KIVO",
          },
          amount: Math.round(totalAmount * 100),
        }];
      } else if (method === "boleto") {
        payments = [{
          payment_method: "boleto",
          boleto: {
            instructions: "Pagar até o vencimento",
            due_at: new Date(Date.now() + 3 * 86400000).toISOString(),
          },
          amount: Math.round(totalAmount * 100),
        }];
      } else {
        return new Response(JSON.stringify({ error: "Método de pagamento inválido" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const pagarmeOrder = await callPagarme("/orders", {
        items: pagarmeItems,
        customer: pagarmeCustomer,
        payments,
        closed: true,
        antifraud_enabled: method === "credit_card",
        metadata: { order_id: order.id, workspace_id },
      }, pagarmeApiKey);

      const charge = pagarmeOrder.charges?.[0];
      const lastTx = charge?.last_transaction;

      gatewayResult = {
        status: charge?.status === "paid" ? "paid" : "pending",
        gateway_payment_id: charge?.id || pagarmeOrder.id,
        pix: lastTx?.qr_code ? {
          qr_code: lastTx.qr_code,
          qr_code_url: lastTx.qr_code_url,
          expires_at: lastTx.expires_at,
        } : undefined,
        boleto: lastTx?.pdf ? {
          barcode: lastTx.line,
          pdf_url: lastTx.pdf,
        } : undefined,
      };
    } else {
      console.log("Processing in SIMULATED mode (no Pagar.me credentials)");
      gatewayResult = simulatePayment(method, totalAmount);
    }

    // Create payment record
    const paymentStatus = gatewayResult.status === "paid" ? "SUCCEEDED" : "PENDING";
    const { data: payment } = await supabase
      .from("payments")
      .insert({
        workspace_id,
        order_id: order.id,
        method,
        amount: totalAmount,
        status: paymentStatus,
        gateway_payment_id: gatewayResult.gateway_payment_id || null,
        installments: installments || 1,
        processed_at: paymentStatus === "SUCCEEDED" ? new Date().toISOString() : null,
      })
      .select("id")
      .single();

    // PIX data
    if (method === "pix" && gatewayResult.pix) {
      await supabase.from("pix_payment_data").insert({
        payment_id: payment!.id,
        qr_code: gatewayResult.pix.qr_code,
        qr_code_url: gatewayResult.pix.qr_code_url || null,
        copy_paste_code: gatewayResult.pix.qr_code,
        expires_at: gatewayResult.pix.expires_at,
      });
    }

    // If paid immediately (credit card)
    if (paymentStatus === "SUCCEEDED") {
      await supabase.from("orders").update({ status: "COMPLETED", paid_at: new Date().toISOString() }).eq("id", order.id);
      if (checkout_session_id) {
        await supabase.from("checkout_sessions").update({ status: "COMPLETED", completed_at: new Date().toISOString() }).eq("id", checkout_session_id);
      }

      // Grant entitlements immediately for card payments
      await grantEntitlements(supabase, order.id, customerId, orderItems);
    }

    // Build response
    const response: any = {
      order_id: order.id,
      payment_id: payment!.id,
      status: gatewayResult.status,
    };

    if (method === "pix" && gatewayResult.pix) {
      response.pix_qr_code = gatewayResult.pix.qr_code;
      response.pix_qr_code_url = gatewayResult.pix.qr_code_url || "";
      response.expires_at = gatewayResult.pix.expires_at;
    }
    if (method === "boleto" && gatewayResult.boleto) {
      response.boleto_barcode = gatewayResult.boleto.barcode;
      response.boleto_pdf_url = gatewayResult.boleto.pdf_url || "";
    }
    if (gatewayResult.status === "paid") {
      response.message = "Pagamento aprovado";
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Payment error:", err);
    return new Response(JSON.stringify({ error: err.message || "Erro interno do servidor" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Helper: Grant entitlements idempotently
async function grantEntitlements(
  supabase: any,
  orderId: string,
  customerId: string,
  orderItems: { product_id: string }[]
) {
  for (const item of orderItems) {
    // Check if entitlement already exists
    const { data: existing } = await supabase
      .from("entitlements")
      .select("id")
      .eq("order_id", orderId)
      .eq("product_id", item.product_id)
      .eq("customer_id", customerId)
      .maybeSingle();

    if (!existing) {
      await supabase.from("entitlements").insert({
        customer_id: customerId,
        product_id: item.product_id,
        order_id: orderId,
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
