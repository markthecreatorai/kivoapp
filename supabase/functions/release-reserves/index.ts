import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
// Auditoria de execução (public.cron_runs): sem isso o cron_runs_sweep marca TIMEOUT.
import { startCronRun } from "../_shared/cron-run.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth: require x-cron-secret
  const cronSecret = Deno.env.get("CRON_SECRET");
  const providedSecret = req.headers.get("x-cron-secret");
  if (!cronSecret || providedSecret !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const startedAt = Date.now();
  const cronRun = await startCronRun(req);
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    let releasedLegacy = 0;
    let releasedNew = 0;
    let heldDueToChargeback = 0;

    // ─── Legacy: reserve_entries ───
    const { data: dueReserves, error } = await supabase
      .from("reserve_entries")
      .select("id, workspace_id, amount, order_id")
      .eq("status", "held")
      .lte("release_at", new Date().toISOString())
      .limit(500);

    if (error) throw error;

    for (const reserve of (dueReserves || [])) {
      const { data: activeChargeback } = await supabase
        .from("chargeback_cases")
        .select("id")
        .eq("order_id", reserve.order_id)
        .in("status", ["new", "evidence_pending", "submitted"])
        .maybeSingle();

      if (activeChargeback) {
        await supabase.from("reserve_entries").update({
          release_at: new Date(Date.now() + 30 * 86400000).toISOString(),
        }).eq("id", reserve.id);
        heldDueToChargeback++;
        continue;
      }

      await supabase.from("reserve_entries").update({
        status: "released",
        released_at: new Date().toISOString(),
      }).eq("id", reserve.id);

      try {
        await fetch(`${supabaseUrl}/functions/v1/notify-creator`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${serviceKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            event_type: "reserve_released",
            workspace_id: reserve.workspace_id,
            data: { amount: reserve.amount },
          }),
        });
      } catch (e) { console.error("Notify error (non-fatal):", e); }

      releasedLegacy++;
    }

    // ─── New model: security_reserves ───
    const { data: dueSecReserves, error: secError } = await supabase
      .from("security_reserves")
      .select("id, workspace_id, amount, order_id")
      .eq("status", "held")
      .lte("release_at", new Date().toISOString())
      .limit(500);

    if (secError) throw secError;

    for (const reserve of (dueSecReserves || [])) {
      const { data: activeChargeback } = await supabase
        .from("chargeback_cases")
        .select("id")
        .eq("order_id", reserve.order_id)
        .in("status", ["new", "evidence_pending", "submitted"])
        .maybeSingle();

      if (activeChargeback) {
        await supabase.from("security_reserves").update({
          release_at: new Date(Date.now() + 30 * 86400000).toISOString(),
        }).eq("id", reserve.id);
        heldDueToChargeback++;
        continue;
      }

      await supabase.from("security_reserves").update({
        status: "released",
        released_at: new Date().toISOString(),
      }).eq("id", reserve.id);

      try {
        await fetch(`${supabaseUrl}/functions/v1/notify-creator`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${serviceKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            event_type: "reserve_released",
            workspace_id: reserve.workspace_id,
            data: { amount: reserve.amount },
          }),
        });
      } catch (e) { console.error("Notify error (non-fatal):", e); }

      releasedNew++;
    }

    const summary = {
      event: "release_reserves_complete",
      duration_ms: Date.now() - startedAt,
      total_due_legacy: dueReserves?.length || 0,
      total_due_new: dueSecReserves?.length || 0,
      released_legacy: releasedLegacy,
      released_new: releasedNew,
      held_due_to_chargeback: heldDueToChargeback,
    };

    console.log(JSON.stringify(summary));

    return new Response(JSON.stringify({ ok: true, ...summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Release reserves error:", err);
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
