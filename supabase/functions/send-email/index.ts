import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Email Templates (PT-BR) ───

interface TemplateData {
  nome?: string;
  produto?: string;
  valor?: string;
  checkout_url?: string;
  member_url?: string;
  suporte_email?: string;
  workspace_name?: string;
}

function wrapHtml(heading: string, bodyContent: string, ctaText?: string, ctaUrl?: string): string {
  const ctaBlock = ctaText && ctaUrl
    ? `<div style="text-align:center;margin:30px 0;">
         <a href="${ctaUrl}" style="display:inline-block;background:#F9423A;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:16px;">
           ${ctaText}
         </a>
       </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <tr><td style="background:linear-gradient(135deg,#F9423A,#FF6B35);padding:30px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:24px;">${heading}</h1>
        </td></tr>
        <tr><td style="padding:30px;color:#333;font-size:15px;line-height:1.6;">
          ${bodyContent}
          ${ctaBlock}
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

const TEMPLATES: Record<string, { subject: (d: TemplateData) => string; render: (d: TemplateData) => string }> = {
  purchase_confirmed: {
    subject: (d) => `Compra confirmada — ${d.produto || "seu produto"}`,
    render: (d) => wrapHtml(
      "Compra Confirmada! ✅",
      `<p>Olá${d.nome ? `, ${d.nome}` : ""}!</p>
       <p>Sua compra de <strong>${d.produto || "produto"}</strong> no valor de <strong>${d.valor || ""}</strong> foi confirmada com sucesso.</p>
       <p>Você já pode acessar seu conteúdo na área de membros.</p>
       ${d.suporte_email ? `<p style="color:#666;font-size:13px;">Dúvidas? Entre em contato: ${d.suporte_email}</p>` : ""}`,
      "Acessar Área de Membros",
      d.member_url || "#"
    ),
  },

  welcome_member: {
    subject: (d) => `Bem-vindo(a) à ${d.workspace_name || "Kivo"}! 🎉`,
    render: (d) => wrapHtml(
      "Bem-vindo(a)! 🎉",
      `<p>Olá${d.nome ? `, ${d.nome}` : ""}!</p>
       <p>Estamos muito felizes em ter você conosco. Seu acesso ao <strong>${d.produto || "conteúdo"}</strong> já está liberado.</p>
       <p>Acesse agora e comece sua jornada:</p>
       ${d.suporte_email ? `<p style="color:#666;font-size:13px;">Precisa de ajuda? ${d.suporte_email}</p>` : ""}`,
      "Começar Agora",
      d.member_url || "#"
    ),
  },

  cart_abandoned_reminder: {
    subject: (d) => `Você esqueceu algo no carrinho 🛒`,
    render: (d) => wrapHtml(
      "Seu carrinho está esperando! 🛒",
      `<p>Olá${d.nome ? `, ${d.nome}` : ""}!</p>
       <p>Notamos que você estava prestes a adquirir <strong>${d.produto || "um produto"}</strong>${d.valor ? ` por <strong>${d.valor}</strong>` : ""}, mas não finalizou sua compra.</p>
       <p>Seu carrinho ainda está reservado. Clique abaixo para completar:</p>
       ${d.suporte_email ? `<p style="color:#666;font-size:13px;">Dúvidas? ${d.suporte_email}</p>` : ""}`,
      "Completar Minha Compra",
      d.checkout_url || "#"
    ),
  },
};

// ─── Main handler ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json();
    const {
      template_key,
      recipient_email,
      workspace_id,
      order_id,
      customer_id,
      checkout_session_id,
      idempotency_key,
      data: templateData,
    } = body as {
      template_key: string;
      recipient_email: string;
      workspace_id: string;
      order_id?: string;
      customer_id?: string;
      checkout_session_id?: string;
      idempotency_key?: string;
      data?: TemplateData;
    };

    if (!template_key || !recipient_email || !workspace_id) {
      return new Response(
        JSON.stringify({ error: "template_key, recipient_email, workspace_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Idempotency check
    if (idempotency_key) {
      const { data: existing } = await supabase
        .from("email_logs")
        .select("id, status")
        .eq("idempotency_key", idempotency_key)
        .maybeSingle();

      if (existing) {
        console.log(`Duplicate email send skipped: ${idempotency_key}`);
        return new Response(
          JSON.stringify({ ok: true, duplicate: true, id: existing.id }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const template = TEMPLATES[template_key];
    if (!template) {
      return new Response(
        JSON.stringify({ error: `Unknown template: ${template_key}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if flow is enabled
    const { data: flowSetting } = await supabase
      .from("email_flow_settings")
      .select("is_enabled, support_email")
      .eq("workspace_id", workspace_id)
      .eq("flow_key", template_key)
      .maybeSingle();

    if (flowSetting && !flowSetting.is_enabled) {
      console.log(`Flow ${template_key} is disabled for workspace ${workspace_id}`);
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: "flow_disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Merge support email from settings
    const mergedData: TemplateData = {
      ...templateData,
      suporte_email: templateData?.suporte_email || flowSetting?.support_email || undefined,
    };

    const subject = template.subject(mergedData);
    const html = template.render(mergedData);

    // Create log entry
    const { data: logEntry, error: logErr } = await supabase
      .from("email_logs")
      .insert({
        workspace_id,
        template_key,
        recipient_email,
        order_id: order_id || null,
        customer_id: customer_id || null,
        checkout_session_id: checkout_session_id || null,
        subject,
        status: "queued",
        idempotency_key: idempotency_key || null,
        metadata: mergedData,
      })
      .select("id")
      .single();

    if (logErr) {
      // If idempotency constraint violation, it's a duplicate
      if (logErr.code === "23505") {
        return new Response(
          JSON.stringify({ ok: true, duplicate: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw logErr;
    }

    // Send via Lovable API
    let providerMessageId: string | null = null;
    let sendError: string | null = null;

    if (lovableApiKey) {
      try {
        const emailResponse = await fetch("https://api.lovable.dev/v1/email/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${lovableApiKey}`,
          },
          body: JSON.stringify({
            to: recipient_email,
            subject,
            html,
            purpose: "transactional",
          }),
        });

        if (!emailResponse.ok) {
          const errText = await emailResponse.text();
          sendError = `HTTP ${emailResponse.status}: ${errText}`;
          console.error(`Email send failed:`, sendError);
        } else {
          const result = await emailResponse.json();
          providerMessageId = result?.id || result?.messageId || null;
        }
      } catch (err) {
        sendError = `Network error: ${(err as Error).message}`;
        console.error("Email send error:", err);
      }
    } else {
      console.log(`[DRY RUN] Would send ${template_key} to ${recipient_email}: ${subject}`);
    }

    // Update log
    const finalStatus = sendError ? "failed" : (lovableApiKey ? "sent" : "queued");
    await supabase.from("email_logs").update({
      status: finalStatus,
      provider_message_id: providerMessageId,
      error_message: sendError,
      sent_at: sendError ? null : new Date().toISOString(),
    }).eq("id", logEntry.id);

    // Retry on transient failure (simple: just log, cron can pick up queued items later)
    if (sendError && !sendError.includes("400") && !sendError.includes("422")) {
      console.log(`Transient failure for ${logEntry.id}, eligible for retry`);
    }

    return new Response(
      JSON.stringify({
        ok: !sendError,
        id: logEntry.id,
        status: finalStatus,
        error: sendError,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-email error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
