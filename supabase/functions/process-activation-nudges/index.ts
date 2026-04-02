import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STEPS = [
  { key: "d0_welcome", minDays: 0, maxDays: 1, subject: (n: string) => `Bem-vindo à KIVO, ${n}! 🎉`, template: "nudge_welcome" },
  { key: "d1_activate", minDays: 1, maxDays: 3, subject: (n: string) => `${n}, crie seu primeiro produto na KIVO!`, template: "nudge_no_product", requiresMissing: "product_created" },
  { key: "d3_publish", minDays: 3, maxDays: 7, subject: (n: string) => `${n}, publique seu produto e comece a vender!`, template: "nudge_publish", requiresMissing: "product_published" },
  { key: "d7_first_sale", minDays: 7, maxDays: 14, subject: (n: string) => `${n}, compartilhe sua loja e faça sua primeira venda!`, template: "nudge_no_sales", requiresMissing: "first_sale" },
] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const now = new Date();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

    // Get workspaces created in last 14 days (beta cohort window)
    const { data: workspaces } = await supabase
      .from("workspaces")
      .select("id, name, created_at")
      .gte("created_at", fourteenDaysAgo);

    let nudgesSent = 0;
    const logs: string[] = [];

    for (const ws of workspaces || []) {
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

      // Get onboarding progress
      const { data: progress } = await supabase
        .from("onboarding_progress")
        .select("step_key, completed_at")
        .eq("workspace_id", ws.id);

      const completedSteps = new Set(
        (progress || []).filter((p: any) => p.completed_at).map((p: any) => p.step_key)
      );

      // Get already sent cohort steps
      const { data: sentSteps } = await supabase
        .from("beta_cohort_log")
        .select("step")
        .eq("workspace_id", ws.id);

      const sentStepKeys = new Set((sentSteps || []).map((s: any) => s.step));

      const wsAge = (now.getTime() - new Date(ws.created_at).getTime()) / (24 * 60 * 60 * 1000);

      for (const step of STEPS) {
        // Skip if already sent
        if (sentStepKeys.has(step.key)) continue;

        // Check timing
        if (wsAge < step.minDays || wsAge >= step.maxDays) continue;

        // Check prerequisite (if step requires a missing onboarding step)
        if ("requiresMissing" in step && step.requiresMissing && completedSteps.has(step.requiresMissing)) continue;

        // For d0_welcome, send to all new workspaces
        const subject = step.subject(name);
        const idempotencyKey = `cohort_${step.key}_${ws.id}`;

        try {
          const sendRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              workspace_id: ws.id,
              template_key: step.template,
              to: email,
              subject,
              variables: { nome: name, produto: "", valor: "", checkout_url: "", member_url: "", suporte_email: "suporte@kivo.com.br" },
              idempotency_key: idempotencyKey,
            }),
          });

          if (sendRes.ok) {
            // Log to beta_cohort_log
            await supabase.from("beta_cohort_log").upsert({
              workspace_id: ws.id,
              user_email: email,
              step: step.key,
              status: "sent",
              sent_at: now.toISOString(),
            }, { onConflict: "workspace_id,step" });

            nudgesSent++;
            logs.push(`${step.key} → ${email}`);
          }
        } catch (e) {
          console.error(`Failed to send ${step.key} to ${email}:`, e);
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, nudges_sent: nudgesSent, logs }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("process-activation-nudges error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
