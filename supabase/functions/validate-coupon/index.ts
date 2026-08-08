import { corsHeadersFor } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, getClientIp } from "../_shared/rate-limit.ts";
import { resolveCoupon } from "../_shared/coupon.ts";

// Anti-enumeration limits
const IP_LIMIT = 20; // attempts per IP
const IP_WINDOW_SECONDS = 60;
const WORKSPACE_LIMIT = 60; // attempts per workspace
const WORKSPACE_WINDOW_SECONDS = 60;

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const { code, workspace_id, customer_email, order_amount, product_id } = await req.json();

    if (!code || !workspace_id) {
      return json({ valid: false, error: "Código e workspace são obrigatórios" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Rate limit (IP + workspace) to block coupon brute force
    const ip = getClientIp(req);
    const ipCheck = await checkRateLimit(
      supabase, "validate-coupon:ip", ip, IP_LIMIT, IP_WINDOW_SECONDS,
    );
    const wsCheck = ipCheck.allowed
      ? await checkRateLimit(
          supabase, "validate-coupon:workspace", workspace_id,
          WORKSPACE_LIMIT, WORKSPACE_WINDOW_SECONDS,
        )
      : { allowed: false };

    if (!ipCheck.allowed || !wsCheck.allowed) {
      console.warn("validate-coupon rate limited", { ip, workspace_id });
      return new Response(
        JSON.stringify({
          valid: false,
          error: "Muitas tentativas. Aguarde um minuto e tente novamente.",
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" } }
      );
    }

    // Same logic used by create-payment (server-side source of truth)
    const result = await resolveCoupon(supabase, {
      code,
      workspaceId: workspace_id,
      customerEmail: customer_email || null,
      orderAmount: Number(order_amount || 0),
      productId: product_id || null,
    });

    if (!result.valid || !result.coupon) {
      return json({ valid: false, error: result.error || "Cupom inválido" });
    }

    return json({
      valid: true,
      coupon_id: result.coupon.id,
      code: result.coupon.code,
      type: result.coupon.type,
      value: Number(result.coupon.value),
      discount: result.discount,
    });
  } catch (err) {
    console.error("Validate coupon error:", err);
    return json({ valid: false, error: "Erro interno" }, 500);
  }
});
