import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-kivo-internal-token",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/**
 * INTERNAL ONLY. Não agendada e não chamada pelo app.
 *
 * - Libera comissões vencidas (commissions PENDING -> APPROVED,
 *   referral_commissions pending -> available) sem reembolso/chargeback.
 * - Prepara payouts (payouts + payout_items / referral_payouts) somente a
 *   partir de valores APPROVED/available e respeitando min_payout_amount.
 *
 * A transferência externa NÃO está habilitada aqui: nenhuma comissão é marcada
 * como PAID — isso só pode ocorrer após confirmação do provedor.
 *
 * dry_run = true por padrão: apenas relata o que seria feito.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const internalToken = Deno.env.get("KIVO_INTERNAL_TOKEN");
  if (!internalToken) {
    return json({ error: "Função não configurada" }, 503);
  }
  if (req.headers.get("x-kivo-internal-token") !== internalToken) {
    return json({ error: "Não autorizado" }, 401);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dry_run === false ? false : true; // default: true
    const workspaceId = typeof body?.workspace_id === "string" ? body.workspace_id : null;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (dryRun) {
      const [{ count: dueAff }, { count: dueRef }, { count: approved }] = await Promise.all([
        supabase.from("commissions").select("id", { count: "exact", head: true })
          .eq("status", "PENDING").lte("hold_until", new Date().toISOString()),
        supabase.from("referral_commissions").select("id", { count: "exact", head: true })
          .eq("status", "pending").lte("available_at", new Date().toISOString()),
        supabase.from("commissions").select("id", { count: "exact", head: true })
          .eq("status", "APPROVED"),
      ]);

      return json({
        dry_run: true,
        would_approve_affiliate_commissions: dueAff ?? 0,
        would_release_referral_commissions: dueRef ?? 0,
        approved_commissions_ready_for_payout: approved ?? 0,
        external_transfer_enabled: false,
      });
    }

    const { data: released, error: relErr } = await supabase.rpc("approve_due_commissions");
    if (relErr) {
      console.error("approve_due_commissions falhou:", JSON.stringify(relErr));
      return json({ error: "Falha ao liberar comissões" }, 500);
    }

    const { data: affPayouts, error: affErr } = await supabase.rpc("prepare_affiliate_payouts", {
      p_workspace_id: workspaceId,
    });
    if (affErr) {
      console.error("prepare_affiliate_payouts falhou:", JSON.stringify(affErr));
      return json({ error: "Falha ao preparar payouts de afiliados", released }, 500);
    }

    const { data: refPayouts, error: refErr } = await supabase.rpc("prepare_referral_payouts");
    if (refErr) {
      console.error("prepare_referral_payouts falhou:", JSON.stringify(refErr));
      return json({ error: "Falha ao preparar payouts de indicação", released, affPayouts }, 500);
    }

    return json({
      dry_run: false,
      released,
      affiliate_payouts: affPayouts,
      referral_payouts: refPayouts,
      external_transfer_enabled: false,
    });
  } catch (err) {
    console.error("commissions-release error:", err);
    return json({ error: "Erro interno" }, 500);
  }
});
