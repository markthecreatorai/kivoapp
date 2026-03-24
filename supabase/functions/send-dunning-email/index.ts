import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DUNNING_TEMPLATES: Record<number, { subject: string; heading: string; body: string; severity: string }> = {
  1: {
    subject: "⚠️ Falha na cobrança da sua assinatura",
    heading: "Ops, houve um problema com seu pagamento",
    severity: "friendly",
    body: `<p>Olá!</p>
<p>Tivemos um problema ao processar o pagamento da sua assinatura na comunidade. Isso pode acontecer por diversos motivos (cartão expirado, limite, etc.).</p>
<p><strong>Não se preocupe!</strong> Vamos tentar novamente em breve. Se quiser, atualize seus dados de pagamento para evitar interrupções.</p>`,
  },
  2: {
    subject: "🔔 Ação necessária: atualize seu pagamento",
    heading: "Sua assinatura precisa de atenção",
    severity: "urgent",
    body: `<p>Olá!</p>
<p>Já tentamos processar sua cobrança mais de uma vez sem sucesso. <strong>Sua assinatura pode ser suspensa em breve</strong> se o pagamento não for regularizado.</p>
<p>Por favor, atualize seus dados de pagamento o mais rápido possível para manter seu acesso.</p>`,
  },
  3: {
    subject: "🚨 Último aviso: seu acesso será bloqueado",
    heading: "Acesso prestes a ser bloqueado",
    severity: "final",
    body: `<p>Olá!</p>
<p>Esta é nossa última tentativa de cobrança. <strong>Seu acesso à comunidade será bloqueado</strong> se o pagamento não for regularizado imediatamente.</p>
<p>Atualize seus dados de pagamento agora para não perder seu conteúdo e conexões.</p>`,
  },
};

function wrapHtml(heading: string, bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <tr><td style="background:linear-gradient(135deg,#F9423A,#FF6B35);padding:30px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:22px;">${heading}</h1>
        </td></tr>
        <tr><td style="padding:30px;color:#333;font-size:15px;line-height:1.6;">
          ${bodyContent}
        </td></tr>
        <tr><td style="padding:20px 30px;background:#fafafa;text-align:center;color:#999;font-size:12px;">
          Kivo — Plataforma para creators
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const { subscription_id, dunning_attempt, user_id, community_id } = await req.json();

    if (!subscription_id || !dunning_attempt || !user_id) {
      return new Response(JSON.stringify({ error: "Missing params" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user email
    const { data: authUser } = await supabase.auth.admin.getUserById(user_id);
    const email = authUser?.user?.email;
    if (!email) {
      return new Response(JSON.stringify({ error: "User email not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get community name for context
    let communityName = "a comunidade";
    if (community_id) {
      const { data: comm } = await supabase
        .from("communities")
        .select("name")
        .eq("id", community_id)
        .maybeSingle();
      if (comm) communityName = comm.name;
    }

    const attempt = Math.min(dunning_attempt, 3);
    const template = DUNNING_TEMPLATES[attempt] || DUNNING_TEMPLATES[3];

    const subject = template.subject;
    const html = wrapHtml(template.heading, template.body);
    const idempotencyKey = `dunning_${subscription_id}_attempt_${dunning_attempt}`;

    // Check idempotency
    const { data: existing } = await supabase
      .from("email_logs")
      .select("id")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ ok: true, duplicate: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Log
    const { data: logEntry } = await supabase.from("email_logs").insert({
      workspace_id: null,
      template_key: `dunning_attempt_${attempt}`,
      recipient_email: email,
      subject,
      status: "queued",
      idempotency_key: idempotencyKey,
      metadata: { subscription_id, dunning_attempt, community_name: communityName },
    }).select("id").single();

    // Send
    let sendError: string | null = null;
    if (lovableApiKey) {
      try {
        const resp = await fetch("https://api.lovable.dev/v1/email/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${lovableApiKey}`,
          },
          body: JSON.stringify({ to: email, subject, html, purpose: "transactional" }),
        });
        if (!resp.ok) {
          sendError = `HTTP ${resp.status}: ${await resp.text()}`;
        }
      } catch (err) {
        sendError = err.message;
      }
    }

    if (logEntry) {
      await supabase.from("email_logs").update({
        status: sendError ? "failed" : "sent",
        error_message: sendError,
        sent_at: sendError ? null : new Date().toISOString(),
      }).eq("id", logEntry.id);
    }

    // Also create in-app notification
    if (community_id) {
      // Find member ID
      const { data: memberData } = await supabase
        .from("community_members")
        .select("id")
        .eq("community_id", community_id)
        .eq("user_id", user_id)
        .maybeSingle();

      if (memberData) {
        const notifType = attempt >= 3 ? "SUBSCRIPTION_EXPIRED" : "SUBSCRIPTION_PAST_DUE";
        const notifTitle = attempt >= 3
          ? "🚨 Seu acesso foi bloqueado por inadimplência"
          : `⚠️ Falha no pagamento (tentativa ${attempt}/3)`;

        await supabase.from("community_notifications").insert({
          community_id,
          recipient_id: memberData.id,
          type: notifType as any,
          title: notifTitle,
          body: "Atualize seus dados de pagamento para manter o acesso.",
        });
      }
    }

    // Try Telegram alert to admin (optional)
    try {
      const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");
      const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID");
      if (lovableApiKey && TELEGRAM_API_KEY && TELEGRAM_CHAT_ID) {
        const text = `⚠️ <b>Dunning Alert</b>\n\nTentativa ${attempt}/3 para ${email}\nComunidade: ${communityName}\nSeveridade: ${template.severity}`;
        await fetch("https://connector-gateway.lovable.dev/telegram/sendMessage", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableApiKey}`,
            "X-Connection-Api-Key": TELEGRAM_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: "HTML" }),
        });
      }
    } catch {
      // non-fatal
    }

    return new Response(JSON.stringify({ ok: true, attempt, email: email.slice(0, 3) + "***" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
