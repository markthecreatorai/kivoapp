import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

import { corsHeadersFor } from "../_shared/cors.ts";



const normalizeEmail = (v: unknown) =>
  typeof v === "string" ? v.trim().toLowerCase() : "";

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    let paymentId = url.searchParams.get("payment_id");
    let orderId = url.searchParams.get("order_id");
    let email = normalizeEmail(url.searchParams.get("email"));

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      paymentId = body.payment_id ?? paymentId;
      orderId = body.order_id ?? orderId;
      email = normalizeEmail(body.email) || email;
    }

    if (!paymentId && !orderId) {
      return json({ error: "payment_id ou order_id obrigatório" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Identidade opcional via JWT (fluxos autenticados, ex: upgrade de assinatura)
    let authEmail = "";
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const { data } = await supabase.auth.getClaims(token);
      authEmail = normalizeEmail((data?.claims as any)?.email);
    }

    // O comprador precisa provar quem é: e-mail informado ou sessão autenticada.
    if (!email && !authEmail) {
      return json({ error: "email do comprador obrigatório" }, 400);
    }

    const paymentSelect = "id, order_id, status, method, amount, processed_at";
    let payment: any = null;

    if (paymentId) {
      const { data } = await supabase
        .from("payments")
        .select(paymentSelect)
        .eq("id", paymentId)
        .maybeSingle();
      payment = data;
      // Se ambos vieram, precisam pertencer ao mesmo pedido
      if (payment && orderId && payment.order_id !== orderId) payment = null;
    } else {
      const { data } = await supabase
        .from("payments")
        .select(paymentSelect)
        .eq("order_id", orderId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      payment = data;
    }

    if (!payment) {
      return json({ error: "Pagamento não encontrado" }, 404);
    }

    // Valida que o e-mail informado realmente é o do comprador do pedido.
    const { data: order } = await supabase
      .from("orders")
      .select("id, customer_id, checkout_session_id")
      .eq("id", payment.order_id)
      .maybeSingle();

    if (!order) return json({ error: "Pagamento não encontrado" }, 404);

    const ownerEmails = new Set<string>();
    if (order.customer_id) {
      const { data: customer } = await supabase
        .from("customers")
        .select("email")
        .eq("id", order.customer_id)
        .maybeSingle();
      if (customer?.email) ownerEmails.add(normalizeEmail(customer.email));
    }
    if (order.checkout_session_id) {
      const { data: session } = await supabase
        .from("checkout_sessions")
        .select("email")
        .eq("id", order.checkout_session_id)
        .maybeSingle();
      if (session?.email) ownerEmails.add(normalizeEmail(session.email));
    }

    const provided = [email, authEmail].filter(Boolean);
    const authorized = provided.some((e) => ownerEmails.has(e));

    if (!authorized) {
      console.warn("check-payment-status: email mismatch", { order_id: order.id });
      // 404 para não confirmar a existência do id vazado
      return json({ error: "Pagamento não encontrado" }, 404);
    }

    let pixData = null;
    if (payment.method === "pix") {
      const { data } = await supabase
        .from("pix_payment_data")
        .select("qr_code, qr_code_url, copy_paste_code, expires_at, paid_at")
        .eq("payment_id", payment.id)
        .maybeSingle();
      pixData = data;
    }

    return json({
      payment_id: payment.id,
      order_id: payment.order_id,
      status: payment.status,
      method: payment.method,
      amount: payment.amount,
      processed_at: payment.processed_at,
      pix_data: pixData,
      pix: pixData,
    });
  } catch (err) {
    console.error("Check payment error:", err);
    return json({ error: "Erro interno" }, 500);
  }
});
