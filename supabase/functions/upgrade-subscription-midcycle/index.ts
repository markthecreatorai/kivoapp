import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VALID_PLANS = ["creator", "creator-pro"] as const;
type ValidPlan = typeof VALID_PLANS[number];

const PLAN_CONFIG: Record<string, { name: string; monthly_cents: number; annual_cents: number; rank: number }> = {
  free:         { name: "Gratuito",    monthly_cents: 0,     annual_cents: 0,     rank: 0 },
  creator:      { name: "Creator",     monthly_cents: 6700,  annual_cents: 5400,  rank: 1 },
  "creator-pro":{ name: "Creator Pro", monthly_cents: 14900, annual_cents: 11900, rank: 2 },
};

const ALLOWED_ROLES = ["OWNER", "ADMIN"];

// In-memory idempotency lock (per isolate). Key: workspace_id:target_plan_code
const upgradeLocks = new Map<string, number>();
const LOCK_WINDOW_MS = 30_000; // 30s

// Simple per-workspace rate limit
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 min

function checkRateLimit(workspaceId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(workspaceId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(workspaceId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const asaasApiKey = Deno.env.get("ASAAS_API_KEY");
  const asaasBase = "https://api.asaas.com/v3";

  // ── 1. Authentication (JWT validated by Supabase gateway since verify_jwt=true) ──
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Não autorizado" }, 401);
  }

  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  // Double-validate claims in code for defense-in-depth
  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims?.sub) {
    return json({ error: "Token inválido" }, 401);
  }

  const userId = claimsData.claims.sub as string;

  // ── 2. Parse & validate input ──
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body JSON inválido" }, 400);
  }

  const { workspace_id, target_plan_code, source_ui } = body as {
    workspace_id?: string;
    target_plan_code?: string;
    source_ui?: string;
  };

  if (!workspace_id || typeof workspace_id !== "string" || workspace_id.length !== 36) {
    return json({ error: "workspace_id inválido" }, 400);
  }

  if (!target_plan_code || !VALID_PLANS.includes(target_plan_code as ValidPlan)) {
    return json({ error: `target_plan_code inválido. Permitidos: ${VALID_PLANS.join(", ")}` }, 400);
  }

  const targetConfig = PLAN_CONFIG[target_plan_code]!;
  const admin = createClient(supabaseUrl, serviceKey);

  // ── 3. Rate limit ──
  if (!checkRateLimit(workspace_id)) {
    await admin.from("audit_logs").insert({
      workspace_id,
      user_id: userId,
      entity_type: "subscription",
      entity_id: workspace_id,
      action: "upgrade_midcycle_rate_limited",
      metadata: { target_plan_code, source_ui },
    });
    return json({ error: "Muitas tentativas. Aguarde um minuto." }, 429);
  }

  // ── 4. Authorization: workspace membership + role ──
  const { data: membership } = await admin
    .from("workspace_members")
    .select("role")
    .eq("user_id", userId)
    .eq("workspace_id", workspace_id)
    .single();

  if (!membership) {
    await admin.from("audit_logs").insert({
      workspace_id,
      user_id: userId,
      entity_type: "subscription",
      entity_id: workspace_id,
      action: "upgrade_midcycle_forbidden",
      metadata: { reason: "not_member", target_plan_code },
    });
    return json({ error: "Você não pertence a este workspace" }, 403);
  }

  if (!ALLOWED_ROLES.includes(membership.role)) {
    await admin.from("audit_logs").insert({
      workspace_id,
      user_id: userId,
      entity_type: "subscription",
      entity_id: workspace_id,
      action: "upgrade_midcycle_forbidden",
      metadata: { reason: "insufficient_role", role: membership.role, target_plan_code },
    });
    return json({ error: "Permissão insuficiente para alterar plano" }, 403);
  }

  // ── 5. Get current subscription ──
  const { data: currentSub } = await admin
    .from("workspace_subscriptions")
    .select("id, plan_code, status, provider_subscription_id, billing_cycle, provider_customer_id")
    .eq("workspace_id", workspace_id)
    .in("status", ["active", "trialing", "past_due"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!currentSub || !currentSub.provider_subscription_id) {
    await admin.from("audit_logs").insert({
      workspace_id,
      user_id: userId,
      entity_type: "subscription",
      entity_id: workspace_id,
      action: "upgrade_midcycle_validation_failed",
      metadata: { reason: "no_active_subscription", target_plan_code },
    });
    return json({ error: "Nenhuma assinatura ativa encontrada para upgrade" }, 409);
  }

  const currentConfig = PLAN_CONFIG[currentSub.plan_code];
  if (!currentConfig) {
    return json({ error: "Plano atual não reconhecido" }, 500);
  }

  // ── 6. Validate upgrade direction ──
  if (targetConfig.rank <= currentConfig.rank) {
    await admin.from("audit_logs").insert({
      workspace_id,
      user_id: userId,
      entity_type: "subscription",
      entity_id: currentSub.id,
      action: "upgrade_midcycle_validation_failed",
      metadata: { reason: "not_an_upgrade", current_plan: currentSub.plan_code, target_plan_code },
    });
    return json({ error: "O plano selecionado não é um upgrade" }, 400);
  }

  // ── 7. Idempotency: already on target plan ──
  if (currentSub.plan_code === target_plan_code) {
    return json({
      status: "already_on_plan",
      current_plan_code: target_plan_code,
      provider_subscription_id: currentSub.provider_subscription_id,
      effective_at: new Date().toISOString(),
    }, 200);
  }

  // ── 8. Concurrency lock (prevent double-click / race) ──
  const lockKey = `${workspace_id}:${target_plan_code}`;
  const now = Date.now();
  const existingLock = upgradeLocks.get(lockKey);
  if (existingLock && now - existingLock < LOCK_WINDOW_MS) {
    return json({ status: "upgrade_in_progress", message: "Upgrade já está sendo processado" }, 200);
  }
  upgradeLocks.set(lockKey, now);

  try {
    // ── 9. Log request ──
    await admin.from("audit_logs").insert({
      workspace_id,
      user_id: userId,
      entity_type: "subscription",
      entity_id: currentSub.id,
      action: "upgrade_midcycle_requested",
      metadata: { old_plan: currentSub.plan_code, new_plan: target_plan_code, source_ui, provider_subscription_id: currentSub.provider_subscription_id },
    });

    // ── 10. Update subscription in Asaas ──
    if (!asaasApiKey) {
      return json({ error: "Gateway de pagamento não configurado" }, 503);
    }

    const cycleKey = currentSub.billing_cycle === "annual" ? "annual_cents" : "monthly_cents";
    const newValue = targetConfig[cycleKey] / 100;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000); // 15s timeout

    let asaasRes: Response;
    try {
      asaasRes = await fetch(`${asaasBase}/subscriptions/${currentSub.provider_subscription_id}`, {
        method: "PUT",
        headers: { access_token: asaasApiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          value: newValue,
          description: `Assinatura ${targetConfig.name} - Kivo`,
          externalReference: workspace_id,
        }),
        signal: controller.signal,
      });
    } catch (fetchErr: any) {
      clearTimeout(timeout);
      const reason = fetchErr?.name === "AbortError" ? "timeout" : "network_error";
      console.error("Asaas fetch error:", reason);
      await admin.from("audit_logs").insert({
        workspace_id,
        user_id: userId,
        entity_type: "subscription",
        entity_id: currentSub.id,
        action: "upgrade_midcycle_provider_failed",
        metadata: { old_plan: currentSub.plan_code, new_plan: target_plan_code, reason, provider_subscription_id: currentSub.provider_subscription_id },
      });
      return json({ error: "Timeout ou falha de rede com o gateway. Tente novamente." }, 504);
    }
    clearTimeout(timeout);

    const asaasData = await asaasRes.json();

    if (!asaasRes.ok) {
      console.error("Asaas upgrade failed, status:", asaasRes.status);
      await admin.from("audit_logs").insert({
        workspace_id,
        user_id: userId,
        entity_type: "subscription",
        entity_id: currentSub.id,
        action: "upgrade_midcycle_provider_failed",
        metadata: { old_plan: currentSub.plan_code, new_plan: target_plan_code, asaas_status: asaasRes.status, provider_subscription_id: currentSub.provider_subscription_id },
      });
      return json({ error: "Falha ao atualizar assinatura no gateway. Tente novamente." }, 502);
    }

    // ── 11. Update DB only after Asaas success ──
    const effectiveAt = new Date().toISOString();
    await admin.from("workspace_subscriptions").update({
      plan_code: target_plan_code,
      next_plan_code: null,
      change_effective_at: null,
      updated_at: effectiveAt,
    }).eq("id", currentSub.id);

    // ── 12. Log success ──
    await admin.from("audit_logs").insert({
      workspace_id,
      user_id: userId,
      entity_type: "subscription",
      entity_id: currentSub.id,
      action: "upgrade_midcycle_succeeded",
      metadata: { old_plan: currentSub.plan_code, new_plan: target_plan_code, effective_at: effectiveAt, provider_subscription_id: currentSub.provider_subscription_id, source_ui },
    });

    return json({
      status: "upgraded",
      current_plan_code: target_plan_code,
      provider_subscription_id: currentSub.provider_subscription_id,
      effective_at: effectiveAt,
    }, 200);

  } finally {
    // Release lock after processing (keep for remaining window to prevent rapid retry)
    setTimeout(() => upgradeLocks.delete(lockKey), LOCK_WINDOW_MS);
  }
});
