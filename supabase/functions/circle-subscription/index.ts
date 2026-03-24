import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Validate auth
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

    const { action, plan_id, community_id, subscription_id } = await req.json();
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // ── CREATE SUBSCRIPTION ──
    if (action === "create") {
      if (!plan_id) {
        return new Response(JSON.stringify({ error: "plan_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch plan
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

      // Check existing active subscription
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

      // Determine initial status
      const hasTrial = plan.trial_days > 0;
      const isFree = plan.price_cents === 0;
      const now = new Date();
      let status = "pending";
      let startedAt = now.toISOString();
      let trialEndsAt = null as string | null;
      let nextBillingAt = null as string | null;

      if (isFree || hasTrial) {
        status = hasTrial ? "trialing" : "active";
        if (hasTrial) {
          trialEndsAt = new Date(now.getTime() + plan.trial_days * 86400000).toISOString();
          nextBillingAt = trialEndsAt;
        }
      }

      // For paid plans without trial, simulate payment (in production: call Pagar.me)
      // Since Pagar.me keys may not be configured, we auto-activate for now
      if (!isFree && !hasTrial) {
        status = "active";
        const intervalMs = plan.interval === "yearly" ? 365 * 86400000 : 30 * 86400000;
        nextBillingAt = new Date(now.getTime() + intervalMs).toISOString();
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
        })
        .select()
        .single();

      if (subErr) {
        console.error("Sub insert error:", subErr);
        return new Response(JSON.stringify({ error: "Failed to create subscription" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Auto-add as community member if active/trialing
      if (status === "active" || status === "trialing") {
        const { error: memberErr } = await adminClient
          .from("community_members")
          .upsert({
            community_id: plan.community_id,
            user_id: userId,
            role: "MEMBER",
            status: "ACTIVE",
            display_name: claimsData.user.email?.split("@")[0] || "Membro",
          }, { onConflict: "community_id,user_id" });

        if (memberErr) {
          console.error("Member upsert error:", memberErr);
        }
      }

      return new Response(JSON.stringify({ subscription: sub, status }), {
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

      const { error } = await adminClient
        .from("circle_subscriptions")
        .update({
          status: "canceled",
          canceled_at: new Date().toISOString(),
        })
        .eq("id", subscription_id)
        .eq("user_id", userId);

      if (error) {
        return new Response(JSON.stringify({ error: "Failed to cancel" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("circle-subscription error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});