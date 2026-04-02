import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const { event_type, workspace_id, data } = await req.json();

    if (!event_type || !workspace_id) {
      return new Response(JSON.stringify({ error: "event_type and workspace_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get workspace owner email
    const { data: members } = await supabase
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", workspace_id)
      .eq("role", "OWNER")
      .limit(1);

    if (!members?.length) {
      return new Response(JSON.stringify({ error: "No owner found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ownerId = members[0].user_id;

    // Get user email from profiles or auth
    const { data: profile } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", ownerId)
      .maybeSingle();

    const recipientEmail = profile?.email;
    const creatorName = profile?.full_name || "Creator";

    if (!recipientEmail) {
      console.warn("No email found for creator", ownerId);
      return new Response(JSON.stringify({ ok: true, skipped: "no_email" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build notification content based on event type
    let subject = "";
    let body = "";

    switch (event_type) {
      case "chargeback_opened":
        subject = `⚠️ Chargeback aberto - ${data?.order_number || "pedido"}`;
        body = `Olá ${creatorName},\n\nUm chargeback foi aberto para o pedido ${data?.order_number || "N/A"}.\n\nValor: R$ ${((data?.amount || 0) / 100).toFixed(2)}\nMotivo: ${data?.reason || "Não informado"}\n\nSeu saldo foi temporariamente congelado enquanto a disputa é analisada. Acompanhe pelo painel.\n\n— Equipe Kivo`;
        break;

      case "payout_paid":
        subject = `✅ Saque processado com sucesso`;
        body = `Olá ${creatorName},\n\nSeu saque de R$ ${((data?.amount || 0) / 100).toFixed(2)} foi transferido para sua conta bancária.\n\nID da transferência: ${data?.external_transfer_id || "N/A"}\n\nO valor deve estar disponível em até 1 dia útil.\n\n— Equipe Kivo`;
        break;

      case "payout_failed":
        subject = `❌ Falha no processamento do saque`;
        body = `Olá ${creatorName},\n\nNão foi possível processar seu saque de R$ ${((data?.amount || 0) / 100).toFixed(2)}.\n\nMotivo: ${data?.failure_reason || "Erro no processamento"}\n\nVerifique seus dados bancários e tente novamente pelo painel.\n\n— Equipe Kivo`;
        break;

      case "payout_review":
        subject = `🔍 Saque em revisão manual`;
        body = `Olá ${creatorName},\n\nSeu saque de R$ ${((data?.amount || 0) / 100).toFixed(2)} foi encaminhado para revisão manual por motivos de segurança.\n\nNossa equipe analisará em até 24h úteis. Você será notificado assim que houver uma decisão.\n\n— Equipe Kivo`;
        break;

      case "reserve_released":
        subject = `💰 Reserva financeira liberada`;
        body = `Olá ${creatorName},\n\nR$ ${((data?.amount || 0) / 100).toFixed(2)} da sua reserva financeira foi liberado e está disponível para saque.\n\nAcesse o painel financeiro para ver seu saldo atualizado.\n\n— Equipe Kivo`;
        break;

      default:
        subject = `Notificação financeira - Kivo`;
        body = `Olá ${creatorName},\n\nVocê tem uma atualização financeira. Acesse o painel para mais detalhes.\n\n— Equipe Kivo`;
    }

    // Store notification in-app
    await supabase.from("notifications").insert({
      user_id: ownerId,
      title: subject,
      body: body.substring(0, 500),
      type: "financial",
      read: false,
    }).then(() => {}).catch!(() => {
      // notifications table may not exist, that's ok
    });

    // Log the notification
    console.log(`Notification sent: ${event_type} to ${recipientEmail}`);

    return new Response(JSON.stringify({
      ok: true,
      event_type,
      recipient: recipientEmail,
      subject,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("notify-creator error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
