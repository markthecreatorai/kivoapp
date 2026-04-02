import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Asaas API ──

function getAsaasBase() {
  const env = Deno.env.get("ASAAS_ENV") || "sandbox";
  return env === "production"
    ? "https://api.asaas.com/v3"
    : "https://sandbox.asaas.com/api/v3";
}

async function callAsaas(path: string, body: unknown, apiKey: string, method = "POST") {
  const res = await fetch(`${getAsaasBase()}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "access_token": apiKey,
    },
    body: method !== "GET" ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("Asaas error:", JSON.stringify(data));
    throw new Error(data?.errors?.[0]?.description || `Asaas returned ${res.status}`);
  }
  return data;
}

async function findOrCreateAsaasCustomer(
  customer: { name: string; email: string; cpf: string; phone?: string },
  apiKey: string
): Promise<string> {
  // Search by CPF
  try {
    const search = await callAsaas(`/customers?cpfCnpj=${customer.cpf}`, null, apiKey, "GET");
    if (search?.data?.length > 0) return search.data[0].id;
  } catch { /* ignore */ }

  // Create
  const created = await callAsaas("/customers", {
    name: customer.name,
    email: customer.email,
    cpfCnpj: customer.cpf,
    mobilePhone: customer.phone?.replace(/\D/g, "") || undefined,
  }, apiKey);
  return created.id;
}

// ── Simulation fallback ──

function simulatePayment(method: string, _totalAmount: number) {
  if (method === "pix") {
    return {
      status: "pending",
      gateway_payment_id: `sim_pix_${crypto.randomUUID().slice(0, 8)}`,
      provider: "simulation",
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
      provider: "simulation",
      card_last4: "4242",
      card_brand: "visa",
    };
  }
  if (method === "boleto") {
    return {
      status: "pending",
      gateway_payment_id: `sim_bol_${crypto.randomUUID().slice(0, 8)}`,
      provider: "simulation",
      boleto: {
        barcode: `23793.38128 60000.${String(Date.now()).slice(-6)} 00000.000${Math.floor(Math.random() * 900) + 100} 1 0000000000`,
        pdf_url: "",
        due_at: new Date(Date.now() + 3 * 86400000).toISOString(),
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

    if (!product_id || !price_id || !method || !customer?.email || !customer?.name || !customer?.cpf || !workspace_id) {
      return new Response(JSON.stringify({ error: "Campos obrigatórios não preenchidos" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cpf = customer.cpf.replace(/\D/g, "");
    if (cpf.length !== 11 && cpf.length !== 14) {
      return new Response(JSON.stringify({ error: "CPF/CNPJ inválido" }), {
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

    // Verify workspace exists
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("id")
      .eq("id", workspace_id)
      .single();

    if (!workspace) {
      return new Response(JSON.stringify({ error: "Workspace não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Platform-owned model: always use global platform credentials
    const asaasApiKey = Deno.env.get("ASAAS_API_KEY") || "";
    const useAsaas = !!asaasApiKey;

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
    if (method === "pix" && price.pix_discount_percent) {
      discountAmount += subtotal * (price.pix_discount_percent / 100);
    }

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
    const selectedInstallments = Math.min(installments || 1, price.max_installments || 12);

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

    const orderItems = [
      { order_id: order.id, product_id: product.id, price_id: price.id, quantity: 1, unit_amount: price.amount, total_amount: price.amount, is_order_bump: false, is_upsell: false },
      ...bumpItems.map((b) => ({
        order_id: order.id, product_id: b.product_id, price_id: b.price_id, quantity: 1, unit_amount: b.amount, total_amount: b.amount, is_order_bump: true, is_upsell: false,
      })),
    ];
    await supabase.from("order_items").insert(orderItems);

    if (checkout_session_id) {
      await supabase.from("checkout_sessions").update({
        customer_id: customerId,
        status: method === "credit_card" ? "PROCESSING" : "AWAITING_PAYMENT",
        subtotal_amount: subtotal,
        discount_amount: discountAmount,
        total_amount: totalAmount,
        coupon_code: coupon_code || null,
        affiliate_link_id: affiliate_link_id || null,
      }).eq("id", checkout_session_id);
    }

    // ─── Payment Processing ───
    let gatewayResult: any;

    if (useAsaas) {
      console.log("Processing via Asaas for workspace", workspace_id);

      // 1. Find or create Asaas customer
      const asaasCustomerId = await findOrCreateAsaasCustomer(
        { name: customer.name, email: customer.email, cpf, phone: customer.phone },
        asaasApiKey
      );

      // Asaas amounts are in BRL (decimal), our DB stores cents-ish — amount field is in reais
      // prices.amount is stored as number (reais), so totalAmount is already in reais
      const amountBRL = totalAmount;

      if (method === "pix") {
        const charge = await callAsaas("/payments", {
          customer: asaasCustomerId,
          billingType: "PIX",
          value: amountBRL,
          description: product.name,
          externalReference: order.id,
          dueDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
        }, asaasApiKey);

        // Get PIX QR code
        let pixData: any = {};
        try {
          pixData = await callAsaas(`/payments/${charge.id}/pixQrCode`, null, asaasApiKey, "GET");
        } catch (e) {
          console.error("PIX QR fetch error:", e);
        }

        gatewayResult = {
          status: "pending",
          gateway_payment_id: charge.id,
          provider: "asaas",
          pix: {
            qr_code: pixData?.payload || "",
            qr_code_url: pixData?.encodedImage ? `data:image/png;base64,${pixData.encodedImage}` : "",
            expires_at: new Date(Date.now() + 30 * 60000).toISOString(),
          },
        };
      } else if (method === "credit_card") {
        const charge = await callAsaas("/payments", {
          customer: asaasCustomerId,
          billingType: "CREDIT_CARD",
          value: amountBRL,
          description: product.name,
          externalReference: order.id,
          dueDate: new Date().toISOString().slice(0, 10),
          installmentCount: selectedInstallments > 1 ? selectedInstallments : undefined,
          creditCard: {
            holderName: card.holder_name,
            number: card.number.replace(/\s/g, ""),
            expiryMonth: card.exp_month,
            expiryYear: card.exp_year.length === 2 ? `20${card.exp_year}` : card.exp_year,
            ccv: card.cvv,
          },
          creditCardHolderInfo: {
            name: customer.name,
            email: customer.email,
            cpfCnpj: cpf,
            phone: customer.phone?.replace(/\D/g, "") || undefined,
            postalCode: customer.zip || undefined,
          },
        }, asaasApiKey);

        gatewayResult = {
          status: charge.status === "CONFIRMED" || charge.status === "RECEIVED" ? "paid" : "pending",
          gateway_payment_id: charge.id,
          provider: "asaas",
          card_last4: card.number.replace(/\s/g, "").slice(-4),
          card_brand: charge.creditCard?.creditCardBrand || "unknown",
        };
      } else if (method === "boleto") {
        const charge = await callAsaas("/payments", {
          customer: asaasCustomerId,
          billingType: "BOLETO",
          value: amountBRL,
          description: product.name,
          externalReference: order.id,
          dueDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
        }, asaasApiKey);

        gatewayResult = {
          status: "pending",
          gateway_payment_id: charge.id,
          provider: "asaas",
          boleto: {
            barcode: charge.nossoNumero || "",
            pdf_url: charge.bankSlipUrl || "",
            due_at: charge.dueDate,
          },
        };
      } else {
        return new Response(JSON.stringify({ error: "Método de pagamento inválido" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      console.log("Processing in SIMULATED mode (no gateway credentials)");
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
        installments: selectedInstallments,
        processed_at: paymentStatus === "SUCCEEDED" ? new Date().toISOString() : null,
        card_last4: gatewayResult.card_last4 || null,
        card_brand: gatewayResult.card_brand || null,
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
      await grantEntitlements(supabase, order.id, customerId, orderItems);
    }

    // Build response
    const response: any = {
      order_id: order.id,
      payment_id: payment!.id,
      status: gatewayResult.status,
      provider: gatewayResult.provider || "simulation",
    };

    if (method === "pix" && gatewayResult.pix) {
      response.pix_qr_code = gatewayResult.pix.qr_code;
      response.pix_qr_code_url = gatewayResult.pix.qr_code_url || "";
      response.expires_at = gatewayResult.pix.expires_at;
    }
    if (method === "boleto" && gatewayResult.boleto) {
      response.boleto_barcode = gatewayResult.boleto.barcode;
      response.boleto_pdf_url = gatewayResult.boleto.pdf_url || "";
      response.boleto_due_at = gatewayResult.boleto.due_at || new Date(Date.now() + 3 * 86400000).toISOString();
    }
    if (gatewayResult.status === "paid") {
      response.message = "Pagamento aprovado";
      response.card_last4 = gatewayResult.card_last4;
      response.card_brand = gatewayResult.card_brand;
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Payment error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message || "Erro interno do servidor" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function grantEntitlements(
  supabase: any, orderId: string, customerId: string,
  orderItems: { product_id: string }[]
) {
  for (const item of orderItems) {
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
