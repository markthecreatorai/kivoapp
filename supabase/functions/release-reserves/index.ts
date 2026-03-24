import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // Find held reserves that are past their release date
    const { data: dueReserves, error } = await supabase
      .from("reserve_entries")
      .select("id, workspace_id, amount, order_id")
      .eq("status", "held")
      .lte("release_at", new Date().toISOString())
      .limit(500);

    if (error) throw error;

    let released = 0;
    for (const reserve of (dueReserves || [])) {
      // Check if the related order doesn't have an active chargeback
      const { data: activeChargeback } = await supabase
        .from("chargeback_cases")
        .select("id")
        .eq("order_id", reserve.order_id)
        .in("status", ["new", "evidence_pending", "submitted"])
        .maybeSingle();

      if (activeChargeback) {
        // Don't release — extend by 30 days
        await supabase.from("reserve_entries").update({
          release_at: new Date(Date.now() + 30 * 86400000).toISOString(),
        }).eq("id", reserve.id);
        continue;
      }

      await supabase.from("reserve_entries").update({
        status: "released",
        released_at: new Date().toISOString(),
      }).eq("id", reserve.id);
      released++;
    }

    const summary = {
      event: "release_reserves_complete",
      duration_ms: Date.now() - startedAt,
      total_due: dueReserves?.length || 0,
      released,
      held_due_to_chargeback: (dueReserves?.length || 0) - released,
    };

    console.log(JSON.stringify(summary));

    return new Response(JSON.stringify({ ok: true, ...summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Release reserves error:", err);
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
