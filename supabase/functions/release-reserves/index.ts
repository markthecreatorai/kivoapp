// release-reserves — libera reservas de segurança vencidas (public.security_reserves).
//
// Esta função NÃO faz mais update+insert sequencial. O padrão anterior
// (marcar 'released' e depois inserir o crédito no wallet_ledger) não era
// atômico: se o insert falhasse, a reserva ficava liberada SEM crédito e o
// produtor perdia o valor. Toda a decisão contábil vive agora na RPC
// public.release_security_reserve(uuid), que trava a linha FOR UPDATE, valida
// vencimento/chargeback/refund, credita de forma idempotente (índice único por
// security_reserve_id) e transiciona o status no MESMO commit.
//
// Importante: quando a reserva não tem débito de segregação na origem
// (ledger_debit_id NULL), a RPC devolve NEEDS_PRODUCT_DECISION e mantém a
// reserva retida — creditar nesse caso duplicaria saldo, porque o settlement
// atual já credita o líquido integral ao produtor.
//
// `reserve_entries` (modelo legado) continua sendo de release-holds.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireCronSecret } from "../_shared/cron-auth.ts";
import { startCronRun, readJsonBody } from "../_shared/cron-run.ts";

const FN = "release-reserves";
const BATCH = 500;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Comparação timing-safe + fail-closed quando CRON_SECRET não está configurado.
  const unauthorized = requireCronSecret(req, FN);
  if (unauthorized) return unauthorized;

  const body = await readJsonBody(req);
  const run = await startCronRun(req, body);
  const startedAt = Date.now();

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const nowIso = new Date().toISOString();
    const counts: Record<string, number> = {};
    let releasedAmount = 0;
    const notified: Array<{ workspace_id: string; amount: number }> = [];

    const { data: dueReserves, error: dueErr } = await supabase
      .from("security_reserves")
      .select("id")
      .eq("status", "held")
      .lte("release_at", nowIso)
      .limit(BATCH);
    if (dueErr) throw dueErr;

    for (const reserve of dueReserves || []) {
      const { data, error } = await supabase.rpc("release_security_reserve", {
        p_reserve_id: reserve.id,
      });
      if (error) {
        counts.rpc_error = (counts.rpc_error || 0) + 1;
        console.error(`[${FN}] RPC falhou para reserva ${reserve.id}:`, error.message);
        continue;
      }

      const result = (data || {}) as Record<string, unknown>;
      const outcome = String(result.outcome || "UNKNOWN");
      counts[outcome.toLowerCase()] = (counts[outcome.toLowerCase()] || 0) + 1;

      if (outcome === "RELEASED" && !result.credit_replayed) {
        const amount = Number(result.amount_cents || 0);
        releasedAmount += amount;
        notified.push({ workspace_id: String(result.workspace_id), amount });
      }
      if (outcome === "NEEDS_PRODUCT_DECISION") {
        console.warn(
          `[${FN}] reserva ${reserve.id} mantida retida (sem prova estruturada de segregação): ${result.reason}`,
        );
      }
      if (outcome === "ORIGIN_NOT_LIQUID") {
        // O débito de origem ainda não tem data econômica: liberar aqui
        // anteciparia liquidez. Segue retida para o próximo ciclo.
        console.warn(`[${FN}] reserva ${reserve.id} retida (origem sem liquidez): ${result.reason}`);
      }

    }

    // Notificações são efeito colateral externo: ficam FORA da transação
    // contábil e nunca podem reverter/impedir o crédito já commitado.
    for (const n of notified) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/notify-creator`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${serviceKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            event_type: "reserve_released",
            workspace_id: n.workspace_id,
            data: { amount: n.amount },
          }),
        });
      } catch (e) {
        console.error(`[${FN}] notify error (non-fatal):`, e);
      }
    }

    const summary = {
      event: "release_reserves_complete",
      duration_ms: Date.now() - startedAt,
      reserves_due: dueReserves?.length || 0,
      reserves_released: counts.released || 0,
      reserves_released_amount_cents: releasedAmount,
      reserves_held_by_chargeback: counts.held_chargeback || 0,
      reserves_forfeited: counts.forfeited || 0,
      reserves_needs_product_decision: counts.needs_product_decision || 0,
      reserves_already_processed: counts.already_processed || 0,
      rpc_errors: counts.rpc_error || 0,
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
