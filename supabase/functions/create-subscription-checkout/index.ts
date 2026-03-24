import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Plan mapping to Asaas billing values
const PLAN_CONFIG: Record<string, { name: string; monthly_cents: number; annual_cents: number }> = {
  creator: { name: "Creator", monthly_cents: 6700, annual_cents: 5400 },
  "creator-pro": { name: "Creator Pro", monthly_cents: 14900, annual_cents: 11900 },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth
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

    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userId = claimsData.claims.sub as string;
    const userEmail = claimsData.claims.email as string;

    const body = await req.json();
    const { workspace_id, plan_code, billing_cycle = "monthly", origin_path = "/", cpf, customer_name } = body;

    if (!workspace_id || !plan_code) {
      return new Response(JSON.stringify({ error: "workspace_id e plan_code são obrigatórios" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Validate plan
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

    const valueCents = billing_cycle === "annual" ? planConfig.annual_cents : planConfig.monthly_cents;
    const cycle = billing_cycle === "annual" ? "YEARLY" : "MONTHLY";

    if (!asaasApiKey) {
      // Fallback: no Asaas key configured, redirect to pricing page
      console.error("ASAAS_API_KEY not configured for subscription checkout");
      return new Response(JSON.stringify({ error: "Gateway de pagamento não configurado. Contate o suporte." }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const asaasBase = "https://api.asaas.com/v3";

    // 1. Find or create Asaas customer
    const customerSearchRes = await fetch(`${asaasBase}/customers?email=${encodeURIComponent(userEmail)}`, {
      headers: { access_token: asaasApiKey },
    });
    const customerSearchData = await customerSearchRes.json();

    let asaasCustomerId: string;
    if (customerSearchData.data?.length > 0) {
      asaasCustomerId = customerSearchData.data[0].id;
    } else {
      const createCustomerRes = await fetch(`${asaasBase}/customers`, {
        method: "POST",
        headers: { access_token: asaasApiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ name: userEmail.split("@")[0], email: userEmail }),
      });
      const newCustomer = await createCustomerRes.json();
      if (!newCustomer.id) {
        console.error("Failed to create Asaas customer:", newCustomer);
        return new Response(JSON.stringify({ error: "Não foi possível processar agora, tente novamente em instantes." }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      asaasCustomerId = newCustomer.id;
    }

    // 2. Create subscription in Asaas
    const nextDueDate = new Date();
    nextDueDate.setDate(nextDueDate.getDate() + 1);
    const dueDateStr = nextDueDate.toISOString().split("T")[0];

    const subscriptionPayload = {
      customer: asaasCustomerId,
      billingType: "UNDEFINED", // Allows customer to choose payment method
      cycle,
      value: valueCents / 100,
      nextDueDate: dueDateStr,
      description: `Assinatura ${planConfig.name} - Kivo`,
      externalReference: workspace_id,
    };

    const subRes = await fetch(`${asaasBase}/subscriptions`, {
      method: "POST",
      headers: { access_token: asaasApiKey, "Content-Type": "application/json" },
      body: JSON.stringify(subscriptionPayload),
    });
    const subData = await subRes.json();

    if (!subRes.ok || !subData.id) {
      console.error("Asaas subscription creation failed:", subData);
      return new Response(JSON.stringify({ error: "Não foi possível criar a assinatura. Tente novamente." }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 3. Get the payment link for the first invoice
    const invoicesRes = await fetch(`${asaasBase}/subscriptions/${subData.id}/payments?limit=1`, {
      headers: { access_token: asaasApiKey },
    });
    const invoicesData = await invoicesRes.json();

    let checkoutUrl = `https://www.asaas.com/c/${subData.id}`;
    if (invoicesData.data?.length > 0) {
      const paymentId = invoicesData.data[0].id;
      checkoutUrl = `https://www.asaas.com/i/${paymentId}`;
    }

    // 4. Store subscription record
    await adminClient.from("workspace_subscriptions").upsert({
      workspace_id,
      user_id: userId,
      provider: "asaas",
      provider_subscription_id: subData.id,
      provider_customer_id: asaasCustomerId,
      plan_code: plan_code,
      status: "pending",
      billing_cycle: billing_cycle,
    }, { onConflict: "workspace_id,provider" });

    // 5. Log the subscription attempt
    await adminClient.from("audit_logs").insert({
      workspace_id,
      user_id: userId,
      entity_type: "subscription",
      entity_id: subData.id,
      action: "subscription_checkout_created",
      metadata: { plan_code, billing_cycle, origin_path, asaas_subscription_id: subData.id },
    });

    return new Response(JSON.stringify({
      checkout_url: checkoutUrl,
      subscription_id: subData.id,
      provider: "asaas",
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("Subscription checkout error:", err);
    return new Response(JSON.stringify({ error: "Não foi possível processar agora, tente novamente em instantes." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
