import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const { campaign_id } = await req.json();

    if (!campaign_id) {
      return new Response(
        JSON.stringify({ error: "campaign_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch campaign
    const { data: campaign, error: campErr } = await supabase
      .from("email_campaigns")
      .select("*")
      .eq("id", campaign_id)
      .single();

    if (campErr || !campaign) {
      return new Response(
        JSON.stringify({ error: "Campaign not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Block duplicate sends
    if (campaign.status === "sent" || campaign.status === "sending") {
      return new Response(
        JSON.stringify({ error: "Campaign already sent or sending", status: campaign.status }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mark as sending
    await supabase.from("email_campaigns").update({ status: "sending" }).eq("id", campaign_id);

    // Resolve leads from segment or all leads
    let leads: any[] = [];
    if (campaign.segment_id) {
      // Get segment filters
      const { data: segment } = await supabase
        .from("email_segments")
        .select("filter_rules")
        .eq("id", campaign.segment_id)
        .single();

      // Get all workspace leads
      const { data: allLeads } = await supabase
        .from("leads")
        .select("id, email, name, tags, status, source, created_at")
        .eq("workspace_id", campaign.workspace_id)
        .is("unsubscribed_at", null);

      if (allLeads && segment?.filter_rules) {
        const rules = segment.filter_rules as any[];
        // Get customer emails for has_purchased filter
        const { data: customers } = await supabase
          .from("customers")
          .select("email")
          .eq("workspace_id", campaign.workspace_id);
        const customerEmails = new Set((customers || []).map((c: any) => c.email?.toLowerCase()));

        // Get abandoned cart emails
        const { data: abandoned } = await supabase
          .from("checkout_sessions")
          .select("email")
          .eq("workspace_id", campaign.workspace_id)
          .eq("status", "ABANDONED")
          .not("email", "is", null);
        const abandonedEmails = new Set((abandoned || []).map((s: any) => s.email?.toLowerCase()));

        leads = allLeads.filter((lead: any) => {
          if (rules.length === 0) return true;
          return rules.every((rule: any) => {
            switch (rule.field) {
              case "tags": return lead.tags?.includes(rule.value);
              case "status": return lead.status === rule.value;
              case "source": return lead.source === rule.value;
              case "created_after": return new Date(lead.created_at) > new Date(rule.value);
              case "has_purchased":
                return rule.value === "yes" ? customerEmails.has(lead.email?.toLowerCase()) : !customerEmails.has(lead.email?.toLowerCase());
              case "cart_abandoned":
                return rule.value === "yes" ? abandonedEmails.has(lead.email?.toLowerCase()) : !abandonedEmails.has(lead.email?.toLowerCase());
              default: return true;
            }
          });
        });
      } else {
        leads = allLeads || [];
      }
    } else {
      // All leads
      const { data: allLeads } = await supabase
        .from("leads")
        .select("id, email, name")
        .eq("workspace_id", campaign.workspace_id)
        .is("unsubscribed_at", null);
      leads = allLeads || [];
    }

    // Deduplicate by email
    const seen = new Set<string>();
    const uniqueLeads = leads.filter((l: any) => {
      const e = l.email?.toLowerCase();
      if (!e || seen.has(e)) return false;
      seen.add(e);
      return true;
    });

    if (uniqueLeads.length === 0) {
      await supabase.from("email_campaigns").update({
        status: "sent", total_recipients: 0, sent_count: 0, sent_at: new Date().toISOString(),
      }).eq("id", campaign_id);
      return new Response(
        JSON.stringify({ ok: true, total_recipients: 0, message: "No recipients" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert recipients (idempotent via UNIQUE constraint)
    const recipientRows = uniqueLeads.map((l: any) => ({
      campaign_id,
      lead_id: l.id,
      email: l.email,
      status: "pending",
    }));

    // Batch insert in chunks
    const CHUNK_SIZE = 100;
    for (let i = 0; i < recipientRows.length; i += CHUNK_SIZE) {
      const chunk = recipientRows.slice(i, i + CHUNK_SIZE);
      await supabase.from("campaign_recipients").upsert(chunk, { onConflict: "campaign_id,lead_id" });
    }

    // Update total
    await supabase.from("email_campaigns").update({ total_recipients: uniqueLeads.length }).eq("id", campaign_id);

    // Send emails in batches
    let sentCount = 0;
    let failedCount = 0;
    const BATCH_SIZE = 10;
    const DELAY_MS = 500;

    // Build simple HTML from body_html
    const wrapEmail = (name: string | null, bodyText: string) => {
      return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <tr><td style="background:linear-gradient(135deg,#F9423A,#FF6B35);padding:24px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:20px;">Kivo</h1>
        </td></tr>
        <tr><td style="padding:30px;color:#333;font-size:15px;line-height:1.6;">
          ${name ? `<p>Olá, ${name}!</p>` : ""}
          <div>${bodyText.replace(/\n/g, "<br/>")}</div>
        </td></tr>
        <tr><td style="padding:20px 30px;background:#fafafa;text-align:center;color:#999;font-size:12px;">
          Kivo — Plataforma para creators
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    };

    for (let i = 0; i < uniqueLeads.length; i += BATCH_SIZE) {
      const batch = uniqueLeads.slice(i, i + BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map(async (lead: any) => {
          const idempotencyKey = `campaign_${campaign_id}_${lead.id}`;
          const html = wrapEmail(lead.name, campaign.body_html);

          if (lovableApiKey) {
            const emailResponse = await fetch("https://api.lovable.dev/v1/email/send", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${lovableApiKey}`,
              },
              body: JSON.stringify({
                to: lead.email,
                subject: campaign.subject,
                html,
                purpose: "transactional",
                idempotencyKey,
              }),
            });

            if (!emailResponse.ok) {
              const errText = await emailResponse.text();
              throw new Error(`HTTP ${emailResponse.status}: ${errText}`);
            }
          }

          // Update recipient status
          await supabase.from("campaign_recipients").update({
            status: "sent",
            sent_at: new Date().toISOString(),
          }).eq("campaign_id", campaign_id).eq("lead_id", lead.id);

          // Also log in email_logs
          await supabase.from("email_logs").insert({
            workspace_id: campaign.workspace_id,
            template_key: `campaign:${campaign.name}`,
            recipient_email: lead.email,
            subject: campaign.subject,
            status: lovableApiKey ? "sent" : "queued",
            idempotency_key: idempotencyKey,
            metadata: { campaign_id, lead_name: lead.name },
          });

          return { leadId: lead.id, status: "sent" };
        })
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          sentCount++;
        } else {
          failedCount++;
          const lead = batch[results.indexOf(result)];
          console.error(`Failed to send to ${lead?.email}:`, result.reason);
          
          // Mark as failed
          if (lead) {
            await supabase.from("campaign_recipients").update({
              status: "failed",
              error_message: String(result.reason).slice(0, 500),
            }).eq("campaign_id", campaign_id).eq("lead_id", lead.id);
          }
        }
      }

      // Update progress
      await supabase.from("email_campaigns").update({
        sent_count: sentCount,
        failed_count: failedCount,
      }).eq("id", campaign_id);

      // Rate limit delay
      if (i + BATCH_SIZE < uniqueLeads.length) {
        await new Promise((r) => setTimeout(r, DELAY_MS));
      }
    }

    // Finalize
    await supabase.from("email_campaigns").update({
      status: failedCount === uniqueLeads.length ? "failed" : "sent",
      sent_count: sentCount,
      failed_count: failedCount,
      sent_at: new Date().toISOString(),
    }).eq("id", campaign_id);

    return new Response(
      JSON.stringify({
        ok: true,
        total_recipients: uniqueLeads.length,
        sent: sentCount,
        failed: failedCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("send-campaign error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
