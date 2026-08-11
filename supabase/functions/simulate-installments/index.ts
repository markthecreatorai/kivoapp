import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeadersFor } from "../_shared/cors.ts";
import { checkRateLimit, getClientIp } from "../_shared/rate-limit.ts";

// Simulação pública consome quota do gateway: teto por IP.
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_SECONDS = 60;

function getAsaasBase() {
  const env = Deno.env.get("ASAAS_ENV") || "sandbox";
  return env === "production"
    ? "https://api.asaas.com/v3"
    : "https://sandbox.asaas.com/api/v3";
}

/**
 * Simulate installments using Asaas API or fallback calculation.
 * POST body: { amount: number, max_installments: number }
 * Returns: { installments: [{ number, value, total, interest_rate, has_interest }] }
 */
Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const rate = await checkRateLimit(
      supabase,
      "simulate-installments",
      getClientIp(req),
      RATE_LIMIT_MAX,
      RATE_LIMIT_WINDOW_SECONDS,
    );
    if (!rate.allowed) {
      return new Response(JSON.stringify({ error: "Muitas simulações. Aguarde um minuto." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { amount, max_installments } = await req.json();

    if (!amount || amount <= 0) {
      return new Response(JSON.stringify({ error: "amount is required and must be > 0" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const maxInst = Math.min(max_installments || 12, 12);
    const asaasApiKey = Deno.env.get("ASAAS_API_KEY") || "";

    interface InstallmentOption {
      number: number;
      value: number;
      total: number;
      interest_rate: number;
      has_interest: boolean;
    }

    let installments: InstallmentOption[] = [];

    if (asaasApiKey) {
      // Try Asaas simulation endpoint
      try {
        const res = await fetch(
          `${getAsaasBase()}/payments/simulate?value=${amount}&installmentCount=${maxInst}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              "access_token": asaasApiKey,
            },
          }
        );

        if (res.ok) {
          const data = await res.json();
          // Asaas returns an array of installment options
          if (data?.installments && Array.isArray(data.installments)) {
            installments = data.installments.map((inst: any) => ({
              number: inst.installmentCount || inst.installment,
              value: inst.installmentValue || inst.value,
              total: inst.totalValue || (inst.installmentValue * (inst.installmentCount || inst.installment)),
              interest_rate: inst.interestRate || 0,
              has_interest: (inst.installmentCount || inst.installment) > 1 && (inst.interestRate || 0) > 0,
            }));
          }
        }

        // If Asaas didn't return useful data, also check the payment simulation
        if (installments.length === 0) {
          const res2 = await fetch(
            `${getAsaasBase()}/payments/simulate`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "access_token": asaasApiKey,
              },
              body: JSON.stringify({
                value: amount,
                installmentCount: maxInst,
                billingType: "CREDIT_CARD",
              }),
            }
          );

          if (res2.ok) {
            const data2 = await res2.json();
            if (Array.isArray(data2)) {
              installments = data2.map((inst: any) => ({
                number: inst.installmentNumber || inst.installmentCount,
                value: inst.installmentValue || inst.value,
                total: inst.totalValue || (inst.installmentValue * inst.installmentNumber),
                interest_rate: inst.interestPercentage || 0,
                has_interest: (inst.installmentNumber || 1) > 1,
              }));
            }
          }
        }
      } catch (e) {
        console.error("Asaas simulation error:", e);
      }
    }

    // Fallback: calculate locally with standard rates if Asaas didn't return data
    if (installments.length === 0) {
      // Standard Brazilian installment rates (approximate)
      const monthlyRate = 0.0199; // ~1.99% per month (typical)

      for (let n = 1; n <= maxInst; n++) {
        if (n === 1) {
          installments.push({
            number: 1,
            value: amount,
            total: amount,
            interest_rate: 0,
            has_interest: false,
          });
        } else {
          // Price formula: PMT = PV * [r(1+r)^n] / [(1+r)^n - 1]
          const r = monthlyRate;
          const factor = (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
          const installmentValue = Math.round(amount * factor * 100) / 100;
          const totalWithInterest = Math.round(installmentValue * n * 100) / 100;

          installments.push({
            number: n,
            value: installmentValue,
            total: totalWithInterest,
            interest_rate: Math.round(r * 10000) / 100, // as percentage
            has_interest: true,
          });
        }
      }
    }

    // Ensure we always have at least the 1x option
    if (installments.length === 0) {
      installments = [{ number: 1, value: amount, total: amount, interest_rate: 0, has_interest: false }];
    }

    return new Response(JSON.stringify({ installments }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Simulate installments error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
