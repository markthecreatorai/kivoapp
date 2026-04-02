import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get enrollments ready to send
    const { data: enrollments, error: enrollErr } = await supabase
      .from("email_sequence_enrollments")
      .select(`
        id, sequence_id, lead_id, current_step, next_send_at,
        email_sequences!inner(id, name, workspace_id, is_active),
        leads!inner(id, email, name)
      `)
      .is("completed_at", null)
      .is("unsubscribed_at", null)
      .not("next_send_at", "is", null)
      .lte("next_send_at", new Date().toISOString());

    if (enrollErr) throw enrollErr;
    if (!enrollments || enrollments.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;

    for (const enrollment of enrollments) {
      const seq = enrollment.email_sequences as any;
      if (!seq?.is_active) continue;

      const lead = enrollment.leads as any;

      // Get the current step
      const { data: step } = await supabase
        .from("email_sequence_steps")
        .select("*")
        .eq("sequence_id", enrollment.sequence_id)
        .eq("position", enrollment.current_step)
        .single();

      if (!step) {
        // No more steps — mark as completed
        await supabase
          .from("email_sequence_enrollments")
          .update({ completed_at: new Date().toISOString(), next_send_at: null })
          .eq("id", enrollment.id);
        continue;
      }

      // Send email via Lovable transactional API
      const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
      if (lovableApiKey) {
        try {
          const personalizedBody = step.body
            .replace(/\{\{name\}\}/g, lead.name || "")
            .replace(/\{\{email\}\}/g, lead.email || "");

          await fetch("https://api.lovable.dev/api/v1/send-email", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${lovableApiKey}`,
            },
            body: JSON.stringify({
              to: lead.email,
              subject: step.subject,
              html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                <div style="white-space:pre-wrap;">${personalizedBody}</div>
                <hr style="margin-top:32px;border:none;border-top:1px solid #eee;" />
                <p style="font-size:12px;color:#999;">Enviado por Kora</p>
              </div>`,
              purpose: "transactional",
            }),
          });
        } catch (emailErr) {
          console.error("Email send error:", emailErr);
        }
      }

      // Get next step to calculate next_send_at
      const { data: nextStep } = await supabase
        .from("email_sequence_steps")
        .select("delay_hours")
        .eq("sequence_id", enrollment.sequence_id)
        .eq("position", enrollment.current_step + 1)
        .single();

      if (nextStep) {
        const nextSend = new Date();
        nextSend.setHours(nextSend.getHours() + nextStep.delay_hours);
        await supabase
          .from("email_sequence_enrollments")
          .update({
            current_step: enrollment.current_step + 1,
            next_send_at: nextSend.toISOString(),
          })
          .eq("id", enrollment.id);
      } else {
        // This was the last step
        await supabase
          .from("email_sequence_enrollments")
          .update({
            current_step: enrollment.current_step + 1,
            completed_at: new Date().toISOString(),
            next_send_at: null,
          })
          .eq("id", enrollment.id);
      }

      processed++;
    }

    return new Response(JSON.stringify({ processed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
