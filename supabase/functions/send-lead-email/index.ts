import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: _corsHeaders });
  }

  try {
    const { name, email, workspaceId, leadId } = await req.json();

    // Validate input
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return new Response(
        JSON.stringify({ error: "Email inválido" }),
        { status: 400, headers: { ..._corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!workspaceId) {
      return new Response(
        JSON.stringify({ error: "workspaceId é obrigatório" }),
        { status: 400, headers: { ..._corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Serviço de email não configurado" }),
        { status: 500, headers: { ..._corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const EMAIL_FROM = Deno.env.get("EMAIL_FROM") || "Equipe <noreply@kivohub.com.br>";

    // Send email via Resend
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
        html: `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #1a1a2e;">
            <h1 style="font-size: 24px; margin-bottom: 16px;">Olá${name ? `, ${name}` : ""}! 👋</h1>
            <p style="font-size: 16px; line-height: 1.6; color: #444;">
              Obrigado por se inscrever! Você agora faz parte da nossa comunidade.
            </p>
            <p style="font-size: 16px; line-height: 1.6; color: #444;">
              Em breve você receberá conteúdos exclusivos diretamente no seu email.
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
            <p style="font-size: 13px; color: #999;">
              Você recebeu este email porque se inscreveu em nossa lista. Se não reconhece esta inscrição, pode ignorar este email.
            </p>
          </div>
        `,
      }),
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      console.error("Resend API error:", JSON.stringify(resendData));
      return new Response(
        JSON.stringify({ error: "Falha ao enviar email", details: resendData }),
        { status: 502, headers: { ..._corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update lead in database if leadId provided
    if (leadId) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      await supabase
        .from("leads")
        .update({
          status: "CONTACTED",
          updated_at: new Date().toISOString(),
        })
        .eq("id", leadId);
    }

    return new Response(
      JSON.stringify({ success: true, messageId: resendData.id }),
      { status: 200, headers: { ..._corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("send-lead-email error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno ao processar envio de email" }),
      { status: 500, headers: { ..._corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
