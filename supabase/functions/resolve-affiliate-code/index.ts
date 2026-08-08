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

    if (!code || code.length > 64) {
      return json({ error: "code inválido" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: link } = await supabase
      .from("affiliate_links")
      .select("id, affiliate_id, click_count")
      .eq("code", code)
      .maybeSingle();

    if (!link) return json({ error: "Código não encontrado" }, 404);

    // Duração do cookie do programa do workspace do afiliado
    let cookieDays = 30;
    const { data: aff } = await supabase
      .from("affiliates")
      .select("workspace_id")
      .eq("id", link.affiliate_id)
      .maybeSingle();
    if (aff?.workspace_id) {
      const { data: prog } = await supabase
        .from("affiliate_programs")
        .select("cookie_duration_days")
        .eq("workspace_id", aff.workspace_id)
        .maybeSingle();
      if (prog?.cookie_duration_days) cookieDays = prog.cookie_duration_days;
    }

    const expiresAt = new Date(Date.now() + cookieDays * 86_400_000).toISOString();

    // Clique + atribuição (server-side, tabela nunca exposta ao client)
    await supabase
      .from("affiliate_links")
      .update({ click_count: (link.click_count || 0) + 1 })
      .eq("id", link.id);

    if (sessionId) {
      const { error: attrError } = await supabase.from("affiliate_attributions").insert({
        affiliate_link_id: link.id,
        session_id: sessionId,
        expires_at: expiresAt,
      });
      if (attrError) console.error("attribution insert failed", attrError.message);
    }

    return json({ affiliate_link_id: link.id, expires_at: expiresAt });
  } catch (err) {
    console.error("resolve-affiliate-code error:", err);
    return json({ error: "Erro interno" }, 500);
  }
});
