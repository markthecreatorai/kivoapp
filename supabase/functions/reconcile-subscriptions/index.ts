import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Admin-only: validate cron secret or admin JWT
  const cronSecret = Deno.env.get("CRON_SECRET");
  const authHeader = req.headers.get("x-cron-secret") || req.headers.get("authorization");
  
  if (cronSecret && authHeader !== cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // Check if it's an admin JWT
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader || "" } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    const userEmail = user?.email;
    if (userEmail !== "lucaslopescarrijo@gmail.com") {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const asaasApiKey = Deno.env.get("ASAAS_API_KEY");
  const supabase = createClient(supabaseUrl, serviceKey);

  if (!asaasApiKey) {
    return new Response(JSON.stringify({ error: "ASAAS_API_KEY not configured" }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const asaasBase = "https://api.asaas.com/v3";
  const fixes: any[] = [];

  try {
    // Get all non-canceled workspace subscriptions
    const { data: subs } = await supabase
      .from("workspace_subscriptions")
      .select("id, workspace_id, provider_subscription_id, plan_code, status")
      .not("provider_subscription_id", "is", null)
      .not("status", "eq", "canceled");

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ ok: true, fixes: 0, message: "No subscriptions to reconcile" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    for (const sub of subs) {
      try {
        const res = await fetch(`${asaasBase}/subscriptions/${sub.provider_subscription_id}`, {
          headers: { access_token: asaasApiKey },
        });
        if (!res.ok) {
          console.warn(`Asaas returned ${res.status} for subscription ${sub.provider_subscription_id}`);
          continue;
        }

        const asaasSub = await res.json();
        
        // Map Asaas status to internal status
        let asaasStatus: string;
        if (asaasSub.deleted || asaasSub.status === "INACTIVE") {
          asaasStatus = "canceled";
        } else if (asaasSub.status === "ACTIVE") {
          asaasStatus = "active";
        } else if (asaasSub.status === "EXPIRED") {
          asaasStatus = "expired";
        } else {
          asaasStatus = sub.status; // keep current if unknown
        }

        if (asaasStatus !== sub.status) {
          await supabase.from("workspace_subscriptions").update({
            status: asaasStatus,
            updated_at: new Date().toISOString(),
            ...(asaasStatus === "canceled" ? { canceled_at: new Date().toISOString() } : {}),
          }).eq("id", sub.id);

          await supabase.from("audit_logs").insert({
            workspace_id: sub.workspace_id,
            entity_type: "subscription",
            entity_id: sub.id,
            action: "subscription_reconcile_fixed",
            metadata: { old_status: sub.status, new_status: asaasStatus, provider_subscription_id: sub.provider_subscription_id },
          });

          fixes.push({ subscription_id: sub.id, old: sub.status, new: asaasStatus });
        }
      } catch (subErr) {
        console.error(`Error reconciling subscription ${sub.id}:`, subErr);
      }
    }

    return new Response(JSON.stringify({ ok: true, fixes: fixes.length, details: fixes }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Reconciliation error:", err);
    return new Response(JSON.stringify({ error: "Reconciliation failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
