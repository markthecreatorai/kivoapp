// create-payout-request — solicitação de saque do produtor.
// Requer JWT (verify_jwt = true). workspace_id é derivado da associação do usuário,
// nunca confiado como valor livre do body. Saldo é sempre recalculado server-side.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const FN = "create-payout-request";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function sha256(input: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    // ─── 1. Autenticação ───
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await anon.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    const userId = userData?.user?.id;
    if (userErr || !userId) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ─── 2. Input ───
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const bankAccountId = String(body.bank_account_id ?? "");
    const amount = Math.round(Number(body.amount ?? 0)); // centavos
    const clientKey = body.idempotency_key ? String(body.idempotency_key).slice(0, 120) : null;

    if (!UUID_RE.test(bankAccountId)) return json({ error: "bank_account_id inválido" }, 400);
    if (!Number.isFinite(amount) || amount <= 0) return json({ error: "amount inválido" }, 400);

    // ─── 3. Workspace derivado do JWT (OWNER/ADMIN podem sacar) ───
    const { data: memberships, error: memberErr } = await admin
      .from("workspace_members")
      .select("workspace_id, role")
      .eq("user_id", userId);
    if (memberErr) throw memberErr;

    const allowed = (memberships || []).filter((m) => ["OWNER", "ADMIN"].includes(String(m.role)));
    if (allowed.length === 0) return json({ error: "Forbidden" }, 403);

    // ─── 4. Conta bancária precisa pertencer a um workspace do usuário ───
    const { data: bank, error: bankErr } = await admin
      .from("bank_accounts")
      .select("id, workspace_id, is_default, holder_document")
      .eq("id", bankAccountId)
      .maybeSingle();
    if (bankErr) throw bankErr;
    if (!bank) return json({ error: "Conta bancária não encontrada" }, 404);

    const workspaceId = String(bank.workspace_id);
    if (!allowed.some((m) => String(m.workspace_id) === workspaceId)) {
      console.warn(`[${FN}] conta de outro workspace: user=${userId} bank=${bankAccountId}`);
      return json({ error: "Forbidden" }, 403);
    }

    // ─── 5. Config de taxas conforme plano do workspace ───
    const { data: ws, error: wsErr } = await admin
      .from("workspaces")
      .select("plan")
      .eq("id", workspaceId)
      .maybeSingle();
    if (wsErr) throw wsErr;

    const planType = String(ws?.plan ?? "FREE").toLowerCase() === "creator_pro"
      ? "creator_pro"
      : "creator";
    const { data: fee } = await admin
      .from("fee_config")
      .select(
        "withdrawal_fixed_cents, withdrawal_percent, min_withdrawal_cents, auto_approve_limit_cents",
      )
      .eq("plan_type", planType)
      .maybeSingle();

    const withdrawalFixed = Number(fee?.withdrawal_fixed_cents ?? 0);
    const withdrawalPercent = Number(fee?.withdrawal_percent ?? 0);
    const minWithdrawal = Number(fee?.min_withdrawal_cents ?? 0);
    const autoApproveLimit = Number(fee?.auto_approve_limit_cents ?? 0);

    if (amount < minWithdrawal) {
      return json(
        { error: `Saque mínimo de R$ ${(minWithdrawal / 100).toFixed(2)}`, min_cents: minWithdrawal },
        400,
      );
    }

    // ─── 6. Saldo disponível recalculado server-side (mesma regra do get-wallet-balance) ───
    const { data: ledger, error: ledgerErr } = await admin
      .from("wallet_ledger")
      .select("amount, status, type")
      .eq("workspace_id", workspaceId)
      .neq("status", "canceled");
    if (ledgerErr) throw ledgerErr;

    const rows = ledger || [];
    const isDebit = (r: { amount: number; type: string }) =>
      Number(r.amount) < 0 || r.type === "withdrawal";
    const settled = (s: string) => s === "available" || s === "settled";

    const credits = rows
      .filter((r) => !isDebit(r) && settled(String(r.status)))
      .reduce((s, r) => s + Number(r.amount || 0), 0);
    const debits = rows
      .filter((r) => isDebit(r) && settled(String(r.status)))
      .reduce((s, r) => s + Math.abs(Number(r.amount || 0)), 0);
    const availableBalance = credits - debits;

    // Saques ainda em análise/processamento também bloqueiam saldo
    const { data: openReqs, error: openErr } = await admin
      .from("payout_requests")
      .select("amount")
      .eq("workspace_id", workspaceId)
      .in("status", ["pending", "in_review"]);
    if (openErr) throw openErr;
    const lockedByOpen = (openReqs || []).reduce((s, r) => s + Number(r.amount || 0), 0);

    const spendable = availableBalance - lockedByOpen;
    if (amount > spendable) {
      return json(
        {
          error: "Saldo disponível insuficiente",
          available_balance_cents: availableBalance,
          locked_in_review_cents: lockedByOpen,
          spendable_cents: Math.max(spendable, 0),
        },
        400,
      );
    }

    // ─── 7. Taxa e líquido ───
    const feeCents = Math.round(withdrawalFixed + (amount * withdrawalPercent) / 100);
    const netAmount = amount - feeCents;
    if (netAmount <= 0) return json({ error: "Valor menor que a taxa de saque" }, 400);

    // ─── 8. Idempotência (duplo clique) ───
    // Sem chave do cliente: janela de 2 minutos por workspace/conta/valor.
    const window = Math.floor(Date.now() / 120_000);
    const idempotencyKey = clientKey ??
      `auto_${await sha256(`${workspaceId}:${bankAccountId}:${amount}:${window}`)}`;

    const autoApprove = autoApproveLimit > 0 && amount <= autoApproveLimit;
    const status = autoApprove ? "approved" : "pending";

    const { data: created, error: insertErr } = await admin
      .from("payout_requests")
      .insert({
        workspace_id: workspaceId,
        bank_account_id: bankAccountId,
        requested_by: userId,
        amount,
        fee: feeCents,
        net_amount: netAmount,
        status,
        idempotency_key: idempotencyKey,
        review_reason: autoApprove ? null : "Revisão manual (política padrão Kivo)",
        reviewed_at: autoApprove ? new Date().toISOString() : null,
      })
      .select("id, status, amount, fee, net_amount, created_at, idempotency_key")
      .single();

    if (insertErr) {
      // 23505 = unique_violation em idempotency_key → devolve o request já criado
      if ((insertErr as { code?: string }).code === "23505") {
        const { data: existing } = await admin
          .from("payout_requests")
          .select("id, status, amount, fee, net_amount, created_at, idempotency_key")
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();
        console.log(`[${FN}] idempotente: reaproveitando ${existing?.id}`);
        return json({ duplicate: true, payout_request: existing }, 200);
      }
      throw insertErr;
    }

    // ─── 9. Debita o ledger imediatamente quando aprovado ───
    if (autoApprove) {
      const { error: debitErr } = await admin.from("wallet_ledger").insert({
        workspace_id: workspaceId,
        type: "withdrawal",
        amount, // positivo; tipo withdrawal é tratado como débito
        currency: "BRL",
        status: "available",
        available_at: new Date().toISOString(),
        description: `Saque ${created.id}`,
      });
      if (debitErr) {
        console.error(`[${FN}] falha ao debitar ledger, revertendo saque:`, debitErr.message);
        await admin
          .from("payout_requests")
          .update({ status: "failed", failed_reason: "Falha ao debitar carteira" })
          .eq("id", created.id);
        return json({ error: "Não foi possível reservar o saldo do saque" }, 500);
      }
    }

    console.log(
      `[${FN}] saque ${created.id} ws=${workspaceId} amount=${amount} fee=${feeCents} status=${status}`,
    );

    return json({
      payout_request: created,
      auto_approved: autoApprove,
      balance_after_cents: autoApprove ? availableBalance - amount : availableBalance,
    }, 201);
  } catch (err) {
    console.error(`[${FN}] erro:`, (err as Error).message);
    return json({ error: "Erro ao criar solicitação de saque" }, 500);
  }
});
