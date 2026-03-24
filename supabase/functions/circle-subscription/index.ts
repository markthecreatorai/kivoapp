import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Asaas API helpers ──

function getAsaasBase() {
  const env = Deno.env.get("ASAAS_ENV") || "sandbox";
  return env === "production"
    ? "https://api.asaas.com/v3"
    : "https://sandbox.asaas.com/api/v3";
}

async function asaasRequest(path: string, method: string, body?: any, apiKey?: string) {
  const key = apiKey || Deno.env.get("ASAAS_API_KEY");
  if (!key) throw new Error("ASAAS_API_KEY not configured");

  const res = await fetch(`${getAsaasBase()}${path}`, {
    method,
    headers: {
      "access_token": key,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  if (!res.ok) {
    console.error("Asaas API error:", JSON.stringify(data));
    throw new Error(`Asaas error [${res.status}]: ${data?.errors?.[0]?.description || JSON.stringify(data)}`);
  }
  return data;
}

async function findOrCreateCustomer(email: string, name: string, cpf?: string, apiKey?: string) {
  // Search by email
  try {
    const search = await asaasRequest(`/customers?email=${encodeURIComponent(email)}`, "GET", undefined, apiKey);
    if (search?.data?.length > 0) return search.data[0];
  } catch { /* ignore search errors */ }

  // Create
  return await asaasRequest("/customers", "POST", {
    name: name || email.split("@")[0],
    email,
    cpfCnpj: cpf || undefined,
  }, apiKey);
}

async function createAsaasSubscription(
  customerId: string,
  value: number,
  cycle: string,
  description: string,
  cardData?: any,
  trialDays?: number,
  apiKey?: string
) {
  const cycleMap: Record<string, string> = { monthly: "MONTHLY", yearly: "YEARLY" };
  const nextDueDate = trialDays && trialDays > 0
    ? new Date(Date.now() + trialDays * 86400000).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const payload: any = {
    customer: customerId,
    billingType: cardData ? "CREDIT_CARD" : "PIX",
    value,
    cycle: cycleMap[cycle] || "MONTHLY",
    description,
    nextDueDate,
  };

  if (cardData) {
    payload.creditCard = {
      holderName: cardData.holder_name,
      number: cardData.number?.replace(/\s/g, ""),
      expiryMonth: cardData.exp_month,
      expiryYear: cardData.exp_year?.length === 2 ? `20${cardData.exp_year}` : cardData.exp_year,
      ccv: cardData.cvv,
    };
    payload.creditCardHolderInfo = {
      name: cardData.holder_name,
      email: cardData.email || "",
      cpfCnpj: cardData.cpf || "",
      phone: cardData.phone || "",
      postalCode: cardData.zip || "00000000",
    };
  }

  return await asaasRequest("/subscriptions", "POST", payload, apiKey);
}

async function cancelAsaasSubscription(subscriptionId: string, apiKey?: string) {
  return await asaasRequest(`/subscriptions/${subscriptionId}`, "DELETE", undefined, apiKey);
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
    const asaasKey = Deno.env.get("ASAAS_API_KEY");

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
    const { action, plan_id, subscription_id, card_data } = body;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const useRealGateway = !!asaasKey;

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

      if (isFree) {
        status = "active";
      } else if (useRealGateway) {
        // ── ASAAS FLOW ──
        try {
          const customer = await findOrCreateCustomer(userEmail, userEmail.split("@")[0], undefined, asaasKey);
          providerCustomerId = customer.id;

          const valueBRL = plan.price_cents / 100;

          if (card_data || hasTrial) {
            const asaasSub = await createAsaasSubscription(
              customer.id,
              valueBRL,
              plan.interval,
              `${plan.name} - Assinatura`,
              card_data || undefined,
              hasTrial ? plan.trial_days : undefined,
              asaasKey
            );
            providerSubscriptionId = asaasSub.id;

            if (hasTrial) {
              status = "trialing";
              trialEndsAt = new Date(now.getTime() + plan.trial_days * 86400000).toISOString();
              nextBillingAt = trialEndsAt;
            } else {
              status = asaasSub.status === "ACTIVE" ? "active" : "pending";
              const intervalMs = plan.interval === "yearly" ? 365 * 86400000 : 30 * 86400000;
              nextBillingAt = new Date(now.getTime() + intervalMs).toISOString();
            }
          } else {
            // Paid, no card → need card
            return new Response(JSON.stringify({
              error: "card_data required for paid plans",
              requires_card: true,
              customer_id: customer.id,
            }), {
              status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          console.log(`Asaas subscription created: ${providerSubscriptionId}, status: ${status}`);
        } catch (gwErr: any) {
          console.error("Asaas subscription error:", gwErr);
          return new Response(JSON.stringify({
            error: "Payment processing failed",
            details: gwErr.message,
          }), {
            status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        // ── SIMULATION MODE ──
        console.warn("ASAAS_API_KEY not set — running in simulation mode");
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
          provider: "asaas",
          provider_subscription_id: providerSubscriptionId,
          provider_customer_id: providerCustomerId,
          provider_plan_id: null,
          payment_method: card_data ? "credit_card" : (hasTrial ? "trial" : "simulation"),
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
        mode: useRealGateway ? "live" : "simulation",
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

      // Cancel on Asaas
      if (sub.provider_subscription_id && useRealGateway) {
        try {
          await cancelAsaasSubscription(sub.provider_subscription_id, asaasKey);
          console.log(`Asaas subscription ${sub.provider_subscription_id} canceled`);
        } catch (gwErr: any) {
          console.error("Asaas cancel error:", gwErr);
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
