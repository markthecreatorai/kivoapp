import { corsHeaders } from "../_shared/cors.ts";
import { requireCronSecret } from "../_shared/cron-auth.ts";
import { startCronRun, readJsonBody } from "../_shared/cron-run.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";


// Standardized error response
function errorResponse(code: string, message: string, status: number, retryable = false, contextId?: string) {
  return new Response(
    JSON.stringify({ error: { code, message, retryable, context_id: contextId } }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const cronDenied = requireCronSecret(req, "abandoned-cart-recovery");
  if (cronDenied) return cronDenied;

  const reqBody = await readJsonBody(req);
  const cronRun = await startCronRun(req, reqBody);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Find sessions with checkout_started but no payment_succeeded via analytics_events
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    // Also check checkout_sessions table for traditional recovery
    const { data: abandonedSessions, error: fetchErr } = await supabase
      .from("checkout_sessions")
      .select("id, email, workspace_id, created_at, total_amount")
      .eq("status", "OPEN")
      .not("email", "is", null)
      .is("abandoned_at", null)
      .lt("created_at", thirtyMinAgo)
      .limit(100);

    if (fetchErr) {
      console.error("Fetch error:", JSON.stringify({ code: fetchErr.code, message: fetchErr.message }));
      await cronRun.finish("FAILED", {}, fetchErr.message);
      return errorResponse("FETCH_ERROR", fetchErr.message, 500, true);
    }

    if (!abandonedSessions || abandonedSessions.length === 0) {
      await cronRun.finish("SUCCESS", { processed: 0, skipped: 0 });
      return new Response(JSON.stringify({ processed: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let processed = 0;
    let skipped = 0;

    for (const session of abandonedSessions) {
      // IDEMPOTÊNCIA: só uma execução consegue marcar a sessão como abandonada
      // (filtro status=OPEN + abandoned_at nulo). As demais pulam.
      const { data: claimedSessions, error: updateErr } = await supabase
        .from("checkout_sessions")
        .update({ status: "ABANDONED", abandoned_at: new Date().toISOString() })
        .eq("id", session.id)
        .eq("status", "OPEN")
        .is("abandoned_at", null)
        .select("id");

      if (updateErr) {
        console.error("Update failed:", JSON.stringify({ session_id: session.id, error: updateErr.message }));
        continue;
      }

      if (!claimedSessions || claimedSessions.length === 0) {
        skipped++;
        continue;
      }

      // Schedule 3 recovery emails with idempotency
      const now = Date.now();
      const emails = [
        { email_number: 1, scheduled_for: new Date(now + 1 * 60 * 60 * 1000).toISOString() },
        { email_number: 2, scheduled_for: new Date(now + 24 * 60 * 60 * 1000).toISOString() },
        { email_number: 3, scheduled_for: new Date(now + 48 * 60 * 60 * 1000).toISOString() },
      ];

      const rows = emails.map((e) => ({
        checkout_session_id: session.id,
        workspace_id: session.workspace_id,
        email_number: e.email_number,
        scheduled_for: e.scheduled_for,
      }));

      const { error: insertErr } = await supabase
        .from("recovery_emails")
        .upsert(rows, { onConflict: "checkout_session_id,email_number" });

      if (insertErr) {
        console.error("Email schedule failed:", JSON.stringify({ session_id: session.id, error: insertErr.message }));
        continue;
      }

      // Track the abandonment event
      await supabase.from("analytics_events").insert({
        event_type: "cart_abandoned",
        workspace_id: session.workspace_id,
        visitor_id: null,
        metadata: { checkout_session_id: session.id, email: session.email?.replace(/(.{2}).*(@.*)/, "$1***$2") },
        page_path: "/checkout",
      });

      processed++;
    }

    console.log(`Processed ${processed} abandoned carts (skipped ${skipped})`);
    await cronRun.finish("SUCCESS", { processed, skipped });
    return new Response(JSON.stringify({ processed, skipped }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("Unexpected error:", JSON.stringify({ message: err.message, stack: err.stack?.slice(0, 200) }));
    await cronRun.finish("FAILED", {}, err?.message ?? "Internal error");
    return errorResponse("INTERNAL_ERROR", "Internal error", 500, true);
  }
});
