import { corsHeadersFor } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, getClientIp } from "../_shared/rate-limit.ts";

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

  try {
    const { code, workspace_id, customer_email, order_amount } = await req.json();

    if (!code || !workspace_id) {
      return new Response(
        JSON.stringify({ valid: false, error: "Código e workspace são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 0. Rate limit (IP + workspace) to block coupon brute force
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


    // 1. Find coupon
    const { data: coupon, error: couponErr } = await supabase
      .from("coupons")
      .select("*")
      .eq("workspace_id", workspace_id)
      .eq("code", code.toUpperCase())
      .single();

    if (couponErr || !coupon) {
      return new Response(
        JSON.stringify({ valid: false, error: "Cupom não encontrado" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Check active
    if (!coupon.is_active) {
      return new Response(
        JSON.stringify({ valid: false, error: "Cupom inativo" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Check validity dates
    const now = new Date();
    if (new Date(coupon.valid_from) > now) {
      return new Response(
        JSON.stringify({ valid: false, error: "Cupom ainda não está válido" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (coupon.valid_until && new Date(coupon.valid_until) < now) {
      return new Response(
        JSON.stringify({ valid: false, error: "Cupom expirado" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Check max_uses
    if (coupon.max_uses !== null && coupon.current_uses >= coupon.max_uses) {
      return new Response(
        JSON.stringify({ valid: false, error: "Cupom atingiu o limite de usos" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Check per-customer usage
    if (customer_email) {
      const { count } = await supabase
        .from("coupon_usages")
        .select("id", { count: "exact", head: true })
        .eq("coupon_id", coupon.id)
        .eq("customer_email", customer_email.toLowerCase());

      if ((count ?? 0) >= coupon.max_uses_per_customer) {
        return new Response(
          JSON.stringify({ valid: false, error: "Você já usou este cupom" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // 6. Check min order amount
    const orderAmountNum = Number(order_amount || 0);
    if (coupon.min_order_amount && orderAmountNum < coupon.min_order_amount) {
      const minFormatted = new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(coupon.min_order_amount / 100);
      return new Response(
        JSON.stringify({
          valid: false,
          error: `Pedido mínimo de ${minFormatted}`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7. Calculate discount
    let discount = 0;
    if (coupon.type === "PERCENT") {
      discount = Math.round(orderAmountNum * (coupon.value / 100));
    } else {
      // FIXED — value is in cents
      discount = Math.min(coupon.value, orderAmountNum);
    }

    return new Response(
      JSON.stringify({
        valid: true,
        coupon_id: coupon.id,
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        discount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Validate coupon error:", err);
    return new Response(
      JSON.stringify({ valid: false, error: "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
