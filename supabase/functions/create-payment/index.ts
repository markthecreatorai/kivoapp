import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { computePixDiscount, resolveCoupon, round2 } from "../_shared/coupon.ts";
import { feeTierForPlan } from "../_shared/plan.ts";
import {
  validateAffiliateContext,
  commissionBase,
  computeCommissionBrl,
  computeSplitCents,
} from "../_shared/commissions.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Asaas API ──

function getAsaasBase() {
  const env = (Deno.env.get("ASAAS_ENV") || "sandbox").trim().toLowerCase();
  const base = env === "production"
    ? "https://api.asaas.com/v3"
    : "https://sandbox.asaas.com/api/v3";
  console.log(`Asaas env="${env}" base="${base}"`);
  return base;
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // ── Gateway guardrail: never process/deliver anything without a real gateway ──
  const gatewayApiKey = (Deno.env.get("ASAAS_API_KEY") || "").trim();
  const sandboxRequested = (Deno.env.get("KIVO_PAYMENTS_SANDBOX") || "").trim().toLowerCase() === "true";
  const isProductionEnv = (Deno.env.get("ASAAS_ENV") || "").trim().toLowerCase() === "production";

  // HARD LOCK: sandbox mode is never honoured in production, no matter the flag.
  if (sandboxRequested && isProductionEnv) {
    console.warn(
      "KIVO_PAYMENTS_SANDBOX=true IGNORADO: ASAAS_ENV=production. " +
      "Remova o secret KIVO_PAYMENTS_SANDBOX — pagamentos seguirão pelo gateway real.",
    );
  }
  const sandboxMode = sandboxRequested && !isProductionEnv;

  if (!gatewayApiKey && !sandboxMode) {
    console.error("create-payment blocked: ASAAS_API_KEY não configurada. Nenhum pedido, pagamento ou entitlement foi criado.");
    return new Response(JSON.stringify({ error: "Gateway de pagamento não configurado" }), {
      status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {

    const body = await req.json();
    const {
      product_id, price_id, method, customer,
      checkout_session_id, card_token, card_last4, card_brand,
      installments, coupon_code,
      affiliate_link_id, affiliate_session_id, idempotency_key, bump_product_ids,
    } = body;

    if (!product_id || !price_id || !method || !customer?.email || !customer?.name || !customer?.cpf) {
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

    // PCI-DSS: esta função nunca recebe PAN/CVV — apenas o token do gateway
    if (method === "credit_card" && !card_token) {
      return new Response(JSON.stringify({ error: "Token do cartão ausente. Refaça o pagamento." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

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

    // Platform-owned model: always use global platform credentials
    const asaasApiKey = gatewayApiKey;
    const useAsaas = !!asaasApiKey;

    // Fetch product (must be published and not deleted)
    const { data: product, error: productErr } = await supabase
      .from("products")
      .select("id, name, slug, workspace_id, type, status, deleted_at")
      .eq("id", product_id)
      .maybeSingle();
    if (productErr) {
      console.error("Erro ao buscar produto:", JSON.stringify(productErr));
      return new Response(JSON.stringify({ error: "Erro ao carregar produto" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!product) {
      return new Response(JSON.stringify({ error: "Produto não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (product.deleted_at || product.status !== "PUBLISHED") {
      console.error("Produto indisponível:", product.id, product.status, product.deleted_at);
      return new Response(JSON.stringify({ error: "Produto indisponível" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // SECURITY: workspace is always derived from the product, never from the request body
    const workspace_id = product.workspace_id as string;

    // Verify workspace exists
    // NOTA: workspaces.asaas_account_id / asaas_wallet_id NÃO são usados no fluxo
    // de pagamento. O modelo adotado é custódia na conta Kivo + ledger interno
    // (split_entries / wallet_ledger / reserve_entries), sem split nativo do Asaas.
    // As colunas permanecem no schema apenas para uso futuro.
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("id, plan")

      .eq("id", workspace_id)
      .maybeSingle();

    if (!workspace) {
      return new Response(JSON.stringify({ error: "Workspace não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch price — MUST belong to this product
    const { data: price, error: priceErr } = await supabase
      .from("prices")
      .select("id, amount, pix_discount_percent, max_installments, is_active, product_id")
      .eq("id", price_id)
      .eq("product_id", product_id)
      .maybeSingle();
    if (priceErr) {
      console.error("Erro ao buscar preço:", JSON.stringify(priceErr));
      return new Response(JSON.stringify({ error: "Erro ao carregar preço" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!price) {
      console.error("Preço inválido para o produto:", price_id, product_id);
      return new Response(JSON.stringify({ error: "Preço inválido para este produto" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (price.is_active === false) {
      return new Response(JSON.stringify({ error: "Produto indisponível" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate installments against the price configuration
    const maxInstallments = price.max_installments || 12;
    const requestedInstallments = Number(installments) || 1;
    if (requestedInstallments < 1 || requestedInstallments > maxInstallments) {
      return new Response(JSON.stringify({ error: `Número de parcelas inválido (máximo ${maxInstallments}x)` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    // Subtotal starts with the main price; order bumps are added below
    let subtotal = Number(price.amount);


    const bumpItems: { product_id: string; price_id: string; amount: number }[] = [];
    if (bump_product_ids && Array.isArray(bump_product_ids)) {
      // Only products explicitly configured as active order bumps of the main product are accepted
      const { data: allowedBumps, error: bumpsErr } = await supabase
        .from("order_bumps")
        .select("bump_product_id")
        .eq("main_product_id", product.id)
        .eq("is_active", true);
      if (bumpsErr) {
        console.error("Erro ao carregar order bumps:", JSON.stringify(bumpsErr));
        return new Response(JSON.stringify({ error: "Erro ao validar ofertas adicionais" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const allowedIds = new Set((allowedBumps || []).map((b: any) => b.bump_product_id));

      for (const bumpId of bump_product_ids) {
        if (!allowedIds.has(bumpId)) {
          console.error("Order bump não configurado para este produto:", bumpId, product.id);
          return new Response(JSON.stringify({ error: "Oferta adicional inválida para este produto" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Bump product must also be published, not deleted and in the same workspace
        const { data: bumpProduct } = await supabase
          .from("products")
          .select("id, status, deleted_at, workspace_id")
          .eq("id", bumpId)
          .maybeSingle();
        if (!bumpProduct || bumpProduct.deleted_at || bumpProduct.status !== "PUBLISHED" || bumpProduct.workspace_id !== workspace_id) {
          return new Response(JSON.stringify({ error: "Oferta adicional indisponível" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data: bumpPrice } = await supabase
          .from("prices")
          .select("id, amount, product_id")
          .eq("product_id", bumpId)
          .eq("is_default", true)
          .eq("is_active", true)
          .maybeSingle();
        if (!bumpPrice) {
          return new Response(JSON.stringify({ error: "Oferta adicional sem preço ativo" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        bumpItems.push({ product_id: bumpPrice.product_id, price_id: bumpPrice.id, amount: bumpPrice.amount });
        subtotal += Number(bumpPrice.amount);
      }
    }

    subtotal = round2(subtotal);

    // ── Discounts (server-side source of truth) ─────────────────────────────
    // Order: coupon over the subtotal, then the PIX percentage over the result.
    // The frontend (src/lib/checkout-totals.ts) applies the exact same order.
    let couponDiscount = 0;
    let appliedCoupon: { id: string } | null = null;
    if (coupon_code) {
      const couponResult = await resolveCoupon(supabase, {
        code: String(coupon_code),
        workspaceId: workspace_id,
        customerEmail: customer.email,
        orderAmount: subtotal,
        productId: product.id,
      });
      if (!couponResult.valid || !couponResult.coupon) {
        console.warn("Cupom rejeitado no create-payment:", coupon_code, couponResult.error);
        return new Response(JSON.stringify({ error: couponResult.error || "Cupom inválido" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      couponDiscount = couponResult.discount;
      appliedCoupon = { id: couponResult.coupon.id };
    }

    const amountAfterCoupon = round2(Math.max(0, subtotal - couponDiscount));
    const pixDiscount = method === "pix"
      ? computePixDiscount(amountAfterCoupon, price.pix_discount_percent)
      : 0;

    const discountAmount = round2(couponDiscount + pixDiscount);
    const totalAmount = round2(Math.max(0, amountAfterCoupon - pixDiscount));

    // The discount can never exceed the subtotal nor produce a free order:
    // a R$ 0 charge cannot be created at the gateway, and an order must never
    // reach COMPLETED without a real payment confirmation.
    if (discountAmount > subtotal + 0.001) {
      console.error("Desconto maior que o subtotal", { subtotal, discountAmount });
      return new Response(JSON.stringify({ error: "Desconto inválido para este pedido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (totalAmount <= 0) {
      console.warn("Pedido zerado por desconto — bloqueado", { subtotal, discountAmount, coupon_code });
      return new Response(JSON.stringify({ error: "O desconto não pode zerar o valor do pedido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const selectedInstallments = requestedInstallments;


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
      const { data: newCust, error: custErr } = await supabase
        .from("customers")
        .insert({ workspace_id, email: customer.email, name: customer.name, cpf, phone: customer.phone || null })
        .select("id")
        .single();
      if (custErr || !newCust) {
        console.error("Erro ao criar cliente:", JSON.stringify(custErr));
        return new Response(JSON.stringify({ error: "Erro ao registrar cliente" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      customerId = newCust.id;
    }

    // ─── SECURITY: affiliate link is never trusted from the client ───────────
    // The link must exist, belong to an APPROVED affiliate of THIS workspace,
    // have an enabled program, match the product, and have a live attribution
    // for the very session the buyer is checking out with.
    let affiliateContext: ReturnType<typeof validateAffiliateContext> | null = null;
    if (affiliate_link_id) {
      const sessionKey = typeof affiliate_session_id === "string"
        ? affiliate_session_id.slice(0, 100)
        : null;

      const { data: affLink } = await supabase
        .from("affiliate_links")
        .select("id, affiliate_id, product_id")
        .eq("id", affiliate_link_id)
        .maybeSingle();

      const { data: affiliate } = affLink?.affiliate_id
        ? await supabase
            .from("affiliates")
            .select("id, workspace_id, status")
            .eq("id", affLink.affiliate_id)
            .maybeSingle()
        : { data: null };

      const { data: program } = affiliate?.workspace_id
        ? await supabase
            .from("affiliate_programs")
            .select("is_enabled, default_commission_percent, hold_days")
            .eq("workspace_id", affiliate.workspace_id)
            .maybeSingle()
        : { data: null };

      const { data: attribution } = sessionKey
        ? await supabase
            .from("affiliate_attributions")
            .select("id, affiliate_link_id, session_id, expires_at, converted_at")
            .eq("affiliate_link_id", affiliate_link_id)
            .eq("session_id", sessionKey)
            .maybeSingle()
        : { data: null };

      const { data: productRule } = await supabase
        .from("commission_rules")
        .select("percent, fixed_amount, is_active")
        .eq("product_id", product.id)
        .eq("is_active", true)
        .maybeSingle();

      affiliateContext = validateAffiliateContext({
        affiliateLinkId: affiliate_link_id,
        affiliateSessionId: sessionKey,
        orderWorkspaceId: workspace_id,
        orderProductId: product.id,
        link: affLink as any,
        affiliate: affiliate as any,
        program: program as any,
        attribution: attribution as any,
        productRule: productRule as any,
      });

      if (!affiliateContext.ok) {
        console.warn("[create-payment] affiliate link rejeitado:", affiliateContext.reason);
        return new Response(
          JSON.stringify({ error: "Link de afiliado inválido para este checkout", reason: affiliateContext.reason }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }
    const validAffiliateLinkId = affiliateContext?.ok ? affiliateContext.affiliateLinkId : null;
    const validAffiliateSessionId = affiliateContext?.ok
      ? String(affiliate_session_id).slice(0, 100)
      : null;

    // Create order
    const { data: order, error: orderErr } = await supabase
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
        affiliate_link_id: validAffiliateLinkId,
        affiliate_session_id: validAffiliateSessionId,
      })
      .select("id")
      .single();

    if (orderErr || !order) {
      console.error("Erro ao criar pedido:", JSON.stringify(orderErr));
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
    const { error: itemsErr } = await supabase.from("order_items").insert(orderItems);
    if (itemsErr) {
      console.error("Erro ao criar itens do pedido:", JSON.stringify(itemsErr));
      await supabase.from("orders").update({ status: "FAILED" }).eq("id", order.id);
      return new Response(JSON.stringify({ error: "Erro ao criar itens do pedido" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Redeem the coupon atomically (locks the row, re-checks total and per-customer
    // limits, records coupon_usages and increments current_uses in one transaction).
    if (appliedCoupon) {
      const { data: redeemed, error: redeemErr } = await supabase.rpc("redeem_coupon", {
        p_coupon_id: appliedCoupon.id,
        p_order_id: order.id,
        p_customer_email: customer.email,
        p_discount: couponDiscount,
        p_order_amount: subtotal,
        p_product_id: product.id,
      });
      const redeemOk = redeemed === true || (redeemed && (redeemed as any).ok === true);
      if (redeemErr || !redeemOk) {
        console.error("Falha ao resgatar cupom:", coupon_code, JSON.stringify(redeemErr ?? redeemed));
        await supabase.from("orders").update({ status: "FAILED" }).eq("id", order.id);
        const reason = (redeemed as any)?.error || "Cupom não pôde ser aplicado";
        return new Response(JSON.stringify({ error: reason }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }




    if (checkout_session_id) {
      await supabase.from("checkout_sessions").update({
        customer_id: customerId,
        status: method === "credit_card" ? "PROCESSING" : "AWAITING_PAYMENT",
        subtotal_amount: subtotal,
        discount_amount: discountAmount,
        total_amount: totalAmount,
        coupon_code: coupon_code || null,
        affiliate_link_id: validAffiliateLinkId,
        affiliate_session_id: validAffiliateSessionId,
      }).eq("id", checkout_session_id);
    }

    // ─── Payment Processing ───
    let gatewayResult: any;

    try {
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
        // Cobrança tokenizada: nenhum dado sensível de cartão existe nesta função
        const chargePayload: any = {
          customer: asaasCustomerId,
          billingType: "CREDIT_CARD",
          value: amountBRL,
          description: product.name,
          externalReference: order.id,
          dueDate: new Date().toISOString().slice(0, 10),
          creditCardToken: card_token,
        };

        // Only add installmentCount for 2+ installments (Asaas rejects installmentCount=1)
        if (selectedInstallments > 1) {
          chargePayload.installmentCount = selectedInstallments;
        }

        const charge = await callAsaas("/payments", chargePayload, asaasApiKey);

        // Asaas returns installmentValue when installments > 1
        const installmentValue = charge.installmentValue || (amountBRL / selectedInstallments);
        const totalWithInterest = selectedInstallments > 1
          ? (charge.installmentValue ? charge.installmentValue * selectedInstallments : amountBRL)
          : amountBRL;

        console.log("Asaas charge status:", charge.status);
        gatewayResult = {
          status: ["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH", "APPROVED"].includes(charge.status) ? "paid" : (charge.status === "DECLINED" || charge.status === "REFUNDED" ? "failed" : "pending"),
          gateway_payment_id: charge.id,
          provider: "asaas",
          card_last4: (card_last4 || charge.creditCard?.creditCardNumber || "").toString().slice(-4) || null,
          card_brand: charge.creditCard?.creditCardBrand || card_brand || "unknown",
          card_token,
          installments: selectedInstallments,
          installment_value: installmentValue,
          total_with_interest: totalWithInterest,
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
      // Explicit sandbox mode (KIVO_PAYMENTS_SANDBOX=true): never "paid", never entitlements
      console.log("Processing in KIVO_PAYMENTS_SANDBOX mode — order will be marked TEST");
      gatewayResult = {
        status: "test",
        gateway_payment_id: `sandbox_${crypto.randomUUID().slice(0, 8)}`,
        provider: "sandbox",
      };
    }

    } catch (gatewayErr) {
      // Mark order as FAILED when gateway rejects
      console.error("Gateway error, marking order FAILED:", (gatewayErr as Error).message);
      await supabase.from("orders").update({ status: "FAILED" }).eq("id", order.id);
      // Give the coupon use back — the order never became payable
      if (appliedCoupon) {
        const { error: releaseErr } = await supabase.rpc("release_coupon", {
          p_coupon_id: appliedCoupon.id,
          p_order_id: order.id,
        });
        if (releaseErr) console.error("Erro ao liberar cupom:", JSON.stringify(releaseErr));
      }
      if (checkout_session_id) {
        await supabase.from("checkout_sessions").update({ status: "FAILED" }).eq("id", checkout_session_id);
      }

      return new Response(JSON.stringify({
        error: (gatewayErr as Error).message || "Erro no gateway de pagamento",
        order_id: order.id,
        status: "FAILED",
      }), {
        // 502: falha real de downstream (gateway). Nunca 200 — frontends que só
        // checam response.ok tratariam a falha como sucesso.
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create payment record
    const paymentStatus = gatewayResult.status === "paid" ? "SUCCEEDED" : "PENDING";
    const { data: payment, error: paymentErr } = await supabase
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

    if (paymentErr || !payment) {
      console.error("Erro ao registrar pagamento:", JSON.stringify(paymentErr));
      return new Response(JSON.stringify({
        error: "Erro ao registrar pagamento",
        order_id: order.id,
      }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    // PIX data
    if (method === "pix" && gatewayResult.pix) {
      await supabase.from("pix_payment_data").insert({
        payment_id: payment.id,
        qr_code: gatewayResult.pix.qr_code,
        qr_code_url: gatewayResult.pix.qr_code_url || null,
        copy_paste_code: gatewayResult.pix.qr_code,
        expires_at: gatewayResult.pix.expires_at,
      });
    }

    // Sandbox: order stays TEST, never COMPLETED, never entitlements
    if (gatewayResult.status === "test") {
      await supabase.from("orders").update({ status: "TEST" }).eq("id", order.id);
      if (checkout_session_id) {
        await supabase.from("checkout_sessions").update({ status: "TEST" }).eq("id", checkout_session_id);
      }
    }

    // If paid immediately (credit card)
    if (paymentStatus === "SUCCEEDED") {
      const { error: orderUpdateErr } = await supabase.from("orders").update({ status: "COMPLETED", paid_at: new Date().toISOString() }).eq("id", order.id);
      if (orderUpdateErr) {
        console.error("Failed to update order to COMPLETED:", JSON.stringify(orderUpdateErr));
      } else {
        console.log("Order updated to COMPLETED:", order.id);
      }
      if (checkout_session_id) {
        await supabase.from("checkout_sessions").update({ status: "COMPLETED", completed_at: new Date().toISOString() }).eq("id", checkout_session_id);
      }
      await grantEntitlements(supabase, order.id, customerId, orderItems);

      // Guarda o token do cartão nas assinaturas do cliente para viabilizar renovação recorrente
      if (method === "credit_card" && card_token) {
        const { error: subTokenErr } = await supabase
          .from("subscriptions")
          .update({ card_token })
          .eq("workspace_id", workspace_id)
          .eq("customer_id", customerId)
          .in("status", ["ACTIVE", "TRIALING", "PAST_DUE", "active", "trialing", "past_due"]);
        if (subTokenErr) {
          console.error("Falha ao salvar card_token na assinatura:", JSON.stringify(subTokenErr));
        }
      }

    }


    // ─── Create transaction record (new split model) ───
    try {
      const feeTier = feeTierForPlan((workspace as any)?.plan);
      const { data: feeConfig } = await supabase
        .from("fee_config")
        .select("*")
        .eq("plan_type", feeTier)
        .maybeSingle();

      // Real fee_config columns: credit_card_percent, pix_percent, boleto_fixed_cents,
      // platform_percent, reserve_percent, reserve_hold_days
      const grossAmount = Math.round(totalAmount * 100); // store in centavos

      let gatewayFeePercent = 0;
      let gatewayFee = 0;
      if (method === "pix") {
        gatewayFeePercent = Number(feeConfig?.pix_percent ?? 0.99);
        gatewayFee = Math.round(grossAmount * gatewayFeePercent / 100);
      } else if (method === "boleto") {
        // boleto is a FIXED fee in centavos, not a percentage
        gatewayFee = Math.round(Number(feeConfig?.boleto_fixed_cents ?? 199));
      } else {
        gatewayFeePercent = Number(feeConfig?.credit_card_percent ?? 4.99);
        gatewayFee = Math.round(grossAmount * gatewayFeePercent / 100);
      }

      const platformFeePercent = Number(feeConfig?.platform_percent ?? 0);
      const reservePercent = Number(feeConfig?.reserve_percent ?? 0);
      const platformFee = Math.round((grossAmount - gatewayFee) * platformFeePercent / 100);
      const netAmount = grossAmount - gatewayFee - platformFee;

      console.log("[create-payment] fee_config lido do banco", JSON.stringify({
        fee_tier: feeTier,
        db_row: feeConfig ?? null,
        method,
        applied: {
          gateway_fee_percent: gatewayFeePercent,
          gateway_fee_cents: gatewayFee,
          platform_percent: platformFeePercent,
          platform_fee_cents: platformFee,
          reserve_percent: reservePercent,
          reserve_hold_days: Number(feeConfig?.reserve_hold_days ?? 0),
          gross_amount_cents: grossAmount,
          net_amount_cents: netAmount,
        },
      }));

      // Calculate available_at based on payment method
      let availableAt: string;
      const now = new Date();
      if (method === "pix") {
        availableAt = now.toISOString(); // D+0
      } else if (method === "boleto") {
        availableAt = new Date(now.getTime() + 1 * 86400000).toISOString(); // D+1
      } else {
        availableAt = new Date(now.getTime() + 2 * 86400000).toISOString(); // D+2
      }

      const txStatus = paymentStatus === "SUCCEEDED" ? "paid" : "pending";

      await supabase.from("transactions").insert({
        workspace_id,
        order_id: order.id,
        payment_id: payment.id,
        gateway_payment_id: gatewayResult.gateway_payment_id || null,
        payment_method: method,
        gross_amount: grossAmount,
        gateway_fee: gatewayFee,
        platform_fee: platformFee,
        net_amount: netAmount,
        currency: "BRL",
        status: txStatus,
        installments: selectedInstallments,
        pix_qr_code: method === "pix" ? gatewayResult.pix?.qr_code : null,
        pix_qr_code_url: method === "pix" ? gatewayResult.pix?.qr_code_url : null,
        pix_expires_at: method === "pix" ? gatewayResult.pix?.expires_at : null,
        boleto_barcode: method === "boleto" ? gatewayResult.boleto?.barcode : null,
        boleto_url: method === "boleto" ? gatewayResult.boleto?.pdf_url : null,
        boleto_due_at: method === "boleto" ? gatewayResult.boleto?.due_at : null,
        available_at: txStatus === "paid" ? availableAt : null,
        provider: gatewayResult.provider || "asaas",
        fee_config_snapshot: feeConfig || null,
      });

      // Security reserve: ONLY on credit card sales (PIX/boleto have no reserve).
      // reserve_hold_days is the absolute release window for the reserved slice (D+N from sale).
      const isCard = method !== "pix" && method !== "boleto";
      if (txStatus === "paid" && netAmount > 0 && isCard && reservePercent > 0) {
        const reserveAmount = Math.round(netAmount * reservePercent / 100);
        const releaseDays = Number(feeConfig?.reserve_hold_days ?? 0);
        if (reserveAmount > 0) {
          await supabase.from("security_reserves").insert({
            workspace_id,
            order_id: order.id,
            transaction_id: null, // will be linked via order_id
            amount: reserveAmount,
            release_at: new Date(now.getTime() + releaseDays * 86400000).toISOString(),
            status: "held",
          });
        }
      }

      // ─── Split entry (pending) ───────────────────────────────────────────
      // Resolution order: product-specific rule > workspace default > global default.
      // status = "pending" and available_at = null: both only change when the
      // webhook confirms the payment. NOTHING is written to wallet_ledger here.
      try {
        const { data: existingSplit } = await supabase
          .from("split_entries")
          .select("id")
          .eq("order_id", order.id)
          .maybeSingle();

        if (!existingSplit) {
          const { data: ruleRows } = await supabase.rpc("get_split_rule", {
            p_workspace_id: workspace_id,
            p_product_id: product.id,
            p_payment_method: method,
          });
          const rule = ruleRows?.[0] || null;
          const platformPercent = Number(rule?.platform_percent ?? 8);

          // Affiliate slice: real rate from affiliate_programs / commission_rules,
          // reserved in the SAME calculation as the split so that
          // split_entries.affiliate_fee === commissions.amount.
          const affiliateId = affiliateContext?.ok ? affiliateContext.affiliateId : null;
          const affiliatePercent = affiliateContext?.ok ? affiliateContext.commissionPercent : 0;
          const commissionBrl = affiliateContext?.ok
            ? computeCommissionBrl(
                commissionBase({ total_amount: totalAmount }),
                affiliateContext.commissionPercent,
                affiliateContext.fixedAmount,
              )
            : 0;

          const splitCalc = computeSplitCents({
            grossCents: grossAmount,
            gatewayFeeCents: gatewayFee,
            platformPercent,
            commissionBrl,
          });
          const splitPlatformFee = splitCalc.platformFeeCents;
          const splitAffiliateFee = splitCalc.affiliateFeeCents;
          const creatorNet = splitCalc.creatorNetCents;

          console.log("[create-payment] split_entry (pending)", JSON.stringify({
            order_id: order.id,
            split_rule_id: rule?.id ?? null,
            method,
            gross_amount: grossAmount,
            gateway_fee: gatewayFee,
            platform_percent: platformPercent,
            platform_fee: splitPlatformFee,
            affiliate_id: affiliateId,
            affiliate_percent: affiliatePercent,
            affiliate_fee: splitAffiliateFee,
            creator_net: creatorNet,
          }));

          const { error: splitErr } = await supabase.from("split_entries").insert({
            workspace_id,
            order_id: order.id,
            split_rule_id: rule?.id ?? null,
            gross_amount: grossAmount,
            gateway_fee: gatewayFee,
            platform_fee: splitPlatformFee,
            affiliate_fee: splitAffiliateFee,
            creator_net: creatorNet,
            status: "pending",
            available_at: null,
          });
          if (splitErr) console.error("[create-payment] split_entries insert error:", JSON.stringify(splitErr));
        }
      } catch (splitCatch) {
        console.error("Split entry creation error (non-fatal):", splitCatch);
      }
    } catch (txErr) {
      console.error("Transaction record creation error (non-fatal):", txErr);
    }

    // Build response
    const response: any = {
      order_id: order.id,
      payment_id: payment.id,
      status: gatewayResult.status,
      provider: gatewayResult.provider || "asaas",
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
      if (gatewayResult.installments > 1) {
        response.installments = gatewayResult.installments;
        response.installment_value = gatewayResult.installment_value;
        response.total_with_interest = gatewayResult.total_with_interest;
      }
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
