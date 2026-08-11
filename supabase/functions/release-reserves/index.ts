// release-reserves — DEPRECADA (QA-4A-V5-RESERVE-MODEL).
//
// Decisão de produto aprovada: public.reserve_entries é a ÚNICA fonte canônica
// de reservas e public.security_reserves foi congelada (novas escritas
// bloqueadas por trigger fail-closed; histórico preservado, nada apagado).
// A liberação canônica passou a ser feita por `release-holds`, que chama
// public.release_reserve_entry (atômica, idempotente, com prova estrutural do
// débito de segregação na origem).
//
// Esta função permanece agendada apenas para não quebrar o cron existente, mas
// NÃO executa mais nenhuma escrita: ela só reporta quantas linhas legadas ainda
// restam em security_reserves, para acompanhamento do caminho de remoção.
//
// CAMINHO DE REMOÇÃO (fora do escopo repo-only desta rodada):
//   1. legado reconciliado (feito pela migration 20260811100000);
//   2. remover esta função do agendamento pg_cron;
//   3. após período de retenção fiscal, DROP TABLE public.security_reserves.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireCronSecret } from "../_shared/cron-auth.ts";
import { startCronRun, readJsonBody } from "../_shared/cron-run.ts";

const FN = "release-reserves";

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
    // Somente leitura: nenhuma reserva é liberada/creditada por esta função.
    const { count, error } = await supabase
      .from("security_reserves")
      .select("id", { count: "exact", head: true })
      .eq("status", "held");
    if (error) throw error;

    const summary = {
      event: "release_reserves_deprecated",
      deprecated: true,
      canonical_job: "release-holds",
      canonical_rpc: "release_reserve_entry",
      duration_ms: Date.now() - startedAt,
      legacy_security_reserves_held: count || 0,
      writes_performed: 0,
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
