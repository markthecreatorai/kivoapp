// release-holds — libera saldos retidos (hold) do produtor.
// Roda a cada hora via pg_cron (public.cron_invoke → X-Kivo-Cron-Secret).
// 1) wallet_ledger pending com available_at <= now() → "available"
// 2) reserve_entries vencidas → RPC public.release_reserve_entry (atômica,
//    idempotente, exige o débito de segregação da origem e herda o estágio
//    econômico dele). Reservas legadas sem débito seguem retidas (fail-closed).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireCronSecret } from "../_shared/cron-auth.ts";
import { startCronRun, readJsonBody } from "../_shared/cron-run.ts";

const FN = "release-holds";
const BATCH = 500;
// Chargeback ativo e prorrogação passaram a ser decididos DENTRO da RPC
// public.release_reserve_entry (mesma transação do crédito).

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const unauthorized = requireCronSecret(req, FN);
  if (unauthorized) return unauthorized;

  const body = await readJsonBody(req);
  const run = await startCronRun(req, body);
  const startedAt = Date.now();

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const nowIso = new Date().toISOString();
    let ledgerReleased = 0;
    let ledgerAmount = 0;
    let reservesHeldByChargeback = 0;


    // ─── 1) wallet_ledger: pending vencido → available ───
    const { data: dueLedger, error: ledgerErr } = await supabase
      .from("wallet_ledger")
      .select("id, workspace_id, amount, order_id")
      .eq("status", "pending")
      .not("available_at", "is", null)
      .lte("available_at", nowIso)
      .limit(BATCH);
    if (ledgerErr) throw ledgerErr;

    if (dueLedger && dueLedger.length > 0) {
      const ids = dueLedger.map((r) => r.id);
      const { data: updated, error: updErr } = await supabase
        .from("wallet_ledger")
        .update({ status: "available" })
        .in("id", ids)
        .eq("status", "pending") // idempotência: só quem ainda está pending
        .select("id, amount");
      if (updErr) throw updErr;
      ledgerReleased = updated?.length || 0;
      ledgerAmount = (updated || []).reduce((s, r) => s + Number(r.amount || 0), 0);
    }

    // ─── 2) reserve_entries vencidas → RPC canônica release_reserve_entry ───
    //
    // QA-4A-V5: a reserva agora É segregada na origem (settle_order_reserve grava
    // um débito 'segregation_debit' no wallet_ledger no mesmo commit). Portanto a
    // liberação PODE creditar: a RPC exige a prova estrutural do débito, herda o
    // estágio econômico dele (nunca antecipa liquidez), valida vencimento de 30
    // dias, chargeback ativo e ownership, e é idempotente por
    // (reserve_entry_id, reserve_role). Sem débito de origem (reserva legada) ela
    // devolve NEEDS_PRODUCT_DECISION e mantém a reserva retida — fail-closed.
    const { data: dueReserves, error: resErr } = await supabase
      .from("reserve_entries")
      .select("id")
      .eq("status", "held")
      .lte("release_at", nowIso)
      .limit(BATCH);
    if (resErr) throw resErr;

    const outcomes: Record<string, number> = {};
    let reservesReleased = 0;
    let reservesAmount = 0;
    let reservesNeedsProductDecision = 0;

    for (const reserve of dueReserves || []) {
      const { data, error } = await supabase.rpc("release_reserve_entry", {
        p_reserve_id: reserve.id,
      });
      if (error) {
        outcomes.rpc_error = (outcomes.rpc_error || 0) + 1;
        console.error(`[${FN}] release_reserve_entry falhou (${reserve.id}):`, error.message);
        continue;
      }
      const result = (data || {}) as Record<string, unknown>;
      const outcome = String(result.outcome || "UNKNOWN").toLowerCase();
      outcomes[outcome] = (outcomes[outcome] || 0) + 1;

      if (outcome === "released" && !result.credit_replayed) {
        reservesReleased++;
        reservesAmount += Number(result.amount_cents || 0);
      }
      if (outcome === "held_chargeback") reservesHeldByChargeback++;
      if (outcome === "needs_product_decision") {
        reservesNeedsProductDecision++;
        console.warn(
          `[${FN}] reserve_entry ${reserve.id} mantida retida: sem débito de segregação na origem (legado)`,
        );
      }
    }

    const summary = {
      event: "release_holds_complete",
      duration_ms: Date.now() - startedAt,
      ledger_due: dueLedger?.length || 0,
      ledger_released: ledgerReleased,
      ledger_released_amount_cents: ledgerAmount,
      reserves_due: dueReserves?.length || 0,
      reserves_released: reservesReleased,
      reserves_released_amount_cents: reservesAmount,
      reserves_held_by_chargeback: reservesHeldByChargeback,
      reserves_needs_product_decision: reservesNeedsProductDecision,
      reserve_outcomes: outcomes,
    };
    console.log(JSON.stringify(summary));
    await run.finish("SUCCESS", summary);

    return new Response(JSON.stringify({ ok: true, ...summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = (err as Error).message;
    console.error(`[${FN}] erro:`, message);
    await run.finish("FAILED", { duration_ms: Date.now() - startedAt }, message);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
