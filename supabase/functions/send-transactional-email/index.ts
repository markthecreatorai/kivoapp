import { baseEmailLayout } from "../_shared/email-system/layout.ts";
import { ctaPrimary, ctaSecondary, emailText, emailTitle, securityAlertBox } from "../_shared/email-system/components.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type TemplateKey =
  | "welcome_account_created"
  | "subscription_activated"
  | "payment_failed"
  | "support_received";

type TemplatePayloadMap = {
  welcome_account_created: {
    name?: string;
    dashboard_url?: string;
  };
  subscription_activated: {
    name?: string;
    plan_name?: string;
    next_billing_date?: string;
    billing_url?: string;
  };
  payment_failed: {
    name?: string;
    amount?: string;
    reason?: string;
    retry_url?: string;
  };
  support_received: {
    name?: string;
    ticket_id?: string;
    expected_reply?: string;
    support_url?: string;
  };
};

type SendTransactionalEmailRequest<K extends TemplateKey = TemplateKey> = {
  template_key: K;
  recipient: string;
  payload: TemplatePayloadMap[K];
};

function renderTemplate<K extends TemplateKey>(templateKey: K, payload: TemplatePayloadMap[K]) {
  switch (templateKey) {
    case "welcome_account_created": {
      const p = payload as TemplatePayloadMap["welcome_account_created"];
      return {
        subject: "Sua conta Kivo foi criada 🎉",
        html: baseEmailLayout({
          preheader: "Sua conta está pronta. Vamos começar.",
          bodyHtml: [
            emailTitle("Conta criada com sucesso"),
            emailText(`Olá${p.name ? `, ${p.name}` : ""}! Sua conta na Kivo está pronta para uso.`),
            ctaPrimary("Acessar painel", p.dashboard_url || "https://www.kivohub.com.br/dashboard"),
            emailText("Se precisar de ajuda, nosso suporte está por perto."),
          ].join("\n"),
        }),
      };
    }

    case "subscription_activated": {
      const p = payload as TemplatePayloadMap["subscription_activated"];
      return {
        subject: "Assinatura ativada com sucesso ✅",
        html: baseEmailLayout({
          preheader: "Seu plano já está ativo na Kivo.",
          bodyHtml: [
            emailTitle("Assinatura ativada"),
            emailText(`Tudo certo${p.name ? `, ${p.name}` : ""}. Seu plano ${p.plan_name || "Kivo"} está ativo.`),
            p.next_billing_date ? emailText(`Próxima cobrança: ${p.next_billing_date}`) : "",
            ctaPrimary("Gerenciar assinatura", p.billing_url || "https://www.kivohub.com.br/settings/billing"),
          ].join("\n"),
        }),
      };
    }

    case "payment_failed": {
      const p = payload as TemplatePayloadMap["payment_failed"];
      return {
        subject: "Falha no pagamento da sua assinatura",
        html: baseEmailLayout({
          preheader: "Não conseguimos processar seu pagamento.",
          bodyHtml: [
            emailTitle("Pagamento não processado"),
            emailText(`Olá${p.name ? `, ${p.name}` : ""}. Não conseguimos processar seu pagamento${p.amount ? ` de ${p.amount}` : ""}.`),
            p.reason ? securityAlertBox("Motivo informado", p.reason) : "",
            ctaPrimary("Atualizar pagamento", p.retry_url || "https://www.kivohub.com.br/settings/billing"),
            ctaSecondary("Falar com suporte", "https://www.kivohub.com.br/support"),
          ].join("\n"),
        }),
      };
    }

    case "support_received": {
      const p = payload as TemplatePayloadMap["support_received"];
      return {
        subject: "Recebemos sua solicitação de suporte",
        html: baseEmailLayout({
          preheader: "Seu ticket foi recebido pela Kivo.",
          bodyHtml: [
            emailTitle("Suporte recebido"),
            emailText(`Obrigado pelo contato${p.name ? `, ${p.name}` : ""}. Nossa equipe já recebeu sua solicitação.`),
            p.ticket_id ? emailText(`ID do ticket: ${p.ticket_id}`) : "",
            p.expected_reply ? emailText(`Previsão de resposta: ${p.expected_reply}`) : "",
            ctaPrimary("Acompanhar solicitação", p.support_url || "https://www.kivohub.com.br/support"),
          ].join("\n"),
        }),
      };
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { template_key, recipient, payload } = await req.json() as SendTransactionalEmailRequest;

    if (!template_key || !recipient || !payload) {
      return new Response(JSON.stringify({ error: "template_key, recipient, payload são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const EMAIL_FROM = Deno.env.get("EMAIL_FROM") || "Kivo <noreply@kivohub.com.br>";

    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY não configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { subject, html } = renderTemplate(template_key, payload as any);

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [recipient],
        subject,
        html,
      }),
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      return new Response(JSON.stringify({ ok: false, error: resendData }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, provider: "resend", message_id: resendData.id }), {
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
