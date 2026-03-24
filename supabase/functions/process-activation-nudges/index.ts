import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const now = new Date();
    const d1 = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const d3 = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // D+1: workspaces created > 24h ago without any product
    const { data: workspaces } = await supabase
      .from("workspaces")
      .select("id, name, created_at")
      .is("activated_at", null)
      .lte("created_at", d1);

    let nudgesSent = 0;

    for (const ws of workspaces || []) {
      // Get owner email
      const { data: members } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", ws.id)
        .eq("role", "OWNER")
        .limit(1);

      if (!members?.length) continue;

      const { data: userData } = await supabase.auth.admin.getUserById(members[0].user_id);
      if (!userData?.user?.email) continue;

      const email = userData.user.email;
      const name = userData.user.user_metadata?.full_name || email.split("@")[0];

      // Check onboarding progress
      const { data: progress } = await supabase
        .from("onboarding_progress")
        .select("step_key, completed_at")
        .eq("workspace_id", ws.id);

      const steps = (progress || []) as Array<{ step_key: string; completed_at: string | null }>;
      const hasProduct = steps.some(s => s.step_key === "product_created" && s.completed_at);
      const hasPublished = steps.some(s => s.step_key === "product_published" && s.completed_at);

      const wsAge = (now.getTime() - new Date(ws.created_at).getTime()) / (24 * 60 * 60 * 1000);

      let templateKey = "";
      let subject = "";

      if (!hasProduct && wsAge >= 1 && wsAge < 3) {
        templateKey = "nudge_no_product";
        subject = `${name}, crie seu primeiro produto na KIVO!`;
      } else if (hasPublished && wsAge >= 3 && wsAge < 7) {
        // Check if has any checkout
        const { count } = await supabase
          .from("checkout_sessions")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", ws.id);

        if ((count || 0) === 0) {
          templateKey = "nudge_no_sales";
          subject = `${name}, compartilhe sua loja e faça sua primeira venda!`;
        }
      } else if (wsAge >= 7 && !hasPublished) {
        templateKey = "nudge_inactive";
        subject = `${name}, sua loja KIVO está esperando por você!`;
      }

      if (!templateKey) continue;

      // Idempotency check
      const idempotencyKey = `nudge_${templateKey}_${ws.id}`;
      const { data: existing } = await supabase
        .from("email_logs")
        .select("id")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();

      if (existing) continue;

      // Send email via send-email function
      try {
        const sendRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            workspace_id: ws.id,
            template_key: templateKey,
            to: email,
            subject,
            variables: { nome: name, produto: "", valor: "", checkout_url: "", member_url: "", suporte_email: "suporte@kivo.com.br" },
            idempotency_key: idempotencyKey,
          }),
        });

        if (sendRes.ok) nudgesSent++;
      } catch (e) {
        console.error(`Failed to send nudge to ${email}:`, e);
      }
    }

    return new Response(JSON.stringify({ ok: true, nudges_sent: nudgesSent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("process-activation-nudges error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
