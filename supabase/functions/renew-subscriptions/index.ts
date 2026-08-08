import { corsHeaders } from "../_shared/cors.ts";
import { requireCronSecret } from "../_shared/cron-auth.ts";
import { startCronRun, readJsonBody } from "../_shared/cron-run.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";


const RETRY_INTERVAL_DAYS = 2;
const MAX_DUNNING_ATTEMPTS = 3;

function getAsaasBase() {
  const env = (Deno.env.get("ASAAS_ENV") || "sandbox").trim().toLowerCase();
  return env === "production" || env === "prod"
    ? "https://api.asaas.com/v3"
    : "https://sandbox.asaas.com/api/v3";
}

async function callAsaas(
  path: string,
  body: unknown,
  apiKey: string,
  method = "POST",
): Promise<any> {
  const res = await fetch(`${getAsaasBase()}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      access_token: apiKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.errors?.[0]?.description || json?.message || `Asaas ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

/** Localiza (ou cria) o cliente no gateway a partir do CPF/e-mail salvos. */
async function findOrCreateAsaasCustomer(
  customer: { name?: string | null; email?: string | null; cpf?: string | null; phone?: string | null },
  apiKey: string,
): Promise<string> {
  const cpf = (customer.cpf || "").replace(/\D/g, "");
  if (cpf) {
    const search = await callAsaas(`/customers?cpfCnpj=${cpf}`, null, apiKey, "GET");
    if (search?.data?.length) return search.data[0].id;
  }
  if (customer.email) {
    const search = await callAsaas(
      `/customers?email=${encodeURIComponent(customer.email)}`,
      null,
      apiKey,
      "GET",
    );
    if (search?.data?.length) return search.data[0].id;
  }
  if (!cpf) throw new Error("Cliente sem CPF/CNPJ cadastrado — cobrança recorrente não pode ser criada");

  const created = await callAsaas("/customers", {
    name: customer.name || customer.email || "Cliente",
    email: customer.email || undefined,
    cpfCnpj: cpf,
    mobilePhone: customer.phone?.replace(/\D/g, "") || undefined,
  }, apiKey);
  return created.id;
}

type ChargeResult = {
  paid: boolean;
  gatewayPaymentId: string | null;
  gatewayStatus: string | null;
  error: string | null;
};

/** Cobrança real no cartão tokenizado do cliente. Nunca "simula" sucesso. */
async function chargeStoredCard(
  apiKey: string,
  sub: any,
  customer: any,
  amount: number,
  description: string,
): Promise<ChargeResult> {
  if (!sub.card_token) {
    return { paid: false, gatewayPaymentId: null, gatewayStatus: null, error: "Assinatura sem cartão tokenizado" };
  }

  try {
    const asaasCustomerId = await findOrCreateAsaasCustomer(customer || {}, apiKey);

    const charge = await callAsaas("/payments", {
      customer: asaasCustomerId,
      billingType: "CREDIT_CARD",
      value: Number(amount),
      dueDate: new Date().toISOString().split("T")[0],
      description,
      externalReference: `subscription:${sub.id}`,
      creditCardToken: sub.card_token,
    }, apiKey);

    const gatewayStatus = String(charge?.status || "").toUpperCase();
    const paid = gatewayStatus === "CONFIRMED" || gatewayStatus === "RECEIVED";

    return {
      paid,
      gatewayPaymentId: charge?.id ?? null,
      gatewayStatus: gatewayStatus || null,
      error: paid ? null : `Cobrança não aprovada (status ${gatewayStatus || "desconhecido"})`,
    };
  } catch (err) {
    return {
      paid: false,
      gatewayPaymentId: null,
      gatewayStatus: null,
      error: (err as Error).message || "Erro na cobrança",
    };
  }
}

function addInterval(from: Date, interval: string): Date {
  const d = new Date(from);
  if (interval === "monthly") d.setMonth(d.getMonth() + 1);
  else if (interval === "quarterly") d.setMonth(d.getMonth() + 3);
  else if (interval === "yearly") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const cronDenied = requireCronSecret(req, "renew-subscriptions");
  if (cronDenied) return cronDenied;

  const reqBody = await readJsonBody(req);
  const cronRun = await startCronRun(req, reqBody);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Fail closed: sem gateway configurado, nada é renovado.
    const apiKey = (Deno.env.get("ASAAS_API_KEY") || "").trim();
    if (!apiKey) {
      console.error("renew-subscriptions abortado: ASAAS_API_KEY não configurada. Nenhuma renovação executada.");
      await cronRun.finish("FAILED", {}, "ASAAS_API_KEY não configurada");
      return new Response(
        JSON.stringify({ error: "Gateway de pagamento não configurado — renovações abortadas" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const now = new Date().toISOString();
    let renewed = 0;
    let dunning = 0;
    let expired = 0;
    let skipped = 0;

    /**
     * IDEMPOTÊNCIA: reserva a tentativa antes de falar com o gateway.
     * A chave (assinatura + fim do período + nº da tentativa) tem índice único,
     * então uma segunda execução na mesma janela não cobra de novo.
     */
    const claimAttempt = async (row: Record<string, unknown>): Promise<boolean> => {
      const { error } = await supabase
        .from("subscription_charge_attempts")
        .insert({ ...row, status: "PENDING" });
      if (!error) return true;
      if ((error as any).code === "23505") {
        console.log("Cobrança já reservada por outra execução:", row.idempotency_key);
        return false;
      }
      console.error("Falha ao reservar tentativa de cobrança:", error);
      return false;
    };

    const finalizeAttempt = async (key: string, patch: Record<string, unknown>) => {
      const { error } = await supabase
        .from("subscription_charge_attempts")
        .update(patch)
        .eq("idempotency_key", key);
      if (error) console.error("Falha ao atualizar tentativa de cobrança:", error);
    };

    /** Cobra, e só renova quando o gateway confirmar o pagamento. */
    async function processCharge(sub: any, plan: any, product: any, price: any, isRetry: boolean) {
      const attemptNumber = (sub.dunning_attempts || 0) + 1;
      const idempotencyKey = `renew:${sub.id}:${sub.current_period_end}:${attemptNumber}`;

      const claimed = await claimAttempt({
        subscription_id: sub.id,
        workspace_id: sub.workspace_id,
        attempt_number: attemptNumber,
        is_retry: isRetry,
        amount: price.amount,
        idempotency_key: idempotencyKey,
      });

      if (!claimed) {
        skipped++;
        return;
      }

      const result = await chargeStoredCard(
        apiKey,
        sub,
        sub.customers,
        Number(price.amount),
        `Renovação - ${product?.name || "Assinatura"}`,
      );

      if (result.paid) {
        const periodEnd = addInterval(new Date(sub.current_period_end), plan?.billing_interval);

        const { data: invoice } = await supabase.from("invoices").insert({
          subscription_id: sub.id,
          workspace_id: sub.workspace_id,
          amount: price.amount,
          status: "PAID",
          due_date: now,
          paid_at: now,
        }).select("id").single();

        await supabase.from("subscriptions").update({
          status: "ACTIVE",
          current_period_start: sub.current_period_end,
          current_period_end: periodEnd.toISOString(),
          dunning_attempts: 0,
          last_dunning_at: null,
        }).eq("id", sub.id);

        if (product?.id) {
          await supabase.from("entitlements")
            .update({ expires_at: periodEnd.toISOString() })
            .eq("product_id", product.id)
            .eq("customer_id", sub.customer_id)
            .is("revoked_at", null);
        }

        await finalizeAttempt(idempotencyKey, {
          invoice_id: invoice?.id ?? null,
          gateway_payment_id: result.gatewayPaymentId,
          gateway_status: result.gatewayStatus,
          status: "PAID",
        });

        renewed++;
        return;
      }

      // Falha: registra invoice FAILED, incrementa tentativas e agenda retry.
      const nextRetryAt = attemptNumber >= MAX_DUNNING_ATTEMPTS
        ? null
        : new Date(Date.now() + RETRY_INTERVAL_DAYS * 24 * 60 * 60 * 1000).toISOString();

      const { data: invoice } = await supabase.from("invoices").insert({
        subscription_id: sub.id,
        workspace_id: sub.workspace_id,
        amount: price.amount,
        status: "FAILED",
        due_date: now,
      }).select("id").single();

      await supabase.from("subscriptions").update({
        status: "PAST_DUE",
        dunning_attempts: attemptNumber,
        last_dunning_at: now,
      }).eq("id", sub.id);

      await finalizeAttempt(idempotencyKey, {
        invoice_id: invoice?.id ?? null,
        gateway_payment_id: result.gatewayPaymentId,
        gateway_status: result.gatewayStatus,
        status: "FAILED",
        error_message: result.error,
        next_retry_at: nextRetryAt,
      });

      dunning++;
    }

    // 1. Assinaturas ativas com renovação vencida
    const { data: dueSubscriptions } = await supabase
      .from("subscriptions")
      .select(`
        *,
        subscription_plans!inner(billing_interval, products!inner(id, name, workspace_id)),
        customers!inner(id, email, name, cpf, phone)
      `)
      .in("status", ["ACTIVE"])
      .lte("current_period_end", now)
      .eq("cancel_at_period_end", false);

    for (const sub of dueSubscriptions || []) {
      const plan = sub.subscription_plans as any;
      const product = plan?.products;

      const { data: price } = await supabase
        .from("prices")
        .select("id, amount")
        .eq("product_id", product.id)
        .eq("is_default", true)
        .eq("is_active", true)
        .maybeSingle();

      if (!price) continue;

      await processCharge(sub, plan, product, price, false);
    }

    // 2. Retentativas de dunning (cobrança real, nunca simulada)
    const retryCutoff = new Date(Date.now() - RETRY_INTERVAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data: pastDueSubs } = await supabase
      .from("subscriptions")
      .select(`
        *,
        subscription_plans!inner(billing_interval, products!inner(id, name, workspace_id)),
        customers!inner(id, email, name, cpf, phone)
      `)
      .eq("status", "PAST_DUE")
      .lt("dunning_attempts", MAX_DUNNING_ATTEMPTS)
      .lte("last_dunning_at", retryCutoff);

    for (const sub of pastDueSubs || []) {
      const plan = sub.subscription_plans as any;
      const product = plan?.products;

      const { data: price } = await supabase
        .from("prices")
        .select("id, amount")
        .eq("product_id", product.id)
        .eq("is_default", true)
        .eq("is_active", true)
        .maybeSingle();

      if (!price) continue;

      await processCharge(sub, plan, product, price, true);
    }

    // 3. Expira assinaturas com 3+ tentativas falhas
    const { data: expiredSubs } = await supabase
      .from("subscriptions")
      .select(`*, subscription_plans!inner(products!inner(id)), customers!inner(id, email)`)
      .eq("status", "PAST_DUE")
      .gte("dunning_attempts", MAX_DUNNING_ATTEMPTS);

    for (const sub of expiredSubs || []) {
      const product = (sub.subscription_plans as any)?.products;

      await supabase.from("subscriptions").update({ status: "EXPIRED" }).eq("id", sub.id);

      if (product?.id) {
        await supabase.from("entitlements")
          .update({ revoked_at: now })
          .eq("product_id", product.id)
          .eq("customer_id", sub.customer_id)
          .is("revoked_at", null);
      }

      expired++;
    }

    // 4. Cancelamentos agendados para o fim do período
    const { data: cancelledSubs } = await supabase
      .from("subscriptions")
      .select(`*, subscription_plans!inner(products!inner(id)), customers!inner(id)`)
      .eq("cancel_at_period_end", true)
      .in("status", ["ACTIVE", "TRIALING"])
      .lte("current_period_end", now);

    for (const sub of cancelledSubs || []) {
      const product = (sub.subscription_plans as any)?.products;

      await supabase.from("subscriptions").update({ status: "CANCELLED" }).eq("id", sub.id);

      if (product?.id) {
        await supabase.from("entitlements")
          .update({ revoked_at: now })
          .eq("product_id", product.id)
          .eq("customer_id", sub.customer_id)
          .is("revoked_at", null);
      }

      expired++;
    }

    await cronRun.finish("SUCCESS", { renewed, dunning, expired, skipped });
    return new Response(
      JSON.stringify({ renewed, dunning, expired, skipped }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error:", error);
    await cronRun.finish("FAILED", {}, (error as Error).message);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
