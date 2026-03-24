import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const specificEventId = body?.event_id;

    let query = supabase
      .from("webhook_events")
      .select("id, external_event_id, payload, provider, event_type, attempts")
      .in("status", ["FAILED", "RETRY"]);

    if (specificEventId) {
      // Manual reprocess of a specific event (including dead_letter)
      query = supabase
        .from("webhook_events")
        .select("id, external_event_id, payload, provider, event_type, attempts")
        .eq("id", specificEventId)
        .in("status", ["FAILED", "RETRY", "DEAD_LETTER"]);
    } else {
      query = query.lte("next_retry_at", new Date().toISOString());
    }

    const { data: events, error } = await query.order("created_at").limit(20);
    if (error) throw error;

    if (!events || events.length === 0) {
      return new Response(JSON.stringify({ processed: 0, message: "No events to retry" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    let failed = 0;

    for (const event of events) {
      try {
        // Re-invoke the webhook handler internally
        const webhookUrl = `${supabaseUrl}/functions/v1/webhook-pagarme`;
        const res = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify(event.payload),
        });

        if (res.ok) {
          processed++;
        } else {
          failed++;
          console.error(`Retry failed for event ${event.id}: ${res.status}`);
        }
      } catch (retryErr) {
        failed++;
        console.error(`Retry error for event ${event.id}:`, retryErr);
      }
    }

    return new Response(JSON.stringify({ processed, failed, total: events.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Retry webhooks error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
