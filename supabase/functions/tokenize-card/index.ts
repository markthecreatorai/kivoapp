// Tokenização de cartão — o PAN/CVV nunca é persistido, logado ou repassado
// para outras funções. Esta função troca os dados do cartão por um
// creditCardToken do gateway (Asaas) e devolve apenas token + last4 + brand.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getAsaasBase() {
  const env = (Deno.env.get("ASAAS_ENV") || "sandbox").trim().toLowerCase();
  return env === "production"
    ? "https://api.asaas.com/v3"
    : "https://sandbox.asaas.com/api/v3";
}

async function callAsaas(path: string, body: unknown, apiKey: string, method = "POST") {
  const res = await fetch(`${getAsaasBase()}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "access_token": apiKey },
    body: method !== "GET" ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    // Nunca logar o corpo enviado (contém dados de cartão) — apenas o erro do gateway
    console.error("Asaas tokenize error:", data?.errors?.[0]?.description || `HTTP ${res.status}`);
    throw new Error(data?.errors?.[0]?.description || `Asaas retornou ${res.status}`);
  }
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const apiKey = (Deno.env.get("ASAAS_API_KEY") || "").trim();
  if (!apiKey) {
    console.error("tokenize-card blocked: ASAAS_API_KEY não configurada");
    return new Response(JSON.stringify({ error: "Gateway de pagamento não configurado" }), {
      status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { customer, card } = body ?? {};

    if (!customer?.name || !customer?.email || !customer?.cpf) {
      return new Response(JSON.stringify({ error: "Dados do cliente incompletos" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!card?.number || !card?.cvv || !card?.exp_month || !card?.exp_year || !card?.holder_name) {
      return new Response(JSON.stringify({ error: "Dados do cartão incompletos" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cpf = String(customer.cpf).replace(/\D/g, "");
    if (cpf.length !== 11 && cpf.length !== 14) {
      return new Response(JSON.stringify({ error: "CPF/CNPJ inválido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cliente do gateway (necessário para tokenizar)
    let asaasCustomerId: string | null = null;
    try {
      const search = await callAsaas(`/customers?cpfCnpj=${cpf}`, null, apiKey, "GET");
      if (search?.data?.length > 0) asaasCustomerId = search.data[0].id;
    } catch { /* ignore */ }

    if (!asaasCustomerId) {
      const created = await callAsaas("/customers", {
        name: customer.name,
        email: customer.email,
        cpfCnpj: cpf,
        mobilePhone: String(customer.phone || "").replace(/\D/g, "") || undefined,
      }, apiKey);
      asaasCustomerId = created.id;
    }

    const remoteIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      undefined;

    const expiryYear = String(card.exp_year).length === 2 ? `20${card.exp_year}` : String(card.exp_year);

    const tokenized = await callAsaas("/creditCard/tokenizeCreditCard", {
      customer: asaasCustomerId,
      creditCard: {
        holderName: card.holder_name,
        number: String(card.number).replace(/\D/g, ""),
        expiryMonth: String(card.exp_month).padStart(2, "0"),
        expiryYear,
        ccv: String(card.cvv).replace(/\D/g, ""),
      },
      creditCardHolderInfo: {
        name: customer.name,
        email: customer.email,
        cpfCnpj: cpf,
        phone: String(customer.phone || "").replace(/\D/g, "") || "11999999999",
        postalCode: customer.zip || "01310100",
        addressNumber: customer.address_number || "100",
        address: customer.address || "Av Paulista",
      },
      remoteIp,
    }, apiKey);

    console.log("tokenize-card: token gerado", { brand: tokenized?.creditCardBrand });

    return new Response(JSON.stringify({
      card_token: tokenized.creditCardToken,
      card_last4: String(tokenized.creditCardNumber || "").slice(-4),
      card_brand: tokenized.creditCardBrand || "unknown",
      gateway_customer_id: asaasCustomerId,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message || "Erro ao tokenizar cartão" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
