import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Cálculo de split/comissão vive exclusivamente no RPC process_order_financials.
// Nenhuma lógica financeira duplicada nesta função.


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // AUTH: internal-only function. Never callable from the public front-end.
    const internalToken = Deno.env.get("KIVO_INTERNAL_TOKEN");
    if (!internalToken) {
      console.error("post-purchase: KIVO_INTERNAL_TOKEN not configured");
      return new Response(JSON.stringify({ error: "Função não configurada" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (req.headers.get("x-kivo-internal-token") !== internalToken) {
      console.error("post-purchase: unauthorized call (invalid internal token)");
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
      .select("id, workspace_id, product_id, customer_email, customer_name, total_amount, payment_method, customer_id, checkout_session_id, status, paid_at")
      .eq("id", order_id)
      .single();

    if (!order) {
      return new Response(JSON.stringify({ error: "Order not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // SECURITY: only paid orders can be provisioned
    // Sandbox/test orders are never provisioned.
    if (order.status === "TEST") {
      console.warn(`post-purchase: refusing TEST order ${order.id}`);
      return new Response(JSON.stringify({ error: "Pedido de teste — nenhum acesso concedido" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (order.status !== "COMPLETED" || !order.paid_at) {
      console.error(`post-purchase: refusing unpaid order ${order.id} (status=${order.status}, paid_at=${order.paid_at})`);
      return new Response(JSON.stringify({ error: "Pedido não pago" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Create entitlement if customer exists (idempotent via unique constraint)
    if (order.customer_id && order.product_id) {
      const { error: entErr } = await supabase
        .from("entitlements")
        .upsert(
          {
            customer_id: order.customer_id,
            product_id: order.product_id,
            order_id: order.id,
          },
          { onConflict: "customer_id,product_id,order_id", ignoreDuplicates: true }
        );
      if (entErr) {
        console.error("post-purchase: entitlement upsert error:", JSON.stringify(entErr));
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

    // 4. Order is already COMPLETED/paid at this point (validated above) — never set it here

    // 5. Update checkout session
    if (order.checkout_session_id) {
      await supabase
        .from("checkout_sessions")
        .update({ status: "COMPLETED", completed_at: new Date().toISOString() })
        .eq("id", order.checkout_session_id);
    }

    // 6. SPLIT + CARTEIRA + COMISSÃO DE AFILIADO
    // Fonte única de verdade: RPC transacional, idempotente, service_role only.
    // Nunca recalcular aqui — a base é orders.total_amount (já líquida de descontos)
    // e a comissão sai de affiliate_programs, reservada dentro do creator_net.
    const { data: financials, error: finErr } = await supabase.rpc("process_order_financials", {
      p_order_id: order.id,
      p_gateway_fee_cents: 0,
      p_settle: true,
    });

    if (finErr) {
      console.error(`post-purchase: process_order_financials falhou para ${order.id}:`, JSON.stringify(finErr));
      return new Response(JSON.stringify({ error: "Falha ao processar repasse do pedido" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`post-purchase: financials do pedido ${order.id}:`, JSON.stringify(financials));


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
