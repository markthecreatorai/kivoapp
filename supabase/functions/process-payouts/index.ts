// process-payouts — executa transferências (Asaas) dos saques aprovados.
// Chamável APENAS internamente: cron (X-Kivo-Cron-Secret) ou admin Kivo (JWT).
// Nunca pelo produtor. verify_jwt = true no config.toml.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { startCronRun, readJsonBody } from "../_shared/cron-run.ts";

const FN = "process-payouts";
const BATCH_LIMIT = 25;
const RISK_THRESHOLD = 50;
const ACTIVE_CHARGEBACKS = ["new", "evidence_pending", "submitted"];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function getAsaasBase() {
  return (Deno.env.get("ASAAS_ENV") || "sandbox") === "production"
    ? "https://api.asaas.com/v3"
    : "https://sandbox.asaas.com/api/v3";
}

function timingSafeEqualStr(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

type Admin = ReturnType<typeof createClient>;

/** Autoriza cron (segredo) ou admin Kivo (JWT). Retorna o "caller" ou null. */
async function authorize(req: Request, admin: Admin): Promise<string | null> {
  const expected = Deno.env.get("CRON_SECRET");
  const provided =
    req.headers.get("x-kivo-cron-secret") || req.headers.get("x-cron-secret") || "";
  if (expected && provided && timingSafeEqualStr(provided, expected)) return "cron";

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "");

  const { data: userData } = await admin.auth.getUser(token);
  const userId = userData?.user?.id;
  if (!userId) return null;

  const { data: isAdmin } = await admin.rpc("is_admin_user");
  // is_admin_user usa o contexto do chamador; validamos também por user_roles
  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  if (isAdmin === true || roleRow) return `admin:${userId}`;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const startedAt = Date.now();
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const caller = await authorize(req, admin);
  if (!caller) {
    console.warn(`[${FN}] chamada não autorizada`);
    return json({ error: "Unauthorized" }, 401);
  }

  const cronBody = await readJsonBody(req);
  const run = await startCronRun(req, cronBody);

  const asaasKey = Deno.env.get("ASAAS_API_KEY");
  const summary = {
    processed: 0,
    completed: 0,
    failed: 0,
    in_review: 0,
    skipped: 0,
    errors: [] as string[],
  };

  try {
    // ─── 1. Saques aprovados (idempotência: só status "approved" entra) ───
    const { data: approved, error: fetchErr } = await admin
      .from("payout_requests")
      .select(
        "id, workspace_id, bank_account_id, amount, fee, net_amount, status, idempotency_key",
      )
      .eq("status", "approved")
      .order("created_at", { ascending: true })
      .limit(BATCH_LIMIT);
    if (fetchErr) throw fetchErr;

    if (!approved || approved.length === 0) {
      await run.finish("SUCCESS", { ...summary, message: "Nenhum saque aprovado" });
      return json({ success: true, summary, message: "Nenhum saque aprovado" });
    }

    for (const payout of approved) {
      try {
        // ─── 2. Trava otimista: approved → processing (só 1 worker ganha) ───
        const { data: locked, error: lockErr } = await admin
          .from("payout_requests")
          .update({ status: "processing", processing_started_at: new Date().toISOString() })
          .eq("id", payout.id)
          .eq("status", "approved")
          .select("id")
          .maybeSingle();
        if (lockErr) throw lockErr;
        if (!locked) {
          summary.skipped++;
          continue;
        }
        summary.processed++;

        const fail = async (reason: string) => {
          await admin
            .from("payout_requests")
            .update({
              status: "failed",
              failed_reason: reason.slice(0, 500),
              processed_at: new Date().toISOString(),
            })
            .eq("id", payout.id);
          await refundDebit(admin, payout);
          await notifyCreator(admin, payout.workspace_id, "payout_failed", {
            amount: payout.net_amount,
            failure_reason: reason,
          });
          summary.failed++;
        };

        // ─── 3. Conta bancária ───
        if (!payout.bank_account_id) {
          await fail("Conta bancária não informada");
          continue;
        }
        const { data: bank } = await admin
          .from("bank_accounts")
          .select(
            "id, workspace_id, pix_key, pix_key_type, bank_code, agency, account_number, account_type, holder_name, holder_document",
          )
          .eq("id", payout.bank_account_id)
          .maybeSingle();
        if (!bank || String(bank.workspace_id) !== String(payout.workspace_id)) {
          await fail("Conta bancária inválida para este workspace");
          continue;
        }

        // ─── 4. Chargeback ativo bloqueia o repasse ───
        const { data: cbs } = await admin
          .from("chargeback_cases")
          .select("id")
          .eq("workspace_id", payout.workspace_id)
          .in("status", ACTIVE_CHARGEBACKS)
          .limit(1);
        if (cbs && cbs.length > 0) {
          await admin
            .from("payout_requests")
            .update({
              status: "in_review",
              review_reason: "Chargeback ativo no workspace — repasse retido",
            })
            .eq("id", payout.id);
          summary.in_review++;
          continue;
        }

        // ─── 5. Risco ───
        const { data: riskData } = await admin.rpc("calculate_payout_risk", {
          p_workspace_id: payout.workspace_id,
        });
        const risk = (riskData as Array<Record<string, unknown>> | null)?.[0] ?? null;
        const riskScore = Number(risk?.risk_score ?? 0);
        const riskFlags = risk?.risk_flags ?? [];

        if (riskScore >= RISK_THRESHOLD) {
          await admin
            .from("payout_requests")
            .update({
              status: "in_review",
              review_reason: `Risco alto (score ${riskScore})`,
              risk_score: riskScore,
              risk_flags: riskFlags as never,
            })
            .eq("id", payout.id);
          await notifyCreator(admin, payout.workspace_id, "payout_review", {
            amount: payout.net_amount,
          });
          summary.in_review++;
          continue;
        }

        if (!asaasKey) {
          await fail("ASAAS_API_KEY não configurada");
          continue;
        }

        // ─── 6. Garante o débito no ledger antes de transferir ───
        await ensureDebit(admin, payout);

        // ─── 7. Transferência Asaas ───
        const transferBody: Record<string, unknown> = {
          value: Number((payout.net_amount / 100).toFixed(2)), // Asaas usa reais
          description: `Repasse Kivo #${String(payout.id).slice(0, 8)}`,
          externalReference: payout.id,
        };
        if (bank.pix_key) {
          transferBody.operationType = "PIX";
          transferBody.pixAddressKey = bank.pix_key;
          if (bank.pix_key_type) transferBody.pixAddressKeyType = bank.pix_key_type;
        } else {
          transferBody.operationType = "TED";
          transferBody.bankAccount = {
            bank: { code: bank.bank_code },
            accountName: bank.holder_name,
            ownerName: bank.holder_name,
            cpfCnpj: bank.holder_document,
            agency: bank.agency,
            account: bank.account_number,
            bankAccountType: bank.account_type === "poupanca" ? "SAVINGS" : "CHECKING",
          };
        }

        const res = await fetch(`${getAsaasBase()}/transfers`, {
          method: "POST",
          headers: {
            access_token: asaasKey,
            "Content-Type": "application/json",
            // idempotência no gateway: evita transferência duplicada
            "asaas-idempotency-key": String(payout.idempotency_key || payout.id),
          },
          body: JSON.stringify(transferBody),
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok || data?.errors) {
          const msg = data?.errors?.[0]?.description || data?.message ||
            `HTTP ${res.status}`;
          console.error(`[${FN}] transferência falhou ${payout.id}: ${msg}`);
          await fail(msg);
          continue;
        }

        // ─── 8. Sucesso ───
        await admin
          .from("payout_requests")
          .update({
            status: "completed",
            external_transfer_id: data?.id ?? null,
            failed_reason: null,
            risk_score: riskScore,
            processed_at: new Date().toISOString(),
          })
          .eq("id", payout.id);

        await admin.from("audit_logs").insert({
          workspace_id: payout.workspace_id,
          entity_type: "payout_request",
          entity_id: payout.id,
          action: "payout_completed",
          metadata: {
            amount_cents: payout.amount,
            net_amount_cents: payout.net_amount,
            fee_cents: payout.fee,
            external_transfer_id: data?.id ?? null,
            method: bank.pix_key ? "PIX" : "TED",
            caller,
          } as never,
        });

        await notifyCreator(admin, payout.workspace_id, "payout_paid", {
          amount: payout.net_amount,
          external_transfer_id: data?.id ?? null,
        });

        summary.completed++;
      } catch (err) {
        const msg = (err as Error).message;
        console.error(`[${FN}] erro no saque ${payout.id}:`, msg);
        summary.errors.push(`${String(payout.id).slice(0, 8)}:${msg}`);
        await admin
          .from("payout_requests")
          .update({
            status: "failed",
            failed_reason: msg.slice(0, 500),
            processed_at: new Date().toISOString(),
          })
          .eq("id", payout.id);
        await refundDebit(admin, payout);
        summary.failed++;
      }
    }

    const durationMs = Date.now() - startedAt;
    console.log(JSON.stringify({ event: "process_payouts_complete", durationMs, summary }));
    await run.finish("SUCCESS", { ...summary, duration_ms: durationMs });
    return json({ success: true, summary, duration_ms: durationMs });
  } catch (err) {
    console.error(`[${FN}] erro:`, (err as Error).message);
    await run.finish("FAILED", { ...summary, duration_ms: Date.now() - startedAt }, (err as Error).message);
    return json({ error: "Erro ao processar saques" }, 500);
  }

});

