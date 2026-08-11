// test-asaas — diagnóstico da credencial Asaas configurada no projeto.
//
// HARDENING (Onda 3): esta função NÃO aceita mais credencial nem ambiente vindos
// do corpo da requisição. Antes ela funcionava como proxy de credenciais: qualquer
// pessoa (verify_jwt = false, CORS "*") podia enviar `api_key` arbitrária e usar a
// Kivo como oráculo para validar chaves Asaas roubadas — e forçar `environment:
// "production"` mesmo em ambiente de sandbox. Agora:
//   • exige JWT de administrador da plataforma (is_admin_user);
//   • usa somente ASAAS_API_KEY / ASAAS_ENV do ambiente;
//   • nunca ecoa a credencial nem o corpo bruto do erro do gateway.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeadersFor } from "../_shared/cors.ts";

function baseUrl() {
  const env = (Deno.env.get("ASAAS_ENV") || "sandbox").trim().toLowerCase();
  return env === "production"
    ? "https://api.asaas.com/v3"
    : "https://sandbox.asaas.com/api/v3";
}

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Autorização: exclusivamente administradores da plataforma ──
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ success: false, error: "Autenticação obrigatória" }, 401);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: userData } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    const uid = userData?.user?.id;
    if (!uid) return json({ success: false, error: "Sessão inválida" }, 401);

    const { data: isAdmin } = await admin.rpc("is_admin_user", { _user_id: uid });
    if (!isAdmin) return json({ success: false, error: "Acesso restrito a administradores" }, 403);

    const apiKey = (Deno.env.get("ASAAS_API_KEY") || "").trim();
    if (!apiKey) return json({ success: false, error: "ASAAS_API_KEY não configurada" }, 503);

    const base = baseUrl();
    const response = await fetch(`${base}/finance/balance`, {
      headers: { access_token: apiKey, "Content-Type": "application/json" },
    });

    if (response.ok) {
      const data = await response.json();
      return json({ success: true, base, balance: data });
    }

    // Nunca devolver o corpo bruto do gateway: pode carregar eco de credencial.
    console.error("Asaas test failed:", response.status);
    return json({
      success: false,
      base,
      status: response.status,
      error: "Falha na conexão com o gateway ou credencial inválida",
    });
  } catch (err) {
    console.error("Test error:", (err as Error).message);
    return json({ success: false, error: "Connection test failed" }, 500);
  }
});
