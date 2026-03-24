import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLAN_CONFIG: Record<string, { name: string; monthly_cents: number; annual_cents: number; rank: number }> = {
  free:         { name: "Gratuito",    monthly_cents: 0,     annual_cents: 0,     rank: 0 },
  creator:      { name: "Creator",     monthly_cents: 6700,  annual_cents: 5400,  rank: 1 },
  "creator-pro":{ name: "Creator Pro", monthly_cents: 14900, annual_cents: 11900, rank: 2 },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const asaasApiKey = Deno.env.get("ASAAS_API_KEY");
  const asaasBase = "https://api.asaas.com/v3";

  try {
    // 1. Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userId = claimsData.claims.sub as string;
    const body = await req.json();
    const { workspace_id, target_plan_code, source_ui } = body;

    if (!workspace_id || !target_plan_code) {
      return new Response(JSON.stringify({ error: "workspace_id e target_plan_code são obrigatórios" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const targetConfig = PLAN_CONFIG[target_plan_code];
    if (!targetConfig) {
      return new Response(JSON.stringify({ error: `Plano "${target_plan_code}" não encontrado` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // 2. Verify workspace membership
    const { data: membership } = await admin
      .from("workspace_members").select("role")
      .eq("user_id", userId).eq("workspace_id", workspace_id).single();
    if (!membership) {
      return new Response(JSON.stringify({ error: "Você não pertence a este workspace" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 3. Get current subscription
    const { data: currentSub } = await admin
      .from("workspace_subscriptions")
      .select("id, plan_code, status, provider_subscription_id, billing_cycle, provider_customer_id")
      .eq("workspace_id", workspace_id)
      .in("status", ["active", "trialing", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!currentSub || !currentSub.provider_subscription_id) {
      return new Response(JSON.stringify({ error: "Nenhuma assinatura ativa encontrada para upgrade" }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const currentConfig = PLAN_CONFIG[currentSub.plan_code];
    if (!currentConfig) {
      return new Response(JSON.stringify({ error: "Plano atual não reconhecido" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 4. Validate it's actually an upgrade
    if (targetConfig.rank <= currentConfig.rank) {
      return new Response(JSON.stringify({ error: "O plano selecionado não é um upgrade" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 5. Idempotency: if already on target plan, return success
    if (currentSub.plan_code === target_plan_code) {
      return new Response(JSON.stringify({
        status: "already_on_plan",
        current_plan_code: target_plan_code,
        provider_subscription_id: currentSub.provider_subscription_id,
        effective_at: new Date().toISOString(),
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 6. Log request
    await admin.from("audit_logs").insert({
      workspace_id,
      user_id: userId,
      entity_type: "subscription",
      entity_id: currentSub.id,
      action: "subscription_upgrade_midcycle_requested",
      metadata: { old_plan: currentSub.plan_code, new_plan: target_plan_code, source_ui, provider_subscription_id: currentSub.provider_subscription_id },
    });

    // 7. Update subscription in Asaas
    if (!asaasApiKey) {
      return new Response(JSON.stringify({ error: "Gateway de pagamento não configurado" }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const cycle = currentSub.billing_cycle === "annual" ? "annual_cents" : "monthly_cents";
    const newValue = targetConfig[cycle] / 100;

    const asaasRes = await fetch(`${asaasBase}/subscriptions/${currentSub.provider_subscription_id}`, {
      method: "PUT",
      headers: { access_token: asaasApiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        value: newValue,
        description: `Assinatura ${targetConfig.name} - Kivo`,
        externalReference: workspace_id,
      }),
    });

    const asaasData = await asaasRes.json();

    if (!asaasRes.ok) {
      console.error("Asaas upgrade failed:", JSON.stringify(asaasData));
      await admin.from("audit_logs").insert({
        workspace_id,
        user_id: userId,
        entity_type: "subscription",
        entity_id: currentSub.id,
        action: "subscription_upgrade_midcycle_failed",
        metadata: { old_plan: currentSub.plan_code, new_plan: target_plan_code, asaas_error: asaasData, provider_subscription_id: currentSub.provider_subscription_id },
      });
      return new Response(JSON.stringify({ error: "Falha ao atualizar assinatura no gateway. Tente novamente." }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 8. Update DB only after Asaas success
    const now = new Date().toISOString();
    await admin.from("workspace_subscriptions").update({
      plan_code: target_plan_code,
      next_plan_code: null,
      change_effective_at: null,
      updated_at: now,
    }).eq("id", currentSub.id);

    // 9. Log success
    await admin.from("audit_logs").insert({
      workspace_id,
      user_id: userId,
      entity_type: "subscription",
      entity_id: currentSub.id,
      action: "subscription_upgrade_midcycle_succeeded",
      metadata: { old_plan: currentSub.plan_code, new_plan: target_plan_code, effective_at: now, provider_subscription_id: currentSub.provider_subscription_id, source_ui },
    });

    return new Response(JSON.stringify({
      status: "upgraded",
      current_plan_code: target_plan_code,
      provider_subscription_id: currentSub.provider_subscription_id,
      effective_at: now,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    console.error("Upgrade midcycle error:", err);
    return new Response(JSON.stringify({ error: "Erro interno ao processar upgrade" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
