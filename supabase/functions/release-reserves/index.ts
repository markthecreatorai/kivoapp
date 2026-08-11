// release-reserves — libera as reservas de segurança (modelo novo: security_reserves)
// vencidas, creditando o valor liberado na carteira do produtor.
//
// Escopo desta função: SOMENTE public.security_reserves.
// `reserve_entries` (modelo legado) é liberada por release-holds, que já credita o
// wallet_ledger de forma idempotente. Antes, as duas funções competiam pelas mesmas
// linhas e a primeira a rodar aqui marcava 'released' SEM crédito — o produtor
// perdia o valor retido. Manter um único dono por tabela elimina a corrida.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireCronSecret } from "../_shared/cron-auth.ts";
import { startCronRun, readJsonBody } from "../_shared/cron-run.ts";

const FN = "release-reserves";
const BATCH = 500;
const ACTIVE_CHARGEBACK = ["new", "evidence_pending", "submitted"];

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
    let released = 0;
    let releasedAmount = 0;
    let heldDueToChargeback = 0;
    let creditsSkipped = 0;

    const { data: dueReserves, error: dueErr } = await supabase
      .from("security_reserves")
      .select("id, workspace_id, amount, order_id")
      .eq("status", "held")
      .lte("release_at", nowIso)
      .limit(BATCH);
    if (dueErr) throw dueErr;

    for (const reserve of dueReserves || []) {
      // Chargeback ativo → prorroga a retenção por 30 dias.
      if (reserve.order_id) {
        const { data: chargeback } = await supabase
          .from("chargeback_cases")
          .select("id")
          .eq("order_id", reserve.order_id)
          .in("status", ACTIVE_CHARGEBACK)
          .maybeSingle();

        if (chargeback) {
          await supabase
            .from("security_reserves")
            .update({ release_at: new Date(Date.now() + 30 * 86400000).toISOString() })
            .eq("id", reserve.id);
          heldDueToChargeback++;
          continue;
        }
      }

      // Idempotência: só quem ainda está 'held' é liberado.
      const { data: releasedRows, error: relErr } = await supabase
        .from("security_reserves")
        .update({ status: "released", released_at: nowIso })
        .eq("id", reserve.id)
        .eq("status", "held")
        .select("id");
      if (relErr) {
        console.error(`[${FN}] falha ao liberar reserva ${reserve.id}:`, relErr.message);
        continue;
      }
      if (!releasedRows || releasedRows.length === 0) continue; // outro ciclo já liberou

      const amount = Number(reserve.amount || 0);
      if (amount > 0) {
        // Um único crédito por reserva (chave determinística na description).
        const description = `Liberação de reserva de segurança (security_reserve:${reserve.id})`;
        const { data: existingCredit } = await supabase
          .from("wallet_ledger")
          .select("id")
          .eq("workspace_id", reserve.workspace_id)
          .eq("type", "adjustment")
          .eq("description", description)
          .maybeSingle();

        if (existingCredit) {
          creditsSkipped++;
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
          if (credErr) {
            console.error(`[${FN}] falha ao creditar reserva ${reserve.id}:`, credErr.message);
          }
        }
      }

      try {
        await fetch(`${supabaseUrl}/functions/v1/notify-creator`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${serviceKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            event_type: "reserve_released",
            workspace_id: reserve.workspace_id,
            data: { amount },
          }),
        });
      } catch (e) {
        console.error(`[${FN}] notify error (non-fatal):`, e);
      }

      released++;
      releasedAmount += amount;
    }

    const summary = {
      event: "release_reserves_complete",
      duration_ms: Date.now() - startedAt,
      reserves_due: dueReserves?.length || 0,
      reserves_released: released,
      reserves_released_amount_cents: releasedAmount,
      reserves_held_by_chargeback: heldDueToChargeback,
      reserve_credits_skipped_idempotent: creditsSkipped,
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
