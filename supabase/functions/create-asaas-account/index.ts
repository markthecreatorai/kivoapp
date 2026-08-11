// ⚠️ DEPRECADA — NÃO USAR NO ONBOARDING (decisão de arquitetura, ago/2026).
// O modelo financeiro da Kivo é CUSTÓDIA + LEDGER INTERNO: todo pagamento entra
// na conta Asaas da Kivo e a divisão é feita em split_entries / wallet_ledger /
// reserve_entries, com repasse via POST /transfers (process-payouts).
// NÃO usamos split nativo do Asaas nem subcontas por produtor.
// Consequência: workspaces.asaas_account_id e workspaces.asaas_wallet_id existem
// no schema mas NÃO participam de nenhum fluxo de pagamento/repasse. Mantidos
// apenas para eventual migração futura para split nativo.
// Esta função não é chamada por nenhum fluxo do app; mantida somente como
// referência de integração. Não adicione chamadas a ela sem revisar a decisão.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function getAsaasBase() {
  const env = (Deno.env.get("ASAAS_ENV") || "sandbox").trim().toLowerCase();
  return env === "production"
    ? "https://api.asaas.com/v3"
    : "https://sandbox.asaas.com/api/v3";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // KILL-SWITCH (QA Onda 0 — IF-021): função depreciada e desligada.
  // Enquanto o deploy não for removido, ela não pode criar subcontas no Asaas.
  return new Response(
    JSON.stringify({
      error: "deprecated",
      message:
        "create-asaas-account está depreciada e desligada. O modelo financeiro da Kivo é custódia + ledger interno.",
    }),
    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );

  // eslint-disable-next-line no-unreachable


  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const asaasApiKey = Deno.env.get("ASAAS_API_KEY");

  if (!asaasApiKey) {
    return new Response(JSON.stringify({ error: "ASAAS_API_KEY not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Auth: validate JWT
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace("Bearer ", "")
  );
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { workspace_id, company_name, cpf_cnpj, email, phone, address } = body;

    if (!workspace_id || !company_name || !cpf_cnpj || !email) {
      return new Response(JSON.stringify({ error: "Campos obrigatórios: workspace_id, company_name, cpf_cnpj, email" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user is workspace owner/admin
    const { data: member } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!member || !["OWNER", "ADMIN"].includes(member.role)) {
      return new Response(JSON.stringify({ error: "Permissão negada" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if workspace already has an Asaas account
    const { data: ws } = await supabase
      .from("workspaces")
      .select("id, asaas_account_id")
      .eq("id", workspace_id)
      .single();

    if (ws?.asaas_account_id) {
      return new Response(JSON.stringify({
        success: true,
        message: "Conta Asaas já configurada",
        asaas_account_id: ws.asaas_account_id,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create Asaas sub-account
    const cleanCpfCnpj = cpf_cnpj.replace(/\D/g, "");
    const asaasBody: any = {
      name: company_name,
      email,
      cpfCnpj: cleanCpfCnpj,
      companyType: cleanCpfCnpj.length > 11 ? "LIMITED" : "MEI",
      mobilePhone: phone?.replace(/\D/g, "") || undefined,
      loginEmail: email,
    };

    if (address) {
      asaasBody.address = address.street || undefined;
      asaasBody.addressNumber = address.number || undefined;
      asaasBody.complement = address.complement || undefined;
      asaasBody.province = address.neighborhood || undefined;
      asaasBody.postalCode = address.zip?.replace(/\D/g, "") || undefined;
    }

    const res = await fetch(`${getAsaasBase()}/accounts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "access_token": asaasApiKey,
      },
      body: JSON.stringify(asaasBody),
    });

    const asaasResult = await res.json();

    if (!res.ok) {
      console.error("Asaas create account error:", JSON.stringify(asaasResult));
      const errorMsg = asaasResult?.errors?.[0]?.description || `Asaas returned ${res.status}`;
      return new Response(JSON.stringify({ error: errorMsg }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Save Asaas account data to workspace
    const { error: updateError } = await supabase
      .from("workspaces")
      .update({
        asaas_account_id: asaasResult.id,
        asaas_wallet_id: asaasResult.walletId || null,
        payment_setup_complete: true,
      })
      .eq("id", workspace_id);

    if (updateError) {
      console.error("Failed to update workspace:", updateError);
      return new Response(JSON.stringify({ error: "Conta criada no Asaas, mas falhou ao salvar no workspace" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      workspace_id,
      entity_type: "workspace",
      entity_id: workspace_id,
      action: "asaas_account_created",
      user_id: user.id,
      metadata: { asaas_account_id: asaasResult.id, wallet_id: asaasResult.walletId },
    });

    console.log(`Asaas sub-account created for workspace ${workspace_id}: ${asaasResult.id}`);

    return new Response(JSON.stringify({
      success: true,
      asaas_account_id: asaasResult.id,
      wallet_id: asaasResult.walletId || null,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("create-asaas-account error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message || "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
