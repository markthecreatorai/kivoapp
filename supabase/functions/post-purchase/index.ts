import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SplitRule {
  id: string;
  platform_percent: number;
  creator_percent: number;
  affiliate_percent: number;
  hold_days: number;
}

async function getSplitRule(supabase: any, workspaceId: string, productId: string | null): Promise<SplitRule> {
  // Try product-specific first, then default
  const { data } = await supabase.rpc("get_split_rule", {
    p_workspace_id: workspaceId,
    p_product_id: productId,
  });

  if (data && data.length > 0) return data[0];

  // Fallback: 10% platform, 90% creator
  return {
    id: "",
    platform_percent: 10,
    creator_percent: 90,
    affiliate_percent: 0,
    hold_days: 14,
  };
}

function calculateSplit(grossAmount: number, rule: SplitRule, gatewayFeePercent = 3.49) {
  const gatewayFee = Math.round(grossAmount * gatewayFeePercent / 100);
  const netAfterGateway = grossAmount - gatewayFee;
  const platformFee = Math.round(netAfterGateway * rule.platform_percent / 100);
  const affiliateFee = Math.round(netAfterGateway * rule.affiliate_percent / 100);
  const creatorNet = netAfterGateway - platformFee - affiliateFee;

  return { gatewayFee, platformFee, affiliateFee, creatorNet };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { order_id } = body;

    if (!order_id) {
      return new Response(JSON.stringify({ error: "order_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get order details
    const { data: order } = await supabase
      .from("orders")
      .select("id, workspace_id, product_id, customer_email, customer_name, total_amount, payment_method, customer_id, checkout_session_id, status")
      .eq("id", order_id)
      .single();

    if (!order) {
      return new Response(JSON.stringify({ error: "Order not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Idempotency: skip if already completed
    if (order.status === "COMPLETED") {
      console.log(`Post-purchase: Order ${order_id} already COMPLETED, skipping`);
      return new Response(
        JSON.stringify({ success: true, order_id: order.id, skipped: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Create entitlement if customer exists (idempotent)
    if (order.customer_id && order.product_id) {
      const { data: existingEnt } = await supabase
        .from("entitlements")
        .select("id")
        .eq("order_id", order.id)
        .eq("product_id", order.product_id)
        .eq("customer_id", order.customer_id)
        .maybeSingle();

      if (!existingEnt) {
        await supabase.from("entitlements").insert({
          customer_id: order.customer_id,
          product_id: order.product_id,
          order_id: order.id,
        });
      }
    }

    // 1b. Grant community tier if product is linked to a tier
    if (order.product_id) {
      try {
        const { data: linkedTiers } = await supabase
          .from("community_tiers")
          .select("id, community_id")
          .eq("linked_product_id", order.product_id)
          .eq("is_active", true);

        if (linkedTiers && linkedTiers.length > 0) {
          // Find member by customer_id link in community_members
          for (const lt of linkedTiers) {
            const { data: members } = await supabase
              .from("community_members")
              .select("id")
              .eq("community_id", lt.community_id)
              .eq("customer_id", order.customer_id)
              .eq("status", "ACTIVE");

            for (const member of (members || [])) {
              const { data: existing } = await supabase
                .from("community_member_tiers")
                .select("id")
                .eq("member_id", member.id)
                .eq("tier_id", lt.id)
                .eq("status", "ACTIVE")
                .maybeSingle();

              if (!existing) {
                await supabase
                  .from("community_member_tiers")
                  .update({ status: "INACTIVE", updated_at: new Date().toISOString() })
                  .eq("member_id", member.id)
                  .eq("community_id", lt.community_id)
                  .eq("status", "ACTIVE");

                await supabase.from("community_member_tiers").insert({
                  community_id: lt.community_id,
                  member_id: member.id,
                  tier_id: lt.id,
                  source_type: "PRODUCT",
                  source_id: order.id,
                  status: "ACTIVE",
                });
                console.log(`Tier ${lt.id} granted to member ${member.id} via product ${order.product_id}`);
              }
            }
          }
        }
      } catch (tierErr) {
        console.error("Tier entitlement error (non-fatal):", tierErr);
      }
    }

    // 2. Create order item if not exists
    if (order.product_id) {
      const { data: existingItem } = await supabase
        .from("order_items")
        .select("id")
        .eq("order_id", order.id)
        .eq("product_id", order.product_id)
        .maybeSingle();

      if (!existingItem) {
        const { data: price } = await supabase
          .from("prices")
          .select("id, amount")
          .eq("product_id", order.product_id)
          .eq("is_default", true)
          .maybeSingle();

        if (price) {
          await supabase.from("order_items").insert({
            order_id: order.id,
            product_id: order.product_id,
            price_id: price.id,
            unit_amount: price.amount,
            total_amount: order.total_amount,
          });
        }
      }
    }

    // 3. Update product sales_count (idempotent check via split_entries)
    if (order.product_id) {
      const { data: existingSplit } = await supabase
        .from("split_entries")
        .select("id")
        .eq("order_id", order.id)
        .maybeSingle();

      // Only increment sales_count if we haven't processed splits yet
      if (!existingSplit) {
        const { data: product } = await supabase
          .from("products")
          .select("sales_count")
          .eq("id", order.product_id)
          .single();

        if (product) {
          await supabase
            .from("products")
            .update({ sales_count: (product.sales_count || 0) + 1 })
            .eq("id", order.product_id);
        }
      }
    }

    // 4. Update order status
    await supabase
      .from("orders")
      .update({ status: "COMPLETED", paid_at: new Date().toISOString() })
      .eq("id", order.id);

    // 5. Update checkout session
    if (order.checkout_session_id) {
      await supabase
        .from("checkout_sessions")
        .update({ status: "COMPLETED", completed_at: new Date().toISOString() })
        .eq("id", order.checkout_session_id);
    }

    // 6. SPLIT: Record split entry for this sale (idempotent)
    const grossAmount = Number(order.total_amount || 0);
    if (grossAmount > 0) {
      const { data: existingSplitEntry } = await supabase
        .from("split_entries")
        .select("id")
        .eq("order_id", order.id)
        .maybeSingle();

      if (!existingSplitEntry) {
        const rule = await getSplitRule(supabase, order.workspace_id, order.product_id);
        const split = calculateSplit(grossAmount, rule);
        const availableAt = new Date();
        availableAt.setDate(availableAt.getDate() + rule.hold_days);

        await supabase.from("split_entries").insert({
          workspace_id: order.workspace_id,
          order_id: order.id,
          split_rule_id: rule.id || null,
          gross_amount: grossAmount,
          gateway_fee: split.gatewayFee,
          platform_fee: split.platformFee,
          affiliate_fee: split.affiliateFee,
          creator_net: split.creatorNet,
          status: "pending",
          available_at: availableAt.toISOString(),
        });

        // Also record in wallet_ledger for backward compatibility
        const { data: existingLedger } = await supabase
          .from("wallet_ledger")
          .select("id")
          .eq("order_id", order.id)
          .eq("type", "sale")
          .maybeSingle();

        if (!existingLedger) {
          await supabase.from("wallet_ledger").insert({
            workspace_id: order.workspace_id,
            order_id: order.id,
            type: "sale",
            amount: split.creatorNet,
            status: "pending",
            available_at: availableAt.toISOString(),
            description: `Venda #${order.id.slice(0, 8)} (líq. ${split.creatorNet})`,
          });
        }

        console.log(`Split recorded for order ${order.id}: gross=${grossAmount} gw=${split.gatewayFee} plat=${split.platformFee} aff=${split.affiliateFee} net=${split.creatorNet}`);

        // 6b. Create affiliate commission if affiliate_link_id present
        if (split.affiliateFee > 0) {
          try {
            // Get affiliate_link_id from the order or checkout_session
            let affiliateLinkId: string | null = null;

            const { data: orderRow } = await supabase
              .from("orders")
              .select("affiliate_link_id")
              .eq("id", order.id)
              .single();
            affiliateLinkId = orderRow?.affiliate_link_id || null;

            if (!affiliateLinkId && order.checkout_session_id) {
              const { data: sess } = await supabase
                .from("checkout_sessions")
                .select("affiliate_link_id")
                .eq("id", order.checkout_session_id)
                .single();
              affiliateLinkId = sess?.affiliate_link_id || null;
            }

            if (affiliateLinkId) {
              const { data: affLink } = await supabase
                .from("affiliate_links")
                .select("affiliate_id")
                .eq("id", affiliateLinkId)
                .single();

              if (affLink) {
                // Check idempotency
                const { data: existingComm } = await supabase
                  .from("commissions")
                  .select("id")
                  .eq("order_id", order.id)
                  .eq("affiliate_id", affLink.affiliate_id)
                  .maybeSingle();

                if (!existingComm) {
                  const holdDays = rule.hold_days || 14;
                  const holdUntil = new Date();
                  holdUntil.setDate(holdUntil.getDate() + holdDays);

                  await supabase.from("commissions").insert({
                    affiliate_id: affLink.affiliate_id,
                    order_id: order.id,
                    amount: split.affiliateFee,
                    status: "PENDING",
                    hold_until: holdUntil.toISOString(),
                  });

                  // Mark attribution as converted
                  await supabase
                    .from("affiliate_attributions")
                    .update({ converted_at: new Date().toISOString() })
                    .eq("affiliate_link_id", affiliateLinkId)
                    .is("converted_at", null);

                  console.log(`Commission created: affiliate=${affLink.affiliate_id} amount=${split.affiliateFee} order=${order.id}`);
                }
              }
            }
          } catch (commErr) {
            console.error("Commission creation error (non-fatal):", commErr);
          }
        }
      } else {
        console.log(`Split already exists for order ${order.id}, skipping`);
      }
    }

    // 7. AUTO NFS-e EMISSION
    try {
      const { data: fiscalSettings } = await supabase
        .from("fiscal_settings")
        .select("is_auto_emission, nfse_provider")
        .eq("workspace_id", order.workspace_id)
        .maybeSingle();

      if (fiscalSettings?.is_auto_emission && fiscalSettings?.nfse_provider) {
        const fnUrl = `${supabaseUrl}/functions/v1/emit-nfse`;
        const resp = await fetch(fnUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ order_id: order.id }),
        });
        const nfseResult = await resp.json();
        console.log(`Auto NFS-e for order ${order.id}:`, nfseResult);
      }
    } catch (nfseErr) {
      console.error("Auto NFS-e error (non-fatal):", nfseErr);
    }

    return new Response(
      JSON.stringify({ success: true, order_id: order.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Post-purchase error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
