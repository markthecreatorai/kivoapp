// =============================================================
// Edge Function: send-lead-email
// Envia e-mail de boas-vindas para leads via Resend API
// e atualiza o status do lead no banco de dados.
// =============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { assertVerifiedFromDomain, maskEmailAddress, resolveDefaultFrom } from "../_shared/email-system/sender.ts";

// ── CORS ─────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

// ── Helpers ──────────────────────────────────────────────────
function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateInput(body: Record<string, unknown>): string | null {
  const { email, workspaceId } = body;
  if (!email || typeof email !== "string" || !EMAIL_REGEX.test(email)) {
    return "Campo 'email' é obrigatório e deve ser um e-mail válido.";
  }
  if (!workspaceId || typeof workspaceId !== "string") {
    return "Campo 'workspaceId' é obrigatório.";
  }
  return null;
}

// ── Template HTML ────────────────────────────────────────────
function buildEmailHtml(name?: string): string {
  const greeting = name ? `Olá, ${name}!` : "Olá!";
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bem-vindo</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:'Segoe UI',Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#7c3aed,#6d28d9);padding:32px 32px 24px;text-align:center;">
              <h1 style="margin:0;font-size:26px;color:#ffffff;font-weight:700;">${greeting} 👋</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#374151;">
                Obrigado por se inscrever! Você agora faz parte da nossa comunidade.
              </p>
              <p style="margin:0 0 24px;font-size:16px;line-height:1.7;color:#374151;">
                Em breve você receberá conteúdos exclusivos diretamente no seu e-mail.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td style="background-color:#7c3aed;border-radius:8px;">
                    <a href="https://kivohub.com.br" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">
                      Conhecer a plataforma
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:13px;color:#9ca3af;text-align:center;line-height:1.5;">
                Você recebeu este e-mail porque se inscreveu em nossa lista.<br/>
                Se não reconhece esta inscrição, pode ignorar este e-mail com segurança.
              </p>
              <p style="margin:12px 0 0;font-size:12px;color:#d1d5db;text-align:center;">
                © ${new Date().getFullYear()} Kivo · Todos os direitos reservados
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Main Handler ─────────────────────────────────────────────
Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Aceitar apenas POST
  if (req.method !== "POST") {
    return jsonResponse(
      { success: false, message: "Método não permitido. Use POST." },
      405,
    );
  }

  try {
    // ── 1. Parse body ──────────────────────────────────────
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse(
        { success: false, message: "Body inválido. Envie um JSON válido." },
        400,
      );
    }

    // ── 2. Validação ───────────────────────────────────────
    const validationError = validateInput(body);
    if (validationError) {
      return jsonResponse({ success: false, message: validationError }, 400);
    }

    const email = (body.email as string).trim().toLowerCase();
    const name = body.name ? String(body.name).trim() : undefined;
    const workspaceId = body.workspaceId as string;
    const leadId = body.leadId ? String(body.leadId) : undefined;

    // ── 3. Verificar secrets ───────────────────────────────
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.error("[send-lead-email] RESEND_API_KEY não configurada");
      return jsonResponse(
        { success: false, message: "Serviço de e-mail não configurado no servidor." },
        500,
      );
    }

    const EMAIL_FROM = resolveDefaultFrom({
      EMAIL_FROM_DEFAULT: Deno.env.get("EMAIL_FROM_DEFAULT"),
      EMAIL_FROM_AUTH: Deno.env.get("EMAIL_FROM_AUTH"),
      EMAIL_FROM_NOTIFY: Deno.env.get("EMAIL_FROM_NOTIFY"),
      EMAIL_FROM: Deno.env.get("EMAIL_FROM"),
    });
    try {
      assertVerifiedFromDomain(EMAIL_FROM);
    } catch (error: any) {
      console.error("[send-lead-email]", JSON.stringify({
        provider: "resend",
        template: "lead_welcome",
        from: EMAIL_FROM,
        to: maskEmailAddress(email),
        status: "failed",
        error_code: error?.code || "EMAIL_FROM_DOMAIN_UNVERIFIED",
        error_message: error?.message || "Domínio do remetente não verificado",
      }));
      return jsonResponse(
        { success: false, code: error?.code || "EMAIL_FROM_DOMAIN_UNVERIFIED", message: "Domínio do remetente não verificado." },
        error?.status || 422,
      );
    }

    // ── 4. Enviar e-mail via Resend ────────────────────────
    console.log("[send-lead-email]", JSON.stringify({ provider: "resend", template: "lead_welcome", from: EMAIL_FROM, to: maskEmailAddress(email), status: "queued" }));

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [email],
        subject: "Bem-vindo! Obrigado por se inscrever 🎉",
        html: buildEmailHtml(name),
      }),
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      console.error("[send-lead-email]", JSON.stringify({
        provider: "resend",
        template: "lead_welcome",
        from: EMAIL_FROM,
        to: maskEmailAddress(email),
        status: "failed",
        error_code: `HTTP_${resendRes.status}`,
        error_message: JSON.stringify(resendData),
      }));
      console.error(
        `[send-lead-email] Resend retornou ${resendRes.status}:`,
        JSON.stringify(resendData),
      );
      return jsonResponse(
        {
          success: false,
          message: "Falha ao enviar e-mail. Tente novamente mais tarde.",
          details: resendData,
        },
        502,
      );
    }

    console.log("[send-lead-email]", JSON.stringify({
      provider: "resend",
      template: "lead_welcome",
      from: EMAIL_FROM,
      to: maskEmailAddress(email),
      status: "sent",
      error_code: null,
      error_message: null,
      message_id: resendData.id,
    }));

    // ── 5. Atualizar lead no banco ─────────────────────────
    if (leadId) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { error: updateError } = await supabase
          .from("leads")
          .update({
            status: "CONTACTED",
            updated_at: new Date().toISOString(),
          })
          .eq("id", leadId)
          .eq("workspace_id", workspaceId);

        if (updateError) {
          console.warn(
            `[send-lead-email] Falha ao atualizar lead ${leadId}:`,
            updateError.message,
          );
        } else {
          console.log(
            `[send-lead-email] Lead ${leadId} atualizado para CONTACTED`,
          );
        }
      } catch (dbErr) {
        // Não falhar o request por erro de banco — o e-mail já foi enviado
        console.error("[send-lead-email] Erro ao atualizar lead:", dbErr);
      }
    }

    // ── 6. Resposta de sucesso ─────────────────────────────
    return jsonResponse({
      success: true,
      message: "E-mail enviado com sucesso",
      messageId: resendData.id,
    });
  } catch (error) {
    console.error("[send-lead-email] Erro inesperado:", error);
    return jsonResponse(
      { success: false, message: "Erro interno ao processar envio de e-mail." },
      500,
    );
  }
});
