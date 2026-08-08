// release-holds — libera saldos retidos (hold) do produtor.
// Roda a cada hora via pg_cron (public.cron_invoke → X-Kivo-Cron-Secret).
// 1) wallet_ledger pending com available_at <= now() → "available"
// 2) reserve_entries vencidas sem chargeback ativo → "released" + crédito no wallet_ledger
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireCronSecret } from "../_shared/cron-auth.ts";
import { startCronRun, readJsonBody } from "../_shared/cron-run.ts";

const FN = "release-holds";
const BATCH = 500;
const ACTIVE_CHARGEBACK = ["new", "evidence_pending", "submitted"];

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
    let reservesReleased = 0;
    let reservesAmount = 0;
    let reservesHeldByChargeback = 0;
    let reserveCreditsSkipped = 0;

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

    // ─── 2) reserve_entries vencidas ───
    const { data: dueReserves, error: resErr } = await supabase
      .from("reserve_entries")
      .select("id, workspace_id, order_id, amount, reserve_percent")
      .eq("status", "held")
      .lte("release_at", nowIso)
      .limit(BATCH);
    if (resErr) throw resErr;

    for (const reserve of dueReserves || []) {
      // Chargeback ativo → mantém retida por mais 30 dias
      if (reserve.order_id) {
        const { data: chargeback } = await supabase
          .from("chargeback_cases")
          .select("id")
          .eq("order_id", reserve.order_id)
          .in("status", ACTIVE_CHARGEBACK)
          .maybeSingle();
        if (chargeback) {
          await supabase
            .from("reserve_entries")
            .update({ release_at: new Date(Date.now() + 30 * 86400000).toISOString() })
            .eq("id", reserve.id);
          reservesHeldByChargeback++;
          continue;
        }
      }

      const { data: releasedRows, error: relErr } = await supabase
        .from("reserve_entries")
        .update({ status: "released", released_at: nowIso })
        .eq("id", reserve.id)
        .eq("status", "held") // idempotência
        .select("id");
      if (relErr) {
        console.error(`[${FN}] falha ao liberar reserva ${reserve.id}:`, relErr.message);
        continue;
      }
      if (!releasedRows || releasedRows.length === 0) continue; // já liberada por outro ciclo

      const amount = Number(reserve.amount || 0);
      if (amount > 0) {
        const description = `Liberação de reserva de segurança (reserve:${reserve.id})`;
        // Idempotência do crédito: um lançamento por reserva (chave na description)
        const { data: existingCredit } = await supabase
          .from("wallet_ledger")
          .select("id")
          .eq("workspace_id", reserve.workspace_id)
          .eq("type", "adjustment")
          .eq("description", description)
          .maybeSingle();

        if (existingCredit) {
          reserveCreditsSkipped++;
        } else {
          const { error: credErr } = await supabase.from("wallet_ledger").insert({
            workspace_id: reserve.workspace_id,
            order_id: reserve.order_id,
            type: "adjustment", // crédito de liberação de reserva
            amount,
            status: "available",
            available_at: nowIso,
            description,
          });
          if (credErr) console.error(`[${FN}] falha ao creditar reserva ${reserve.id}:`, credErr.message);
        }
      }

      reservesReleased++;
      reservesAmount += amount;
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
      reserve_credits_skipped_idempotent: reserveCreditsSkipped,
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
