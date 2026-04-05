import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

  // Auth
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

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body inválido" }, 400);
  }

  const { workspace_id } = body as { workspace_id?: string };
  if (!workspace_id || typeof workspace_id !== "string") {
    return json({ error: "workspace_id obrigatório" }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey);

  // Check permission
  const { data: membership } = await admin
    .from("workspace_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("workspace_id", workspace_id)
    .single();

  if (!membership || !["OWNER", "ADMIN"].includes(membership.role)) {
    return json({ error: "Permissão insuficiente" }, 403);
  }

  // Get active subscription
  const { data: sub } = await admin
    .from("workspace_subscriptions")
    .select("id, provider_subscription_id, plan_code, status")
    .eq("workspace_id", workspace_id)
    .in("status", ["active", "trialing", "past_due"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sub) {
    return json({ error: "Nenhuma assinatura ativa encontrada" }, 404);
  }

  if (!asaasApiKey) {
    return json({ error: "Gateway não configurado" }, 503);
  }

  // Cancel in Asaas
  if (sub.provider_subscription_id) {
    try {
      const res = await fetch(`https://api.asaas.com/v3/subscriptions/${sub.provider_subscription_id}`, {
        method: "DELETE",
        headers: { access_token: asaasApiKey },
      });
      if (!res.ok && res.status !== 404) {
        const data = await res.json().catch(() => ({}));
        console.error("Asaas cancel error:", res.status, data);
        return json({ error: "Falha ao cancelar no gateway. Tente novamente." }, 502);
      }
    } catch (e) {
      console.error("Asaas network error:", e);
      return json({ error: "Erro de rede com o gateway." }, 504);
    }
  }

  // Update DB
  await admin.from("workspace_subscriptions").update({
    status: "canceled",
    canceled_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", sub.id);

  // Audit
  await admin.from("audit_logs").insert({
    workspace_id,
    user_id: user.id,
    entity_type: "subscription",
    entity_id: sub.id,
    action: "subscription_canceled",
    metadata: { plan_code: sub.plan_code, provider_subscription_id: sub.provider_subscription_id },
  });

  return json({ status: "canceled", plan_code: sub.plan_code }, 200);
});
