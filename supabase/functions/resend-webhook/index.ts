import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, resend-signature",
};

function mapResendEventToStatus(eventType: string): "sent" | "delivered" | "bounced" | "failed" | null {
  const t = (eventType || "").toLowerCase();
  if (t === "email.sent") return "sent";
  if (t === "email.delivered") return "delivered";
  if (t === "email.bounced") return "bounced";
  if (t === "email.failed") return "failed";
  return null;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyResendSignature(rawBody: string, signatureHeader: string | null, secret: string): Promise<boolean> {
  if (!signatureHeader) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expectedHex = toHex(new Uint8Array(digest));

  // Accept both formats: "sha256=<hex>" or "<hex>"
  const candidates = signatureHeader
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.startsWith("sha256=") ? s.slice(7) : s)
    .map((s) => s.toLowerCase());

  return candidates.some((candidate) => timingSafeEqual(candidate, expectedHex));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const rawBody = await req.text();
    const signatureHeader = req.headers.get("resend-signature");
    const secret = Deno.env.get("RESEND_WEBHOOK_SECRET");

    if (!secret) {
      return new Response(JSON.stringify({ ok: false, error: "RESEND_WEBHOOK_SECRET missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isValid = await verifyResendSignature(rawBody, signatureHeader, secret);
    if (!isValid) {
      return new Response(JSON.stringify({ ok: false, error: "invalid webhook signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = JSON.parse(rawBody);
    const eventType = body?.type as string;
    const messageId = body?.data?.email_id as string | undefined;
    const eventId = (body?.data?.id || body?.id || `${eventType}:${messageId}:${body?.created_at || "unknown"}`) as string;

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

    // Basic idempotency: only process first time each event_id is seen.
    const { data: insertedEvent, error: eventError } = await supabase
      .from("transactional_email_webhook_events")
      .insert({
        provider: "resend",
        event_id: eventId,
        event_type: eventType,
        provider_message_id: messageId,
        payload: body,
      })
      .select("id")
      .maybeSingle();

    if (eventError) {
      const duplicate = String(eventError.message || "").toLowerCase().includes("duplicate") ||
        String(eventError.details || "").toLowerCase().includes("already exists");
      if (duplicate) {
        return new Response(JSON.stringify({ ok: true, duplicate: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw eventError;
    }

    await supabase
      .from("transactional_email_logs")
      .update({ status, last_event_id: eventId, updated_at: new Date().toISOString() })
      .eq("provider", "resend")
      .eq("provider_message_id", messageId);

    return new Response(JSON.stringify({ ok: true, event_log_id: insertedEvent?.id || null }), {
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
