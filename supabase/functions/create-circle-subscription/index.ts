import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY") || "";
const ASAAS_BASE_URL = Deno.env.get("ASAAS_ENV") === "production"
  ? "https://api.asaas.com/v3"
  : "https://sandbox.asaas.com/api/v3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get authenticated user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized");

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) throw new Error("Unauthorized");

    const body = await req.json();
    const { action, plan_id, card_data, subscription_id } = body;

    // ── CREATE subscription ──────────────────────────────
    if (action === "create") {
      // 1. Get plan details
      const { data: plan, error: planError } = await supabase
        .from("circle_plans")
        .select("*, community:communities(*)")
        .eq("id", plan_id)
        .single();
      if (planError || !plan) throw new Error("Plano não encontrado");

      // 2. Get or create Asaas customer
      let asaasCustomerId: string;
      const { data: existingSub } = await supabase
        .from("circle_subscriptions")
        .select("asaas_customer_id")
        .eq("user_id", user.id)
        .not("asaas_customer_id", "is", null)
        .limit(1)
        .maybeSingle();

      if (existingSub?.asaas_customer_id) {
        asaasCustomerId = existingSub.asaas_customer_id;
      } else {
        // Create customer in Asaas
        const customerRes = await fetch(`${ASAAS_BASE_URL}/customers`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "access_token": ASAAS_API_KEY,
          },
          body: JSON.stringify({
            name: user.user_metadata?.display_name || user.email,
            email: user.email,
            externalReference: user.id,
          }),
        });
        const customer = await customerRes.json();
        if (!customerRes.ok) throw new Error(customer.errors?.[0]?.description || "Erro ao criar cliente Asaas");
        asaasCustomerId = customer.id;
      }

      // 3. Check for existing active subscription
      const { data: activeSub } = await supabase
        .from("circle_subscriptions")
        .select("id, status")
        .eq("user_id", user.id)
        .eq("community_id", plan.community_id)
        .in("status", ["active", "trialing"])
        .maybeSingle();

      if (activeSub) throw new Error("Already subscribed");

      // 4. Handle free trial (no card needed)
      const hasTrial = plan.trial_days > 0;
      const isFree = plan.price_cents === 0;

      let status = "trialing";
      let asaasSubId = null;
      let nextBillingDate = null;

      if (!isFree) {
        // 5. Create subscription in Asaas
        const billingType = card_data ? "CREDIT_CARD" : "BOLETO";
        const nextDue = new Date();
        nextDue.setDate(nextDue.getDate() + (hasTrial ? plan.trial_days : 1));

        const subPayload: any = {
          customer: asaasCustomerId,
          billingType,
          value: plan.price_cents / 100,
          nextDueDate: nextDue.toISOString().split("T")[0],
          cycle: plan.interval === "yearly" ? "YEARLY" : "MONTHLY",
          description: `Assinatura: ${plan.community.name}`,
          externalReference: `${user.id}::${plan.community_id}`,
        };

        if (card_data) {
          if (card_data.creditCardToken) {
            subPayload.creditCardToken = card_data.creditCardToken;
          } else {
            subPayload.creditCard = {
              holderName: card_data.holder_name,
              number: card_data.number,
              expiryMonth: card_data.exp_month,
              expiryYear: card_data.exp_year,
              ccv: card_data.cvv,
            };
            subPayload.creditCardHolderInfo = {
              name: card_data.holder_name,
              email: user.email,
            };
          }
        }

        const subRes = await fetch(`${ASAAS_BASE_URL}/subscriptions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "access_token": ASAAS_API_KEY,
          },
          body: JSON.stringify(subPayload),
        });

        const sub = await subRes.json();
        if (!subRes.ok) throw new Error(sub.errors?.[0]?.description || "Erro ao criar assinatura Asaas");

        asaasSubId = sub.id;
        status = hasTrial ? "trialing" : "active";
        nextBillingDate = sub.nextDueDate;
      } else {
        status = "active";
      }

      // 6. Upsert in circle_subscriptions
      const { error: subInsertError } = await supabase
        .from("circle_subscriptions")
        .upsert({
          user_id: user.id,
          community_id: plan.community_id,
          plan_id: plan.id,
          status,
          asaas_subscription_id: asaasSubId,
          asaas_customer_id: asaasCustomerId,
          current_period_end: nextBillingDate
            ? new Date(nextBillingDate).toISOString()
            : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          trial_end: hasTrial
            ? new Date(Date.now() + plan.trial_days * 24 * 60 * 60 * 1000).toISOString()
            : null,
        }, { onConflict: "user_id,community_id" });

      if (subInsertError) throw subInsertError;

      // 7. Ensure community_members row exists and is ACTIVE
      await supabase.from("community_members").upsert(
        {
          user_id: user.id,
          community_id: plan.community_id,
          role: "MEMBER",
          status: "ACTIVE",
          display_name: user.user_metadata?.display_name || user.email?.split("@")[0] || "Membro",
        },
        { onConflict: "community_id,user_id" }
      );

      return new Response(
        JSON.stringify({ status, requires_card: !card_data && !isFree && !hasTrial }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── CANCEL subscription ──────────────────────────────
    if (action === "cancel") {
      const { data: sub } = await supabase
        .from("circle_subscriptions")
        .select("*")
        .eq("id", subscription_id)
        .eq("user_id", user.id)
        .single();

      if (!sub) throw new Error("Assinatura não encontrada");

      if (sub.asaas_subscription_id) {
        await fetch(`${ASAAS_BASE_URL}/subscriptions/${sub.asaas_subscription_id}`, {
          method: "DELETE",
          headers: { "access_token": ASAAS_API_KEY },
        });
      }

      await supabase
        .from("circle_subscriptions")
        .update({ status: "canceled", canceled_at: new Date().toISOString() })
        .eq("id", subscription_id);

      return new Response(
        JSON.stringify({ status: "canceled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (err: any) {
    console.error("create-circle-subscription error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
