import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const now = new Date().toISOString();
    let renewed = 0;
    let dunning = 0;
    let expired = 0;

    // 1. Handle active subscriptions due for renewal
    const { data: dueSubscriptions } = await supabase
      .from("subscriptions")
      .select(`
        *,
        subscription_plans!inner(billing_interval, products!inner(id, name, workspace_id)),
        customers!inner(id, email, name)
      `)
      .in("status", ["ACTIVE"])
      .lte("current_period_end", now)
      .eq("cancel_at_period_end", false);

    for (const sub of dueSubscriptions || []) {
      const plan = sub.subscription_plans as any;
      const product = plan?.products;

      // Get the price for this product
      const { data: price } = await supabase
        .from("prices")
        .select("id, amount")
        .eq("product_id", product.id)
        .eq("is_default", true)
        .eq("is_active", true)
        .maybeSingle();

      if (!price) continue;

      // Try to charge (simulated — in production would use Pagar.me tokenized card)
      const chargeSuccess = !!sub.card_token; // Only succeeds if we have a card token

      if (chargeSuccess) {
        // Calculate new period
        const periodEnd = new Date(sub.current_period_end);
        if (plan.billing_interval === "monthly") periodEnd.setMonth(periodEnd.getMonth() + 1);
        else if (plan.billing_interval === "quarterly") periodEnd.setMonth(periodEnd.getMonth() + 3);
        else if (plan.billing_interval === "yearly") periodEnd.setFullYear(periodEnd.getFullYear() + 1);

        // Update subscription
        await supabase
          .from("subscriptions")
          .update({
            current_period_start: sub.current_period_end,
            current_period_end: periodEnd.toISOString(),
            dunning_attempts: 0,
          })
          .eq("id", sub.id);

        // Create invoice
        await supabase.from("invoices").insert({
          subscription_id: sub.id,
          workspace_id: sub.workspace_id,
          amount: price.amount,
          status: "PAID",
          due_date: now,
          paid_at: now,
        });

        // Renew entitlement
        await supabase
          .from("entitlements")
          .update({ expires_at: periodEnd.toISOString() })
          .eq("product_id", product.id)
          .eq("customer_id", sub.customer_id)
          .is("revoked_at", null);

        renewed++;
      } else {
        // Payment failed — enter dunning
        await supabase
          .from("subscriptions")
          .update({
            status: "PAST_DUE",
            dunning_attempts: sub.dunning_attempts + 1,
            last_dunning_at: now,
          })
          .eq("id", sub.id);

        // Create failed invoice
        await supabase.from("invoices").insert({
          subscription_id: sub.id,
          workspace_id: sub.workspace_id,
          amount: price.amount,
          status: "FAILED",
          due_date: now,
        });

        dunning++;
      }
    }

    // 2. Handle PAST_DUE subscriptions (dunning retries — 3 attempts over 7 days)
    const sevenDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(); // retry every 2 days
    const { data: pastDueSubs } = await supabase
      .from("subscriptions")
      .select(`*, subscription_plans!inner(products!inner(id, workspace_id)), customers!inner(id, email)`)
      .eq("status", "PAST_DUE")
      .lt("dunning_attempts", 3)
      .lte("last_dunning_at", sevenDaysAgo);

    for (const sub of pastDueSubs || []) {
      // Retry charge (simulated)
      const retrySuccess = false;

      if (retrySuccess) {
        // Would renew period on success
        renewed++;
      } else {
        await supabase
          .from("subscriptions")
          .update({
            dunning_attempts: sub.dunning_attempts + 1,
            last_dunning_at: now,
          })
          .eq("id", sub.id);
        dunning++;
      }
    }

    // 3. Expire subscriptions with 3+ failed dunning attempts
    const { data: expiredSubs } = await supabase
      .from("subscriptions")
      .select(`*, subscription_plans!inner(products!inner(id)), customers!inner(id, email)`)
      .eq("status", "PAST_DUE")
      .gte("dunning_attempts", 3);

    for (const sub of expiredSubs || []) {
      const product = (sub.subscription_plans as any)?.products;

      await supabase
        .from("subscriptions")
        .update({ status: "EXPIRED" })
        .eq("id", sub.id);

      // Revoke entitlement
      if (product?.id) {
        await supabase
          .from("entitlements")
          .update({ revoked_at: now })
          .eq("product_id", product.id)
          .eq("customer_id", sub.customer_id)
          .is("revoked_at", null);
      }

      expired++;
    }

    // 4. Handle cancel_at_period_end subscriptions past their period
    const { data: cancelledSubs } = await supabase
      .from("subscriptions")
      .select(`*, subscription_plans!inner(products!inner(id)), customers!inner(id)`)
      .eq("cancel_at_period_end", true)
      .in("status", ["ACTIVE", "TRIALING"])
      .lte("current_period_end", now);

    for (const sub of cancelledSubs || []) {
      const product = (sub.subscription_plans as any)?.products;

      await supabase
        .from("subscriptions")
        .update({ status: "CANCELLED" })
        .eq("id", sub.id);

      if (product?.id) {
        await supabase
          .from("entitlements")
          .update({ revoked_at: now })
          .eq("product_id", product.id)
          .eq("customer_id", sub.customer_id)
          .is("revoked_at", null);
      }

      expired++;
    }

    return new Response(
      JSON.stringify({ renewed, dunning, expired }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
