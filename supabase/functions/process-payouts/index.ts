import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

function getAsaasBase() {
  const env = Deno.env.get("ASAAS_ENV") || "sandbox";
  return env === "production"
    ? "https://api.asaas.com/v3"
    : "https://sandbox.asaas.com/api/v3";
}

interface RiskResult {
  risk_score: number;
  risk_flags: any[];
  recent_chargebacks: number;
  refund_ratio: number;
  payout_count_today: number;
  payout_total_today: number;
}

interface PayoutSettings {
  min_payout_amount: number;
  max_daily_payout: number;
  max_payouts_per_day: number;
  kyc_required: boolean;
  kyc_approved: boolean;
  auto_payout_enabled: boolean;
  risk_threshold: number;
}

const DEFAULT_SETTINGS: PayoutSettings = {
  min_payout_amount: 5000,
  max_daily_payout: 500000,
  max_payouts_per_day: 3,
  kyc_required: false,
  kyc_approved: false,
  auto_payout_enabled: true,
  risk_threshold: 50,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth: x-cron-secret
  const cronSecret = Deno.env.get("CRON_SECRET");
  const providedSecret = req.headers.get("x-cron-secret");
  if (!cronSecret || providedSecret !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const startedAt = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const asaasKey = Deno.env.get("ASAAS_API_KEY");
  const supabase = createClient(supabaseUrl, serviceKey);

  const summary = {
    processed: 0,
    paid: 0,
    failed: 0,
    blocked: 0,
    manual_review: 0,
    errors: [] as string[],
  };

  try {
    // Fetch pending payout requests
    const { data: pendingPayouts } = await supabase
      .from("payout_requests")
      .select("id, workspace_id, bank_account_id, amount, net_amount, requested_by, status")
      .eq("status", "requested")
      .order("created_at", { ascending: true })
      .limit(50);

    if (!pendingPayouts || pendingPayouts.length === 0) {
      return new Response(JSON.stringify({ success: true, summary, message: "No pending payouts" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    for (const payout of pendingPayouts) {
      try {
        // 1. Get payout settings
        const { data: settingsRow } = await supabase
          .from("payout_settings")
          .select("*")
          .eq("workspace_id", payout.workspace_id)
          .maybeSingle();
        const settings: PayoutSettings = settingsRow || DEFAULT_SETTINGS;

        // 2. Pre-payout validations
        const validationErrors: string[] = [];

        // Min amount
        if (payout.amount < settings.min_payout_amount) {
          validationErrors.push(`Valor abaixo do mínimo (${settings.min_payout_amount / 100})`);
        }

        // KYC
        if (settings.kyc_required && !settings.kyc_approved) {
          validationErrors.push("KYC não aprovado");
        }

        // Auto payout disabled
        if (!settings.auto_payout_enabled) {
          validationErrors.push("Auto-payout desabilitado");
        }

        // Bank account exists
        if (!payout.bank_account_id) {
          validationErrors.push("Conta bancária não informada");
        } else {
          const { data: bankAccount } = await supabase
            .from("bank_accounts")
            .select("id, pix_key, pix_key_type")
            .eq("id", payout.bank_account_id)
            .maybeSingle();
          if (!bankAccount) {
            validationErrors.push("Conta bancária não encontrada");
          }
        }

        // Available balance check
        const { data: balanceData } = await supabase.rpc("get_creator_balance", {
          p_workspace_id: payout.workspace_id,
        });
        const availableBalance = Number(balanceData?.[0]?.available_balance || 0);
        if (payout.amount > availableBalance) {
          validationErrors.push(`Saldo insuficiente (disponível: ${availableBalance / 100})`);
        }

        // 3. Risk scoring
        const { data: riskData } = await supabase.rpc("calculate_payout_risk", {
          p_workspace_id: payout.workspace_id,
        });
        const risk: RiskResult = riskData?.[0] || {
          risk_score: 0, risk_flags: [], recent_chargebacks: 0,
          refund_ratio: 0, payout_count_today: 0, payout_total_today: 0,
        };

        // Velocity checks
        if (risk.payout_count_today >= settings.max_payouts_per_day) {
          validationErrors.push(`Limite de saques diários atingido (${settings.max_payouts_per_day})`);
        }
        if (Number(risk.payout_total_today) + payout.amount > settings.max_daily_payout) {
          validationErrors.push(`Limite de valor diário atingido`);
        }

        // Log fraud checks
        const checks = [
          { check_type: "min_amount", passed: payout.amount >= settings.min_payout_amount },
          { check_type: "balance_check", passed: payout.amount <= availableBalance },
          { check_type: "velocity_count", passed: risk.payout_count_today < settings.max_payouts_per_day },
          { check_type: "velocity_amount", passed: Number(risk.payout_total_today) + payout.amount <= settings.max_daily_payout },
          { check_type: "risk_score", passed: risk.risk_score < settings.risk_threshold },
        ];

        for (const check of checks) {
          await supabase.from("fraud_checks").insert({
            workspace_id: payout.workspace_id,
            payout_request_id: payout.id,
            check_type: check.check_type,
            passed: check.passed,
            details: { risk_score: risk.risk_score, flags: risk.risk_flags },
          });
        }

        // Block if validation fails
        if (validationErrors.length > 0) {
          await supabase.from("payout_requests").update({
            status: "failed",
            failed_reason: validationErrors.join("; "),
            risk_score: risk.risk_score,
            risk_flags: risk.risk_flags,
            processed_at: new Date().toISOString(),
          }).eq("id", payout.id);

          summary.blocked++;
          summary.processed++;
          continue;
        }

        // Send to manual review if high risk
        if (risk.risk_score >= settings.risk_threshold) {
          await supabase.from("payout_requests").update({
            status: "manual_review",
            review_reason: `Risk score: ${risk.risk_score}. Flags: ${JSON.stringify(risk.risk_flags)}`,
            risk_score: risk.risk_score,
            risk_flags: risk.risk_flags,
          }).eq("id", payout.id);

          // Alert admin
          await sendAlert(supabase, payout.workspace_id,
            `⚠️ Payout #${payout.id.slice(0, 8)} enviado para revisão manual. Score: ${risk.risk_score}`);

          summary.manual_review++;
          summary.processed++;
          continue;
        }

        // 4. Execute transfer via Asaas
        await supabase.from("payout_requests").update({
          status: "processing",
          risk_score: risk.risk_score,
          risk_flags: risk.risk_flags,
        }).eq("id", payout.id);

        if (!asaasKey) {
          await supabase.from("payout_requests").update({
            status: "failed",
            failed_reason: "ASAAS_API_KEY not configured",
            processed_at: new Date().toISOString(),
          }).eq("id", payout.id);
          summary.failed++;
          summary.processed++;
          continue;
        }

        // Get bank account details for Asaas transfer
        const { data: bankAcc } = await supabase
          .from("bank_accounts")
          .select("*")
          .eq("id", payout.bank_account_id)
          .single();

        const transferBody: any = {
          value: payout.net_amount / 100, // Asaas expects reais, not cents
          description: `Repasse Kivo #${payout.id.slice(0, 8)}`,
        };

        // Use PIX if available, otherwise bank transfer
        if (bankAcc?.pix_key) {
          transferBody.operationType = "PIX";
          transferBody.pixAddressKey = bankAcc.pix_key;
        } else {
          transferBody.operationType = "TED";
          transferBody.bankAccount = {
            bank: { code: bankAcc?.bank_code },
            accountName: bankAcc?.holder_name,
            ownerName: bankAcc?.holder_name,
            cpfCnpj: bankAcc?.holder_document,
            agency: bankAcc?.agency,
            account: bankAcc?.account_number,
            accountDigit: "",
            bankAccountType: bankAcc?.account_type === "poupanca" ? "SAVINGS" : "CHECKING",
          };
        }

        const transferRes = await fetch(`${getAsaasBase()}/transfers`, {
          method: "POST",
          headers: {
            "access_token": asaasKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(transferBody),
        });

        const transferData = await transferRes.json();

        if (!transferRes.ok || transferData.errors) {
          const errorMsg = transferData.errors?.[0]?.description || transferData.message || "Transfer failed";
          await supabase.from("payout_requests").update({
            status: "failed",
            failed_reason: errorMsg,
            processed_at: new Date().toISOString(),
          }).eq("id", payout.id);

          await sendAlert(supabase, payout.workspace_id,
            `❌ Payout #${payout.id.slice(0, 8)} falhou: ${errorMsg}`);

          // Notify creator
          await notifyCreator(supabase, payout.workspace_id, "payout_failed", { amount: payout.net_amount, failure_reason: errorMsg });

          summary.failed++;
        } else {
          await supabase.from("payout_requests").update({
            status: "paid",
            external_transfer_id: transferData.id,
            processed_at: new Date().toISOString(),
          }).eq("id", payout.id);

          // Audit log
          await supabase.from("audit_logs").insert({
            workspace_id: payout.workspace_id,
            entity_type: "payout_request",
            entity_id: payout.id,
            action: "payout_paid",
            metadata: {
              amount: payout.net_amount,
              external_transfer_id: transferData.id,
              method: bankAcc?.pix_key ? "PIX" : "TED",
            },
          });

          // Notify creator
          await notifyCreator(supabase, payout.workspace_id, "payout_paid", { amount: payout.net_amount, external_transfer_id: transferData.id });

          summary.paid++;
        }

        summary.processed++;
      } catch (err: any) {
        console.error(`Error processing payout ${payout.id}:`, err.message);
        summary.errors.push(`${payout.id.slice(0, 8)}:${err.message}`);
        await supabase.from("payout_requests").update({
          status: "failed",
          failed_reason: err.message,
          processed_at: new Date().toISOString(),
        }).eq("id", payout.id);
        summary.failed++;
        summary.processed++;
      }
    }

    // Alert summary if any issues
    if (summary.failed > 0 || summary.manual_review > 0) {
      try {
        const telegramKey = Deno.env.get("TELEGRAM_API_KEY");
        const chatId = Deno.env.get("TELEGRAM_CHAT_ID");
        if (telegramKey && chatId) {
          const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";
          const lovableKey = Deno.env.get("LOVABLE_API_KEY");
          const msg = `💸 *Payouts Processados*\n\n✅ Pagos: ${summary.paid}\n❌ Falhos: ${summary.failed}\n⚠️ Revisão: ${summary.manual_review}\n🚫 Bloqueados: ${summary.blocked}`;
          await fetch(`${GATEWAY_URL}/bot${telegramKey}/sendMessage`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(lovableKey ? { "Authorization": `Bearer ${lovableKey}`, "X-Connection-Api-Key": telegramKey } : {}),
            },
            body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: "Markdown" }),
          });
        }
      } catch (e) {
        console.error("Alert error (non-fatal):", e);
      }
    }

    const durationMs = Date.now() - startedAt;
    console.log(JSON.stringify({ event: "process_payouts_complete", duration_ms: durationMs, summary }));

    return new Response(JSON.stringify({ success: true, summary, duration_ms: durationMs }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Process payouts error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function sendAlert(supabase: any, workspaceId: string, message: string) {
  try {
    // In-app notification to workspace owner
    const { data: owners } = await supabase
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", workspaceId)
      .eq("role", "OWNER");

    if (owners) {
      for (const owner of owners) {
        await supabase.from("notifications").insert({
          user_id: owner.user_id,
          type: "payout_alert",
          title: "Alerta de Repasse",
          body: message,
        });
      }
    }
  } catch (e) {
    console.error("sendAlert error:", e);
  }
}
