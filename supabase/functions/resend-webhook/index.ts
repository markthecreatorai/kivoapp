import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, resend-signature, x-webhook-secret",
};

function mapResendEventToStatus(eventType: string): "sent" | "delivered" | "bounced" | "failed" | null {
  const t = (eventType || "").toLowerCase();
  if (t.includes("delivered")) return "delivered";
  if (t.includes("bounced") || t.includes("bounce")) return "bounced";
  if (t.includes("failed")) return "failed";
  if (t.includes("sent")) return "sent";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const configuredSecret = Deno.env.get("RESEND_WEBHOOK_SECRET");
    if (configuredSecret) {
      const receivedSecret = req.headers.get("x-webhook-secret");
      if (receivedSecret !== configuredSecret) {
        return new Response(JSON.stringify({ ok: false, error: "unauthorized webhook" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = await req.json();
    const eventType = body?.type as string;
    const messageId = body?.data?.email_id as string | undefined;

    const status = mapResendEventToStatus(eventType);
    if (!status || !messageId) {
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    await supabase
      .from("transactional_email_logs")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("provider", "resend")
      .eq("provider_message_id", messageId);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
