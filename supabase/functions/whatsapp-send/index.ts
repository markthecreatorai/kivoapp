import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const { action } = body;

    // Action: Create Evolution API instance and get QR code
    if (action === "create_instance") {
      const { api_url, api_key, instance_name, workspace_id } = body;

      if (!api_url || !api_key || !instance_name) {
        throw new Error("Missing api_url, api_key, or instance_name");
      }

      // Create instance on Evolution API
      const createRes = await fetch(`${api_url}/instance/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: api_key,
        },
        body: JSON.stringify({
          instanceName: instance_name,
          integration: "WHATSAPP-BAILEYS",
          qrcode: true,
        }),
      });

      if (!createRes.ok) {
        const err = await createRes.text();
        throw new Error(`Evolution API error: ${err}`);
      }

      const createData = await createRes.json();

      // Store API key securely in the config (encrypted in practice)
      await supabase.from("whatsapp_config").update({
        instance_id: createData?.instance?.instanceId || instance_name,
        qr_code: createData?.qrcode?.base64 || null,
        status: createData?.qrcode ? "awaiting_scan" : "connected",
      }).eq("workspace_id", workspace_id);

      return new Response(JSON.stringify({
        instance_id: createData?.instance?.instanceId,
        qrcode: createData?.qrcode?.base64 || null,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: Send WhatsApp message
    if (action === "send_message") {
      const { workspace_id, phone, trigger_type, variables } = body;

      if (!workspace_id || !phone || !trigger_type) {
        throw new Error("Missing workspace_id, phone, or trigger_type");
      }

      // Get WhatsApp config
      const { data: config } = await supabase
        .from("whatsapp_config")
        .select("*")
        .eq("workspace_id", workspace_id)
        .eq("status", "connected")
        .maybeSingle();

      if (!config || !config.api_url || !config.instance_name) {
        console.log("WhatsApp not configured for workspace", workspace_id);
        return new Response(JSON.stringify({ sent: false, reason: "not_configured" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get template
      const { data: template } = await supabase
        .from("whatsapp_templates")
        .select("*")
        .eq("workspace_id", workspace_id)
        .eq("trigger_type", trigger_type)
        .eq("is_active", true)
        .maybeSingle();

      if (!template) {
        return new Response(JSON.stringify({ sent: false, reason: "no_template" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Replace variables in template
      let message = template.message_template;
      if (variables) {
        for (const [key, value] of Object.entries(variables)) {
          message = message.replace(new RegExp(`\\{${key}\\}`, "g"), String(value));
        }
      }

      // Clean phone number (remove non-digits, ensure country code)
      let cleanPhone = phone.replace(/\D/g, "");
      if (cleanPhone.startsWith("0")) cleanPhone = "55" + cleanPhone.slice(1);
      if (!cleanPhone.startsWith("55")) cleanPhone = "55" + cleanPhone;

      // Get API key from Evolution API config
      // In production, store encrypted; here we use a Supabase secret
      const evolutionApiKey = Deno.env.get("EVOLUTION_API_KEY") || "";

      // Send via Evolution API
      const sendRes = await fetch(`${config.api_url}/message/sendText/${config.instance_name}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: evolutionApiKey,
        },
        body: JSON.stringify({
          number: cleanPhone,
          text: message,
        }),
      });

      if (!sendRes.ok) {
        const err = await sendRes.text();
        console.error("Evolution API send error:", err);
        return new Response(JSON.stringify({ sent: false, reason: "send_failed", error: err }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const sendData = await sendRes.json();

      return new Response(JSON.stringify({ sent: true, message_id: sendData?.key?.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: Check connection status
    if (action === "check_status") {
      const { workspace_id } = body;
      const { data: config } = await supabase
        .from("whatsapp_config")
        .select("api_url, instance_name, status")
        .eq("workspace_id", workspace_id)
        .maybeSingle();

      if (!config?.api_url || !config?.instance_name) {
        return new Response(JSON.stringify({ status: "disconnected" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const evolutionApiKey = Deno.env.get("EVOLUTION_API_KEY") || "";

      try {
        const statusRes = await fetch(`${config.api_url}/instance/connectionState/${config.instance_name}`, {
          headers: { apikey: evolutionApiKey },
        });
        const statusData = await statusRes.json();

        const newStatus = statusData?.state === "open" ? "connected" : "disconnected";
        const phoneNumber = statusData?.instance?.wuid?.split("@")?.[0] || null;

        if (newStatus !== config.status || phoneNumber) {
          await supabase.from("whatsapp_config").update({
            status: newStatus,
            phone_number: phoneNumber ? `+${phoneNumber}` : null,
          }).eq("workspace_id", workspace_id);
        }

        return new Response(JSON.stringify({ status: newStatus, phone_number: phoneNumber }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch {
        return new Response(JSON.stringify({ status: "error" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
