import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VALID_PLANS = ["creator", "creator-pro"] as const;
type ValidPlan = (typeof VALID_PLANS)[number];

const PLAN_CONFIG: Record<string, { name: string; monthly_cents: number; annual_cents: number; rank: number }> = {
  free:          { name: "Gratuito",    monthly_cents: 0,     annual_cents: 0,     rank: 0 },
  creator:       { name: "Creator",     monthly_cents: 6700,  annual_cents: 5400,  rank: 1 },
  "creator-pro": { name: "Creator Pro", monthly_cents: 14900, annual_cents: 11900, rank: 2 },
};

const ALLOWED_ROLES = ["OWNER", "ADMIN"];

// In-memory idempotency lock (per isolate)
const upgradeLocks = new Map<string, number>();
const LOCK_WINDOW_MS = 30_000;

// Simple per-workspace rate limit
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;

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

/** Fetch helper with 15s timeout */
async function asaasFetch(url: string, opts: RequestInit, apiKey: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      ...opts,
      headers: { access_token: apiKey, "Content-Type": "application/json", ...(opts.headers || {}) },
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Calculate pro-rata credit for unused days.
 * Returns the discount in BRL (not cents) to apply on the first invoice of the new subscription.
 */
function calculateProRataCredit(
  currentPlanCents: number,
  billingCycle: string,
): number {
  // For simplicity, we calculate based on a 30-day month / 365-day year
  const cycleDays = billingCycle === "annual" ? 365 : 30;
  const dailyRate = (currentPlanCents / 100) / cycleDays;

  // We give credit for the remaining days. Since Asaas doesn't expose the exact
  // billing date via our DB, we use a conservative approach: give half-cycle credit.
  // This is fair on average and avoids complex date tracking.
  // In the future, we can query Asaas GET /subscriptions/{id} to get nextDueDate for exact calculation.
  const remainingDays = Math.floor(cycleDays / 2);
  const credit = Math.round(dailyRate * remainingDays * 100) / 100; // round to 2 decimals

  return credit;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const asaasApiKey = Deno.env.get("ASAAS_API_KEY");
  const asaasBase = "https://api.asaas.com/v3";

  // ── 1. Authentication ──
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Não autorizado" }, 401);
  }

  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user?.id) {
    return json({ error: "Token inválido" }, 401);
  }
  const userId = user.id;

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
      workspace_id, user_id: userId, entity_type: "subscription",
      entity_id: workspace_id, action: "upgrade_midcycle_rate_limited",
      metadata: { target_plan_code, source_ui },
    });
    return json({ error: "Muitas tentativas. Aguarde um minuto." }, 429);
  }

  // ── 4. Authorization ──
  const { data: membership } = await admin
    .from("workspace_members").select("role")
    .eq("user_id", userId).eq("workspace_id", workspace_id).single();

  if (!membership) {
    return json({ error: "Você não pertence a este workspace" }, 403);
  }
  if (!ALLOWED_ROLES.includes(membership.role)) {
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
    return json({ error: "Nenhuma assinatura ativa encontrada para upgrade" }, 409);
  }

  const currentConfig = PLAN_CONFIG[currentSub.plan_code];
  if (!currentConfig) return json({ error: "Plano atual não reconhecido" }, 500);

  // ── 6. Validate upgrade direction ──
  if (targetConfig.rank <= currentConfig.rank) {
    return json({ error: "O plano selecionado não é um upgrade" }, 400);
  }
  if (currentSub.plan_code === target_plan_code) {
    return json({ status: "already_on_plan", current_plan_code: target_plan_code }, 200);
  }

  // ── 7. Concurrency lock ──
  const lockKey = `${workspace_id}:${target_plan_code}`;
  const now = Date.now();
  const existingLock = upgradeLocks.get(lockKey);
  if (existingLock && now - existingLock < LOCK_WINDOW_MS) {
    return json({ status: "upgrade_in_progress", message: "Upgrade já está sendo processado" }, 200);
  }
  upgradeLocks.set(lockKey, now);

  if (!asaasApiKey) return json({ error: "Gateway de pagamento não configurado" }, 503);

  try {
    // ── 8. Log request ──
    await admin.from("audit_logs").insert({
      workspace_id, user_id: userId, entity_type: "subscription",
      entity_id: currentSub.id, action: "upgrade_midcycle_requested",
      metadata: { old_plan: currentSub.plan_code, new_plan: target_plan_code, source_ui },
    });

    // ── 9. Query Asaas for current subscription details (to get exact nextDueDate) ──
    let proRataCredit = 0;
    const cycleKey = currentSub.billing_cycle === "annual" ? "annual_cents" : "monthly_cents";
    const currentValueCents = currentConfig[cycleKey];
    const newValueCents = targetConfig[cycleKey];

    try {
      const subDetailRes = await asaasFetch(
        `${asaasBase}/subscriptions/${currentSub.provider_subscription_id}`,
        { method: "GET" },
        asaasApiKey,
      );
      if (subDetailRes.ok) {
        const subDetail = await subDetailRes.json();
        const nextDueDate = subDetail.nextDueDate ? new Date(subDetail.nextDueDate) : null;

        if (nextDueDate) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const cycleDays = currentSub.billing_cycle === "annual" ? 365 : 30;
          const diffMs = nextDueDate.getTime() - today.getTime();
          const remainingDays = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
          const dailyRate = (currentValueCents / 100) / cycleDays;
          proRataCredit = Math.round(dailyRate * remainingDays * 100) / 100;
          console.log(`Pro-rata: ${remainingDays} dias restantes, crédito R$${proRataCredit}`);
        }
      }
    } catch (e) {
      console.warn("Could not fetch subscription details for pro-rata, using fallback", e);
      proRataCredit = calculateProRataCredit(currentValueCents, currentSub.billing_cycle || "monthly");
    }

    // ── 10. Cancel old subscription in Asaas ──
    let cancelRes: Response;
    try {
      cancelRes = await asaasFetch(
        `${asaasBase}/subscriptions/${currentSub.provider_subscription_id}`,
        { method: "DELETE" },
        asaasApiKey,
      );
    } catch (fetchErr: any) {
      const reason = fetchErr?.name === "AbortError" ? "timeout" : "network_error";
      console.error("Asaas cancel error:", reason);
      await admin.from("audit_logs").insert({
        workspace_id, user_id: userId, entity_type: "subscription",
        entity_id: currentSub.id, action: "upgrade_midcycle_cancel_failed",
        metadata: { reason, old_plan: currentSub.plan_code },
      });
      return json({ error: "Falha de rede ao cancelar assinatura antiga. Tente novamente." }, 504);
    }

    if (!cancelRes.ok) {
      const cancelData = await cancelRes.json().catch(() => ({}));
      console.error("Asaas cancel failed:", cancelRes.status, cancelData);
      // If already deleted/inactive, continue
      if (cancelRes.status !== 404) {
        const errMsg = (cancelData as any)?.errors?.[0]?.description || "Não foi possível cancelar a assinatura anterior.";
        return json({ error: errMsg }, 502);
      }
    }

    console.log("Old subscription cancelled successfully");

    // ── 11. Create new subscription in Asaas with pro-rata discount ──
    const newValue = newValueCents / 100;
    const dueDateStr = new Date().toISOString().split("T")[0];
    const cycle = currentSub.billing_cycle === "annual" ? "YEARLY" : "MONTHLY";

    const newSubPayload: Record<string, unknown> = {
      customer: currentSub.provider_customer_id,
      billingType: "UNDEFINED", // Asaas will use the customer's default payment method
      cycle,
      value: newValue,
      nextDueDate: dueDateStr,
      description: `Assinatura ${targetConfig.name} - Kivo (upgrade)`,
      externalReference: workspace_id,
    };

    // Apply pro-rata credit as discount on first invoice
    if (proRataCredit > 0 && proRataCredit < newValue) {
      newSubPayload.discount = {
        value: proRataCredit,
        dueDateLimitDays: 0,
        type: "FIXED",
      };
      console.log(`Applying pro-rata discount of R$${proRataCredit} on first invoice`);
    }

    let createRes: Response;
    try {
      createRes = await asaasFetch(`${asaasBase}/subscriptions`, {
        method: "POST",
        body: JSON.stringify(newSubPayload),
      }, asaasApiKey);
    } catch (fetchErr: any) {
      const reason = fetchErr?.name === "AbortError" ? "timeout" : "network_error";
      console.error("Asaas create error:", reason);
      await admin.from("audit_logs").insert({
        workspace_id, user_id: userId, entity_type: "subscription",
        entity_id: currentSub.id, action: "upgrade_midcycle_create_failed",
        metadata: { reason, old_plan: currentSub.plan_code, new_plan: target_plan_code },
      });
      return json({ error: "Falha ao criar nova assinatura. Entre em contato com o suporte." }, 504);
    }

    const createData = await createRes.json();

    if (!createRes.ok || !createData.id) {
      console.error("Asaas create sub failed:", createRes.status, createData);
      await admin.from("audit_logs").insert({
        workspace_id, user_id: userId, entity_type: "subscription",
        entity_id: currentSub.id, action: "upgrade_midcycle_create_failed",
        metadata: { asaas_status: createRes.status, old_plan: currentSub.plan_code, new_plan: target_plan_code, errors: createData.errors },
      });
      const errMsg = createData.errors?.[0]?.description || "Não foi possível criar a nova assinatura. Tente novamente.";
      return json({ error: errMsg }, 502);
    }

    // ── 12. Update DB ──
    const effectiveAt = new Date().toISOString();
    await admin.from("workspace_subscriptions").update({
      plan_code: target_plan_code,
      provider_subscription_id: createData.id,
      next_plan_code: null,
      change_effective_at: null,
      status: "active",
      updated_at: effectiveAt,
    }).eq("id", currentSub.id);

    // ── 13. Log success ──
    await admin.from("audit_logs").insert({
      workspace_id, user_id: userId, entity_type: "subscription",
      entity_id: currentSub.id, action: "upgrade_midcycle_succeeded",
      metadata: {
        old_plan: currentSub.plan_code,
        new_plan: target_plan_code,
        effective_at: effectiveAt,
        old_subscription_id: currentSub.provider_subscription_id,
        new_subscription_id: createData.id,
        pro_rata_credit: proRataCredit,
        first_invoice_value: proRataCredit > 0 ? newValue - proRataCredit : newValue,
        source_ui,
      },
    });

    return json({
      status: "upgraded",
      current_plan_code: target_plan_code,
      provider_subscription_id: createData.id,
      effective_at: effectiveAt,
      pro_rata_credit: proRataCredit,
    }, 200);

  } finally {
    setTimeout(() => upgradeLocks.delete(lockKey), LOCK_WINDOW_MS);
  }
});