interface PayoutRow {
  id: string;
  workspace_id: string;
  amount: number;
  net_amount: number;
}

/** Débito no ledger (idempotente por descrição `Saque <id>`). */
async function ensureDebit(admin: Admin, payout: PayoutRow) {
  const description = `Saque ${payout.id}`;
  const { data: existing } = await admin
    .from("wallet_ledger")
    .select("id")
    .eq("workspace_id", payout.workspace_id)
    .eq("type", "withdrawal")
    .eq("description", description)
    .maybeSingle();
  if (existing) return;

  const { error } = await admin.from("wallet_ledger").insert({
    workspace_id: payout.workspace_id,
    type: "withdrawal",
    amount: payout.amount,
    currency: "BRL",
    status: "available",
    available_at: new Date().toISOString(),
    description,
  });
  if (error) throw error;
}

/** Estorno do débito quando o saque falha (idempotente). */
async function refundDebit(admin: Admin, payout: PayoutRow) {
  try {
    const debitDescription = `Saque ${payout.id}`;
    const refundDescription = `Estorno saque ${payout.id}`;

    const { data: debit } = await admin
      .from("wallet_ledger")
      .select("id, amount")
      .eq("workspace_id", payout.workspace_id)
      .eq("type", "withdrawal")
      .eq("description", debitDescription)
      .maybeSingle();
    if (!debit) return; // nunca debitou — nada a estornar

    const { data: alreadyRefunded } = await admin
      .from("wallet_ledger")
      .select("id")
      .eq("workspace_id", payout.workspace_id)
      .eq("description", refundDescription)
      .maybeSingle();
    if (alreadyRefunded) return;

    const { error } = await admin.from("wallet_ledger").insert({
      workspace_id: payout.workspace_id,
      type: "adjustment",
      amount: Math.abs(Number(debit.amount || payout.amount)),
      currency: "BRL",
      status: "available",
      available_at: new Date().toISOString(),
      description: refundDescription,
    });
    if (error) throw error;
    console.log(`[${FN}] débito estornado para o saque ${payout.id}`);
  } catch (e) {
    console.error(`[${FN}] falha ao estornar débito ${payout.id}:`, (e as Error).message);
  }
}

async function notifyCreator(
  admin: Admin,
  workspaceId: string,
  eventType: string,
  data: Record<string, unknown>,
) {
  try {
    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/notify-creator`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ event_type: eventType, workspace_id: workspaceId, data }),
    });
  } catch (e) {
    console.error(`[${FN}] notifyCreator (non-fatal):`, (e as Error).message);
  }
}
