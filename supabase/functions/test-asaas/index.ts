import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function baseUrl(environment?: string) {
  const env = (environment || Deno.env.get("ASAAS_ENV") || "sandbox").trim().toLowerCase();
  return env === "production"
    ? "https://api.asaas.com/v3"
    : "https://sandbox.asaas.com/api/v3";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    let apiKey = typeof body.api_key === "string" ? body.api_key : "";
    const environment = typeof body.environment === "string" ? body.environment : undefined;

    // Modo diagnóstico: usa a credencial configurada no projeto.
    // Restrito a administradores da plataforma (a função é pública, verify_jwt = false).
    if (!apiKey) {
      const authHeader = req.headers.get("Authorization") || "";
      if (!authHeader.startsWith("Bearer ")) {
        return json({ success: false, error: "Autenticação obrigatória no modo diagnóstico" }, 401);
      }
      const admin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { data: userData } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
      const uid = userData?.user?.id;
      if (!uid) return json({ success: false, error: "Sessão inválida" }, 401);
      const { data: isAdmin } = await admin.rpc("is_admin_user", { _user_id: uid });
      if (!isAdmin) return json({ success: false, error: "Acesso restrito a administradores" }, 403);

      apiKey = Deno.env.get("ASAAS_API_KEY") || "";
      if (!apiKey) return json({ success: false, error: "ASAAS_API_KEY não configurada" }, 500);
    }

    const base = baseUrl(environment);
    const response = await fetch(`${base}/finance/balance`, {
      headers: { access_token: apiKey, "Content-Type": "application/json" },
    });

    if (response.ok) {
      const data = await response.json();
      return json({ success: true, base, balance: data });
    }

    const errorBody = await response.text();
    console.error("Asaas test failed:", response.status, errorBody);
    return json({
      success: false,
      base,
      status: response.status,
      error: "Invalid API key or connection failed",
      detail: errorBody.slice(0, 500),
    });
  } catch (err) {
    console.error("Test error:", err);
    return json({ success: false, error: "Connection test failed" }, 500);
  }
});
