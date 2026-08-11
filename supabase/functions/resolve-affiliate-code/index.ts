import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Rate limit simples em memória por IP (por instância)
const hits = new Map<string, { count: number; resetAt: number }>();
const LIMIT = 30;
const WINDOW_MS = 60_000;

function rateLimited(ip: string) {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || entry.resetAt < now) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > LIMIT;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (rateLimited(ip)) {
      return json({ error: "Muitas requisições" }, 429);
    }

    const body = await req.json().catch(() => ({}));
    const code = typeof body.code === "string" ? body.code.trim() : "";
    const sessionId = typeof body.session_id === "string" ? body.session_id.slice(0, 100) : null;
    const productId = typeof body.product_id === "string" ? body.product_id : null;

    if (!code || code.length > 64) {
      return json({ error: "code inválido" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Toda a validação (afiliado aprovado, programa habilitado, produto do link),
    // o incremento atômico do clique e a atribuição idempotente por
    // (link, sessão) acontecem dentro do RPC — nunca no client.
    const { data, error } = await supabase.rpc("register_affiliate_click", {
      p_code: code,
      p_session_id: sessionId,
      p_product_id: productId,
    });

    if (error) {
      console.error("register_affiliate_click error:", error.message);
      return json({ error: "Erro interno" }, 500);
    }

    if (!data?.ok) {
      return json({ error: data?.error || "Código inválido" }, 404);
    }

    return json({
      affiliate_link_id: data.affiliate_link_id,
      expires_at: data.expires_at,
    });
  } catch (err) {
    console.error("resolve-affiliate-code error:", err);
    return json({ error: "Erro interno" }, 500);
  }
});
