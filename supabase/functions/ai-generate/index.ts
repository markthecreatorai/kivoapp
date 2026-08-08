import { corsHeadersFor } from "../_shared/cors.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DAILY_LIMIT_PER_WORKSPACE = Number(Deno.env.get("AI_DAILY_LIMIT") || "100");
const MODEL = "google/gemini-3-flash-preview";

const SYSTEM_PROMPTS: Record<string, string> = {
  copy: `Você é um copywriter brasileiro especialista em vendas de produtos digitais. Escreva em português brasileiro, tom persuasivo mas não apelativo. Sempre retorne exatamente 3 variações numeradas (1., 2., 3.) separadas por linhas em branco. Cada variação deve ser direta, sem explicações extras.`,
  email: `Você é um especialista em email marketing brasileiro para produtos digitais. Escreva em português brasileiro, tom profissional e envolvente. Retorne exatamente 2 variações de email. Para cada variação retorne no formato:
---
ASSUNTO: [subject line]
CORPO:
[email body]
---`,
  price: `Você é um consultor de precificação de produtos digitais no mercado brasileiro. Baseie-se em dados reais do mercado digital brasileiro. Responda de forma concisa em português brasileiro.`,
};

serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    // ── 1. Auth: valid JWT required ──
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Não autenticado" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ error: "Não autenticado" }, 401);
    }
    const userId = userData.user.id;

    const { type, context, workspace_id } = await req.json();

    if (!type || !SYSTEM_PROMPTS[type]) {
      return json({ error: "Invalid type. Use: copy, email, price" }, 400);
    }
    if (!workspace_id || typeof workspace_id !== "string") {
      return json({ error: "workspace_id é obrigatório" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // ── 2. Authorization: user must belong to the workspace ──
    const { data: membership } = await admin
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!membership) {
      const { data: ownWorkspace } = await admin
        .from("workspaces")
        .select("id")
        .eq("id", workspace_id)
        .eq("owner_id", userId)
        .maybeSingle();
      if (!ownWorkspace) {
        return json({ error: "Sem acesso a este workspace" }, 403);
      }
    }

    // ── 3. Cost control: daily quota per workspace ──
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);

    const { count: usedToday, error: usageErr } = await admin
      .from("ai_usage_log")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspace_id)
      .gte("created_at", dayStart.toISOString());

    if (usageErr) {
      console.error("ai-generate usage check error:", usageErr.message);
    } else if ((usedToday ?? 0) >= DAILY_LIMIT_PER_WORKSPACE) {
      return json(
        {
          error: `Limite diário de ${DAILY_LIMIT_PER_WORKSPACE} gerações de IA atingido para este workspace. Tente novamente amanhã.`,
        },
        429,
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }


    let userPrompt = "";

    if (type === "copy") {
      const field = context.field || "nome";
      const fieldLabel =
        field === "name" ? "nome do produto" :
        field === "shortDescription" ? "descrição curta (máx 300 chars)" :
        "descrição completa de vendas";
      userPrompt = `Gere 3 variações de ${fieldLabel} para um produto digital.
Nicho: ${context.niche || "não especificado"}
Público-alvo: ${context.audience || "não especificado"}
Benefícios: ${context.benefits || "não especificado"}
${context.productName ? `Nome do produto: ${context.productName}` : ""}
${field === "shortDescription" ? "Cada variação deve ter no máximo 300 caracteres." : ""}
${field === "description" ? "Cada variação deve ser um texto de vendas completo com 3-5 parágrafos." : ""}
${field === "name" ? "Cada variação deve ser curta, memorável e impactante." : ""}`;
    } else if (type === "email") {
      userPrompt = `Gere copy de email marketing.
Objetivo: ${context.objective || "engajamento"}
Segmento: ${context.segment || "leads gerais"}
Produto/contexto: ${context.productName || "produto digital"}
Tom desejado: ${context.tone || "profissional e envolvente"}`;
    } else if (type === "price") {
      userPrompt = `Sugira uma faixa de preço para este produto digital brasileiro:
Tipo: ${context.productType || "não especificado"}
Nicho: ${context.niche || "não especificado"}
Descrição: ${context.description || "não especificado"}
Formato de resposta obrigatório (mantenha exatamente este formato):
RANGE: [valor_min]-[valor_max]
JUSTIFICATIVA: [explicação curta de 2-3 frases sobre o porquê dessa faixa]`;
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,

        messages: [
          { role: "system", content: SYSTEM_PROMPTS[type] },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos ao workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("AI gateway error: " + response.status);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // ── 4. Audit / cost tracking ──
    const { error: logErr } = await admin.from("ai_usage_log").insert({
      workspace_id,
      user_id: userId,
      generation_type: type,
      model: MODEL,
      source: "ai-generate",
    });
    if (logErr) console.error("ai-generate usage log error:", logErr.message);


    // Parse based on type
    let result: any;

    if (type === "copy") {
      // Split into 3 variations
      const variations = content
        .split(/\n\s*\d+\.\s+/)
        .map((v: string) => v.trim())
        .filter((v: string) => v.length > 0)
        .slice(0, 3);
      result = { variations: variations.length > 0 ? variations : [content] };
    } else if (type === "email") {
      // Parse email variations
      const blocks = content.split("---").filter((b: string) => b.trim());
      const emails = blocks.map((block: string) => {
        const subjectMatch = block.match(/ASSUNTO:\s*(.+)/i);
        const bodyMatch = block.match(/CORPO:\s*([\s\S]+)/i);
        return {
          subject: subjectMatch?.[1]?.trim() || "",
          body: bodyMatch?.[1]?.trim() || block.trim(),
        };
      }).filter((e: any) => e.subject || e.body);
      result = { emails: emails.length > 0 ? emails : [{ subject: "", body: content }] };
    } else if (type === "price") {
      const rangeMatch = content.match(/RANGE:\s*(\d+)\s*-\s*(\d+)/i);
      const justMatch = content.match(/JUSTIFICATIVA:\s*([\s\S]+)/i);
      result = {
        min: rangeMatch ? parseInt(rangeMatch[1]) : 47,
        max: rangeMatch ? parseInt(rangeMatch[2]) : 197,
        justification: justMatch?.[1]?.trim() || content,
      };
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("ai-generate error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
