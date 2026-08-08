import { corsHeadersFor } from "../_shared/cors.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";


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

  try {
    const { type, context } = await req.json();

    if (!type || !SYSTEM_PROMPTS[type]) {
      return new Response(
        JSON.stringify({ error: "Invalid type. Use: copy, email, price" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
        model: "google/gemini-3-flash-preview",
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
