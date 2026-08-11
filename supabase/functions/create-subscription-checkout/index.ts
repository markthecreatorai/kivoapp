import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLAN_CONFIG: Record<string, { name: string; monthly_cents: number; annual_cents: number }> = {
  creator: { name: "Creator", monthly_cents: 6700, annual_cents: 5400 },
  "creator-pro": { name: "Creator Pro", monthly_cents: 14900, annual_cents: 11900 },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const asaasApiKey = Deno.env.get("ASAAS_API_KEY");

    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userId = user.id;
    const userEmail = user.email || "";

    const body = await req.json();
    const {
      workspace_id,
      plan_code,
      billing_cycle = "monthly",
      origin_path = "/",
      cpf,
      customer_name,
      payment_method, // "card" | "pix"
      credit_card,    // { holderName, number, expiryMonth, expiryYear, ccv }
      referral_code,  // capturado no frontend (cookie/localStorage)
    } = body;

    if (!workspace_id || !plan_code) {
      return new Response(JSON.stringify({ error: "workspace_id e plan_code são obrigatórios" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!payment_method || !["card", "pix"].includes(payment_method)) {
      return new Response(JSON.stringify({ error: "payment_method deve ser 'card' ou 'pix'" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const planConfig = PLAN_CONFIG[plan_code];
    if (!planConfig) {
      return new Response(JSON.stringify({ error: `Plano "${plan_code}" não encontrado` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Verify workspace membership
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: membership } = await adminClient
      .from("workspace_members")
      .select("role")
      .eq("user_id", userId)
      .eq("workspace_id", workspace_id)
      .single();

    if (!membership) {
      return new Response(JSON.stringify({ error: "Você não pertence a este workspace" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── Indicação (referral): atribuição travada na primeira válida ─────────
    // O código vem do frontend (cookie/localStorage), mas a validação é toda
    // server-side: indicador ativo, sem autoindicação e idempotente por usuário.
    let referralAttached = false;
    let referralReason: string | null = null;
    if (typeof referral_code === "string" && referral_code.trim().length > 0) {
      const { data: refResult, error: refErr } = await adminClient.rpc("attach_referral_attribution", {
        p_referral_code: referral_code.trim().slice(0, 64),
        p_referred_user_id: userId,
      });
      if (refErr) {
        console.error("[Referral] attach_referral_attribution falhou:", JSON.stringify(refErr));
        referralReason = "error";
      } else if (refResult?.ok) {
        referralAttached = true;
        referralReason = refResult.locked ? "already_locked" : "attached";
      } else {
        referralReason = refResult?.error || "rejected";
        console.log("[Referral] código recusado:", referralReason);
      }
    }

    const valueCents = billing_cycle === "annual" ? planConfig.annual_cents : planConfig.monthly_cents;
    const cycle = billing_cycle === "annual" ? "YEARLY" : "MONTHLY";

    if (!asaasApiKey) {
      return new Response(JSON.stringify({ error: "Gateway de pagamento não configurado." }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const asaasBase = (Deno.env.get("ASAAS_ENV") || "sandbox").trim().toLowerCase() === "production"
    ? "https://api.asaas.com/v3"
    : "https://sandbox.asaas.com/api/v3";

    // Resolve CPF/CNPJ
    let customerCpf = cpf?.replace(/\D/g, "") || "";
    if (!customerCpf) {
      const { data: bankAcc } = await adminClient.from("bank_accounts")
        .select("holder_document")
        .eq("workspace_id", workspace_id)
        .eq("is_default", true)
        .maybeSingle();
      if (bankAcc?.holder_document) {
        customerCpf = bankAcc.holder_document.replace(/\D/g, "");
      }
    }

    if (!customerCpf) {
      return new Response(JSON.stringify({ error: "CPF/CNPJ é obrigatório para criar a assinatura." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const displayName = customer_name || userEmail.split("@")[0];

    // Find or create Asaas customer
    const customerSearchRes = await fetch(`${asaasBase}/customers?email=${encodeURIComponent(userEmail)}`, {
      headers: { access_token: asaasApiKey },
    });
    const customerSearchData = await customerSearchRes.json();

    let asaasCustomerId: string;
    if (customerSearchData.data?.length > 0) {
      asaasCustomerId = customerSearchData.data[0].id;
      if (!customerSearchData.data[0].cpfCnpj && customerCpf) {
        await fetch(`${asaasBase}/customers/${asaasCustomerId}`, {
          method: "PUT",
          headers: { access_token: asaasApiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ cpfCnpj: customerCpf }),
        });
      }
    } else {
      const createCustomerRes = await fetch(`${asaasBase}/customers`, {
        method: "POST",
        headers: { access_token: asaasApiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ name: displayName, email: userEmail, cpfCnpj: customerCpf }),
      });
      const newCustomer = await createCustomerRes.json();
      if (!newCustomer.id) {
        console.error("Failed to create Asaas customer:", newCustomer);
        return new Response(JSON.stringify({ error: "Não foi possível processar agora, tente novamente." }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      asaasCustomerId = newCustomer.id;
    }

    // Build subscription payload
    const nextDueDate = new Date();
    // Do not add +1 day so that Asaas charges the credit card immediately today
    const dueDateStr = nextDueDate.toISOString().split("T")[0];

    const billingType = payment_method === "card" ? "CREDIT_CARD" : "PIX";

    const subscriptionPayload: Record<string, unknown> = {
      customer: asaasCustomerId,
      billingType,
      cycle,
      value: valueCents / 100,
      nextDueDate: dueDateStr,
      description: `Assinatura ${planConfig.name} - Kivo`,
      externalReference: workspace_id,
    };

    // For credit card, include card data
    if (payment_method === "card") {
      if (!credit_card?.holderName || !credit_card?.number || !credit_card?.expiryMonth || !credit_card?.expiryYear || !credit_card?.ccv) {
        return new Response(JSON.stringify({ error: "Dados do cartão incompletos" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      subscriptionPayload.creditCard = {
        holderName: credit_card.holderName,
        number: credit_card.number.replace(/\s/g, ""),
        expiryMonth: credit_card.expiryMonth,
        expiryYear: credit_card.expiryYear,
        ccv: credit_card.ccv,
      };
      subscriptionPayload.creditCardHolderInfo = {
        name: credit_card.holderName,
        email: userEmail,
        cpfCnpj: customerCpf,
        postalCode: "01001000", // Generic valid CEP
        addressNumber: "0",
        phone: "11999999999", // Generic valid phone
      };
    }

    // Create subscription
    const subRes = await fetch(`${asaasBase}/subscriptions`, {
      method: "POST",
      headers: { access_token: asaasApiKey, "Content-Type": "application/json" },
      body: JSON.stringify(subscriptionPayload),
    });
    const subData = await subRes.json();

    if (!subRes.ok || !subData.id) {
      console.error("Asaas subscription creation failed:", subData);
      const errorDetail = subData.errors?.[0]?.description || subData.errors?.[0]?.code || "Não foi possível criar a assinatura.";
      return new Response(JSON.stringify({ error: errorDetail }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Card: NEVER assume the charge succeeded. Ask Asaas for the first invoice status. ──
    let cardConfirmed = false;
    let firstCardPaymentId: string | null = null;
    if (payment_method === "card") {
      try {
        const firstRes = await fetch(`${asaasBase}/subscriptions/${subData.id}/payments?limit=1`, {
          headers: { access_token: asaasApiKey },
        });
        const firstData = await firstRes.json();
        const firstPayment = firstData?.data?.[0];
        firstCardPaymentId = firstPayment?.id || null;
        cardConfirmed = ["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"].includes(String(firstPayment?.status || ""));
        console.log(`First card invoice for ${subData.id}: status=${firstPayment?.status} confirmed=${cardConfirmed}`);
      } catch (err) {
        console.error("Failed to read first subscription invoice:", err);
      }
    }

    // Store subscription record
    await adminClient.from("workspace_subscriptions").upsert({
      workspace_id,
      user_id: userId,
      provider: "asaas",
      provider_subscription_id: subData.id,
      provider_customer_id: asaasCustomerId,
      plan_code,
      // Only a confirmed charge activates the plan; the Asaas webhook flips it otherwise
      status: payment_method === "card" && cardConfirmed ? "active" : "pending",
      billing_cycle,
    }, { onConflict: "workspace_id,provider" });

    // Audit log
    await adminClient.from("audit_logs").insert({
      workspace_id,
      user_id: userId,
      entity_type: "subscription",
      entity_id: subData.id,
      action: "subscription_checkout_created",
      metadata: { plan_code, billing_cycle, origin_path, payment_method, asaas_subscription_id: subData.id },
    });

    // For CARD: report the real gateway outcome (never a fake "active")
    if (payment_method === "card") {
      return new Response(JSON.stringify({
        status: cardConfirmed ? "active" : "pending",
        subscription_id: subData.id,
        payment_id: firstCardPaymentId,
        provider: "asaas",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // For PIX: get the first payment and its QR code
    const invoicesRes = await fetch(`${asaasBase}/subscriptions/${subData.id}/payments?limit=1`, {
      headers: { access_token: asaasApiKey },
    });
    const invoicesData = await invoicesRes.json();

    if (!invoicesData.data?.length) {
      return new Response(JSON.stringify({
        status: "pending",
        subscription_id: subData.id,
        provider: "asaas",
        pix: null,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const paymentId = invoicesData.data[0].id;

    // Get PIX QR Code
    const qrRes = await fetch(`${asaasBase}/payments/${paymentId}/pixQrCode`, {
      headers: { access_token: asaasApiKey },
    });
    const qrData = await qrRes.json();

    return new Response(JSON.stringify({
      status: "pending_pix",
      subscription_id: subData.id,
      payment_id: paymentId,
      provider: "asaas",
      pix: {
        qr_code_image: qrData.encodedImage || null,
        copy_paste: qrData.payload || null,
        expiration_date: qrData.expirationDate || null,
      },
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("Subscription checkout error:", err);
    return new Response(JSON.stringify({ error: "Não foi possível processar agora, tente novamente." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
