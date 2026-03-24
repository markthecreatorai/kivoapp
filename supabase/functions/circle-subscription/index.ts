import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PAGARME_BASE = "https://api.pagar.me/core/v5";

// ── Pagar.me API helpers ──

async function pagarmeRequest(path: string, method: string, body?: any, apiKey?: string) {
  const key = apiKey || Deno.env.get("PAGARME_API_KEY");
  if (!key) throw new Error("PAGARME_API_KEY not configured");

  const auth = btoa(`${key}:`);
  const res = await fetch(`${PAGARME_BASE}${path}`, {
    method,
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  if (!res.ok) {
    console.error("Pagar.me API error:", JSON.stringify(data));
    throw new Error(`Pagar.me error [${res.status}]: ${data?.message || JSON.stringify(data)}`);
  }
  return data;
}

async function findOrCreateCustomer(email: string, name: string, apiKey?: string) {
  // Search existing
  try {
    const customers = await pagarmeRequest(`/customers?email=${encodeURIComponent(email)}`, "GET", undefined, apiKey);
    if (customers?.data?.length > 0) return customers.data[0];
  } catch { /* ignore search errors */ }

  // Create new
  return await pagarmeRequest("/customers", "POST", {
    name: name || email.split("@")[0],
    email,
    type: "individual",
    code: email,
  }, apiKey);
}

async function findOrCreatePlan(plan: any, apiKey?: string) {
  if (plan.provider_plan_id) {
    // Verify it exists
    try {
      const existing = await pagarmeRequest(`/plans/${plan.provider_plan_id}`, "GET", undefined, apiKey);
      if (existing?.id) return existing;
    } catch { /* plan deleted, recreate */ }
  }

  const intervalMap: Record<string, string> = { monthly: "month", yearly: "year" };
  const result = await pagarmeRequest("/plans", "POST", {
    name: plan.name,
    description: plan.description || plan.name,
    interval: intervalMap[plan.interval] || "month",
    interval_count: 1,
    billing_type: "prepaid",
    payment_methods: ["credit_card"],
    items: [{
      name: plan.name,
      quantity: 1,
      pricing_scheme: {
        scheme_type: "unit",
        price: plan.price_cents,
      },
    }],
    currency: plan.currency || "BRL",
    ...(plan.trial_days > 0 ? { trial_period_days: plan.trial_days } : {}),
  }, apiKey);

  return result;
}

async function createSubscription(customerId: string, planId: string, cardToken: string, apiKey?: string) {
  return await pagarmeRequest("/subscriptions", "POST", {
    customer_id: customerId,
    plan_id: planId,
    payment_method: "credit_card",
    card_token: cardToken,
  }, apiKey);
}

async function cancelSubscription(providerSubId: string, apiKey?: string) {
  return await pagarmeRequest(`/subscriptions/${providerSubId}`, "DELETE", undefined, apiKey);
}

// ── Main handler ──

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const pagarmeKey = Deno.env.get("PAGARME_API_KEY");

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getUser(token);
    if (claimsError || !claimsData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.user.id;
    const userEmail = claimsData.user.email || "";

    const body = await req.json();
    const { action, plan_id, subscription_id, card_token } = body;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const useRealPagarme = !!pagarmeKey;

    // ── CREATE SUBSCRIPTION ──
    if (action === "create") {
      if (!plan_id) {
        return new Response(JSON.stringify({ error: "plan_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: plan, error: planErr } = await adminClient
        .from("circle_plans")
        .select("*")
        .eq("id", plan_id)
        .eq("is_active", true)
        .single();

      if (planErr || !plan) {
        return new Response(JSON.stringify({ error: "Plan not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check existing
      const { data: existing } = await adminClient
        .from("circle_subscriptions")
        .select("id, status")
        .eq("user_id", userId)
        .eq("community_id", plan.community_id)
        .in("status", ["active", "trialing", "pending"])
        .maybeSingle();

      if (existing) {
        return new Response(JSON.stringify({ error: "Already subscribed", subscription_id: existing.id }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const now = new Date();
      const hasTrial = plan.trial_days > 0;
      const isFree = plan.price_cents === 0;
      let status = "pending";
      let startedAt = now.toISOString();
      let trialEndsAt: string | null = null;
      let nextBillingAt: string | null = null;
      let providerSubscriptionId: string | null = null;
      let providerCustomerId: string | null = null;
      let providerPlanId: string | null = null;

      if (isFree) {
        status = "active";
      } else if (useRealPagarme) {
        // ── REAL PAGAR.ME FLOW ──
        try {
          // 1. Create/find customer
          const customer = await findOrCreateCustomer(userEmail, userEmail.split("@")[0], pagarmeKey);
          providerCustomerId = customer.id;

          // 2. Create/find plan
          const pgPlan = await findOrCreatePlan(plan, pagarmeKey);
          providerPlanId = pgPlan.id;

          // Save plan_id back to circle_plans if not set
          if (!plan.provider_plan_id) {
            await adminClient.from("circle_plans")
              .update({ provider_plan_id: pgPlan.id })
              .eq("id", plan.id);
          }

          // 3. Create subscription
          if (card_token) {
            const pgSub = await createSubscription(customer.id, pgPlan.id, card_token, pagarmeKey);
            providerSubscriptionId = pgSub.id;
            status = pgSub.status === "active" ? "active" : hasTrial ? "trialing" : "pending";
          } else if (hasTrial) {
            // Trial without card — auto-activate trial
            status = "trialing";
            trialEndsAt = new Date(now.getTime() + plan.trial_days * 86400000).toISOString();
            nextBillingAt = trialEndsAt;
          } else {
            // Paid plan, no card_token — need to collect card
            return new Response(JSON.stringify({
              error: "card_token required for paid plans",
              requires_card: true,
              customer_id: customer.id,
              plan_provider_id: pgPlan.id,
            }), {
              status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          if (status === "active") {
            const intervalMs = plan.interval === "yearly" ? 365 * 86400000 : 30 * 86400000;
            nextBillingAt = new Date(now.getTime() + intervalMs).toISOString();
          }

          console.log(`Pagar.me subscription created: ${providerSubscriptionId}, status: ${status}`);
        } catch (pgErr: any) {
          console.error("Pagar.me subscription error:", pgErr);
          return new Response(JSON.stringify({
            error: "Payment processing failed",
            details: pgErr.message,
          }), {
            status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        // ── SIMULATION MODE (no API key) ──
        console.warn("PAGARME_API_KEY not set — running in simulation mode");
        if (hasTrial) {
          status = "trialing";
          trialEndsAt = new Date(now.getTime() + plan.trial_days * 86400000).toISOString();
          nextBillingAt = trialEndsAt;
        } else {
          status = "active";
          const intervalMs = plan.interval === "yearly" ? 365 * 86400000 : 30 * 86400000;
          nextBillingAt = new Date(now.getTime() + intervalMs).toISOString();
        }
      }

      // Insert subscription
      const { data: sub, error: subErr } = await adminClient
        .from("circle_subscriptions")
        .insert({
          user_id: userId,
          community_id: plan.community_id,
          plan_id: plan.id,
          status,
          started_at: startedAt,
          trial_ends_at: trialEndsAt,
          next_billing_at: nextBillingAt,
          provider: "pagarme",
          provider_subscription_id: providerSubscriptionId,
          provider_customer_id: providerCustomerId,
          provider_plan_id: providerPlanId,
          payment_method: card_token ? "credit_card" : (hasTrial ? "trial" : "simulation"),
        })
        .select()
        .single();

      if (subErr) {
        console.error("Sub insert error:", subErr);
        return new Response(JSON.stringify({ error: "Failed to create subscription" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Auto-add as community member
      if (status === "active" || status === "trialing") {
        await adminClient.from("community_members").upsert({
          community_id: plan.community_id,
          user_id: userId,
          role: "MEMBER",
          status: "ACTIVE",
          display_name: userEmail.split("@")[0] || "Membro",
        }, { onConflict: "community_id,user_id" });
      }

      return new Response(JSON.stringify({
        subscription: sub,
        status,
        mode: useRealPagarme ? "live" : "simulation",
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── CANCEL SUBSCRIPTION ──
    if (action === "cancel") {
      if (!subscription_id) {
        return new Response(JSON.stringify({ error: "subscription_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get subscription
      const { data: sub } = await adminClient
        .from("circle_subscriptions")
        .select("*")
        .eq("id", subscription_id)
        .eq("user_id", userId)
        .single();

      if (!sub) {
        return new Response(JSON.stringify({ error: "Subscription not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Cancel on Pagar.me if real
      if (sub.provider_subscription_id && useRealPagarme) {
        try {
          await cancelSubscription(sub.provider_subscription_id, pagarmeKey);
          console.log(`Pagar.me subscription ${sub.provider_subscription_id} canceled`);
        } catch (pgErr: any) {
          console.error("Pagar.me cancel error:", pgErr);
          // Still cancel locally even if Pagar.me fails
        }
      }

      await adminClient.from("circle_subscriptions").update({
        status: "canceled",
        canceled_at: new Date().toISOString(),
      }).eq("id", subscription_id);

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("circle-subscription error:", err);
    return new Response(JSON.stringify({ error: "Internal server error", details: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
