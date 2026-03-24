import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const { order_id, invoice_id, retry } = await req.json();

    let invoiceRecord: any = null;

    if (invoice_id) {
      // Retry existing invoice
      const { data } = await supabase
        .from("fiscal_invoices")
        .select("*, orders!inner(workspace_id, total_amount, customer_name, customer_email, order_number)")
        .eq("id", invoice_id)
        .single();
      invoiceRecord = data;
      if (!invoiceRecord) throw new Error("Invoice not found");
    } else if (order_id) {
      // Check idempotency
      const { data: existing } = await supabase
        .from("fiscal_invoices")
        .select("id, status")
        .eq("order_id", order_id)
        .maybeSingle();

      if (existing?.status === "issued") {
        return new Response(JSON.stringify({ ok: true, already_issued: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (existing) {
        invoiceRecord = existing;
      }
    }

    // Get order data
    const targetOrderId = invoice_id ? invoiceRecord?.order_id : order_id;
    const { data: order } = await supabase
      .from("orders")
      .select("id, workspace_id, total_amount, customer_name, customer_email, order_number")
      .eq("id", targetOrderId)
      .single();

    if (!order) throw new Error("Order not found");

    // Get fiscal settings
    const { data: fiscal } = await supabase
      .from("fiscal_settings")
      .select("*")
      .eq("workspace_id", order.workspace_id)
      .maybeSingle();

    if (!fiscal) {
      // No fiscal settings — just create pending record
      if (!invoiceRecord) {
        await supabase.from("fiscal_invoices").insert({
          workspace_id: order.workspace_id,
          order_id: order.id,
          status: "pending",
          service_amount: Number(order.total_amount),
          tax_amount: 0,
        });
      }
      return new Response(JSON.stringify({ ok: true, status: "pending", reason: "no_fiscal_settings" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const provider = fiscal.nfse_provider;
    const taxRate = Number(fiscal.default_tax_rate || 5);
    const serviceAmount = Number(order.total_amount);
    const taxAmount = Math.round(serviceAmount * (taxRate / 100));

    // Create or update invoice record
    const invoiceData: any = {
      workspace_id: order.workspace_id,
      order_id: order.id,
      provider,
      service_amount: serviceAmount,
      tax_amount: taxAmount,
      status: "pending",
      last_attempt_at: new Date().toISOString(),
    };

    let currentInvoiceId: string;

    if (invoiceRecord?.id) {
      await supabase.from("fiscal_invoices").update({
        ...invoiceData,
        attempts: (invoiceRecord.attempts || 0) + 1,
      }).eq("id", invoiceRecord.id);
      currentInvoiceId = invoiceRecord.id;
    } else {
      const { data: newInv } = await supabase
        .from("fiscal_invoices")
        .insert({ ...invoiceData, attempts: 1 })
        .select("id")
        .single();
      currentInvoiceId = newInv!.id;
    }

    // Try to emit via provider API
    let emissionResult: any = null;

    if (provider === "enotas") {
      const enotasKey = Deno.env.get("ENOTAS_API_KEY");
      if (!enotasKey) {
        await supabase.from("fiscal_invoices").update({
          status: "failed",
          error_message: "ENOTAS_API_KEY não configurada",
        }).eq("id", currentInvoiceId);
        throw new Error("ENOTAS_API_KEY not configured");
      }

      // eNotas API call (simplified)
      try {
        const resp = await fetch("https://api.enotas.com.br/v2/empresas/" + (fiscal.document || "") + "/nfes", {
          method: "POST",
          headers: {
            "Authorization": `Basic ${enotasKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            tipo: "NFS-e",
            cliente: {
              nome: order.customer_name || "Cliente",
              email: order.customer_email,
            },
            servico: {
              descricao: `Produto digital - Pedido ${order.order_number || order.id.slice(0, 8)}`,
              valorTotal: serviceAmount / 100,
              issRetido: false,
            },
          }),
        });
        emissionResult = await resp.json();
        if (!resp.ok) throw new Error(JSON.stringify(emissionResult));
      } catch (providerErr: any) {
        await supabase.from("fiscal_invoices").update({
          status: "failed",
          error_message: providerErr.message?.slice(0, 500),
        }).eq("id", currentInvoiceId);

        // Audit log
        await supabase.from("audit_logs").insert({
          workspace_id: order.workspace_id,
          entity_type: "fiscal_invoice",
          entity_id: currentInvoiceId,
          action: "nfse_emission_failed",
          metadata: { error: providerErr.message?.slice(0, 200), provider },
        });

        throw providerErr;
      }
    } else if (provider === "focusnfe") {
      const focusKey = Deno.env.get("FOCUSNFE_API_KEY");
      if (!focusKey) {
        await supabase.from("fiscal_invoices").update({
          status: "failed",
          error_message: "FOCUSNFE_API_KEY não configurada",
        }).eq("id", currentInvoiceId);
        throw new Error("FOCUSNFE_API_KEY not configured");
      }

      // Focus NFe API call (simplified)
      try {
        const ref = `kivo-${order.id.slice(0, 12)}`;
        const resp = await fetch(`https://api.focusnfe.com.br/v2/nfse?ref=${ref}`, {
          method: "POST",
          headers: {
            "Authorization": `Basic ${btoa(focusKey + ":")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prestador: { cnpj: fiscal.document },
            tomador: {
              razao_social: order.customer_name || "Cliente",
              email: order.customer_email,
            },
            servico: {
              discriminacao: `Produto digital - Pedido ${order.order_number || order.id.slice(0, 8)}`,
              valor_servicos: serviceAmount / 100,
              iss_retido: false,
              aliquota: taxRate,
            },
          }),
        });
        emissionResult = await resp.json();
        if (!resp.ok) throw new Error(JSON.stringify(emissionResult));
      } catch (providerErr: any) {
        await supabase.from("fiscal_invoices").update({
          status: "failed",
          error_message: providerErr.message?.slice(0, 500),
        }).eq("id", currentInvoiceId);

        await supabase.from("audit_logs").insert({
          workspace_id: order.workspace_id,
          entity_type: "fiscal_invoice",
          entity_id: currentInvoiceId,
          action: "nfse_emission_failed",
          metadata: { error: providerErr.message?.slice(0, 200), provider },
        });

        throw providerErr;
      }
    } else {
      // No provider configured — leave as pending
      return new Response(JSON.stringify({ ok: true, status: "pending", reason: "no_provider" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Success — update invoice
    await supabase.from("fiscal_invoices").update({
      status: "issued",
      issued_at: new Date().toISOString(),
      external_id: emissionResult?.id || emissionResult?.nfse_id || null,
      invoice_number: emissionResult?.numero || emissionResult?.numero_nfse || null,
      verification_code: emissionResult?.codigo_verificacao || null,
      pdf_url: emissionResult?.url_danfse || emissionResult?.pdf_url || null,
      xml_url: emissionResult?.url_xml || emissionResult?.xml_url || null,
      error_message: null,
    }).eq("id", currentInvoiceId);

    // Audit success
    await supabase.from("audit_logs").insert({
      workspace_id: order.workspace_id,
      entity_type: "fiscal_invoice",
      entity_id: currentInvoiceId,
      action: "nfse_issued",
      metadata: { provider, invoice_number: emissionResult?.numero },
    });

    return new Response(JSON.stringify({ ok: true, status: "issued", invoice_id: currentInvoiceId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("emit-nfse error:", err);
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 200, // don't fail hard
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
