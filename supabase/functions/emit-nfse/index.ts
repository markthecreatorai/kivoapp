import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Provider adapter interface
interface NfsePayload {
  document: string;
  customerName: string;
  customerEmail: string;
  description: string;
  serviceAmount: number; // in BRL (cents / 100)
  taxRate: number;
  orderId: string;
}

interface NfseResult {
  externalId?: string;
  invoiceNumber?: string;
  verificationCode?: string;
  pdfUrl?: string;
  xmlUrl?: string;
  raw: any;
}

async function emitViaEnotas(apiKey: string, payload: NfsePayload): Promise<NfseResult> {
  const resp = await fetch(
    `https://api.enotas.com.br/v2/empresas/${payload.document}/nfes`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tipo: "NFS-e",
        cliente: {
          nome: payload.customerName,
          email: payload.customerEmail,
        },
        servico: {
          descricao: payload.description,
          valorTotal: payload.serviceAmount / 100,
          issRetido: false,
        },
      }),
    }
  );
  const data = await resp.json();
  if (!resp.ok) throw new Error(JSON.stringify(data));
  return {
    externalId: data?.id,
    invoiceNumber: data?.numero,
    verificationCode: data?.codigo_verificacao,
    pdfUrl: data?.url_danfse,
    xmlUrl: data?.url_xml,
    raw: data,
  };
}

async function emitViaFocusNfe(apiKey: string, payload: NfsePayload): Promise<NfseResult> {
  const ref = `kivo-${payload.orderId.slice(0, 12)}`;
  const resp = await fetch(
    `https://api.focusnfe.com.br/v2/nfse?ref=${ref}`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(apiKey + ":")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prestador: { cnpj: payload.document },
        tomador: {
          razao_social: payload.customerName,
          email: payload.customerEmail,
        },
        servico: {
          discriminacao: payload.description,
          valor_servicos: payload.serviceAmount / 100,
          iss_retido: false,
          aliquota: payload.taxRate,
        },
      }),
    }
  );
  const data = await resp.json();
  if (!resp.ok) throw new Error(JSON.stringify(data));
  return {
    externalId: data?.nfse_id,
    invoiceNumber: data?.numero_nfse,
    verificationCode: data?.codigo_verificacao,
    pdfUrl: data?.pdf_url,
    xmlUrl: data?.xml_url,
    raw: data,
  };
}

async function logEvent(
  supabase: any,
  invoiceId: string,
  eventType: string,
  payload: Record<string, any> = {}
) {
  await supabase.from("fiscal_invoice_events").insert({
    invoice_id: invoiceId,
    event_type: eventType,
    payload_json: payload,
  });
}

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
      const { data } = await supabase
        .from("fiscal_invoices")
        .select("*, orders!inner(workspace_id, total_amount, customer_name, customer_email, order_number)")
        .eq("id", invoice_id)
        .single();
      invoiceRecord = data;
      if (!invoiceRecord) throw new Error("Invoice not found");
    } else if (order_id) {
      // Idempotency check
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
      if (!invoiceRecord) {
        const { data: newInv } = await supabase.from("fiscal_invoices").insert({
          workspace_id: order.workspace_id,
          order_id: order.id,
          status: "pending",
          service_amount: Number(order.total_amount),
          tax_amount: 0,
        }).select("id").single();
        if (newInv) await logEvent(supabase, newInv.id, "created", { reason: "no_fiscal_settings" });
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
      await logEvent(supabase, currentInvoiceId, retry ? "retry_requested" : "reprocessed", { attempt: (invoiceRecord.attempts || 0) + 1 });
    } else {
      const { data: newInv } = await supabase
        .from("fiscal_invoices")
        .insert({ ...invoiceData, attempts: 1 })
        .select("id")
        .single();
      currentInvoiceId = newInv!.id;
      await logEvent(supabase, currentInvoiceId, "created", { provider, order_id: order.id });
    }

    // Emit via provider adapter
    if (!provider || (provider !== "enotas" && provider !== "focusnfe")) {
      return new Response(JSON.stringify({ ok: true, status: "pending", reason: "no_provider" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKeyName = provider === "enotas" ? "ENOTAS_API_KEY" : "FOCUSNFE_API_KEY";
    const apiKey = Deno.env.get(apiKeyName);
    if (!apiKey) {
      await supabase.from("fiscal_invoices").update({
        status: "failed",
        error_message: `${apiKeyName} não configurada`,
      }).eq("id", currentInvoiceId);
      await logEvent(supabase, currentInvoiceId, "failed", { error: `${apiKeyName} missing` });
      throw new Error(`${apiKeyName} not configured`);
    }

    const nfsePayload: NfsePayload = {
      document: fiscal.document || "",
      customerName: order.customer_name || "Cliente",
      customerEmail: order.customer_email || "",
      description: `Produto digital - Pedido ${order.order_number || order.id.slice(0, 8)}`,
      serviceAmount,
      taxRate,
      orderId: order.id,
    };

    let result: NfseResult;
    try {
      await logEvent(supabase, currentInvoiceId, "emission_started", { provider });
      result = provider === "enotas"
        ? await emitViaEnotas(apiKey, nfsePayload)
        : await emitViaFocusNfe(apiKey, nfsePayload);
    } catch (providerErr: any) {
      const errMsg = providerErr.message?.slice(0, 500);
      await supabase.from("fiscal_invoices").update({
        status: "failed",
        error_message: errMsg,
      }).eq("id", currentInvoiceId);

      await logEvent(supabase, currentInvoiceId, "emission_failed", { error: errMsg, provider });

      await supabase.from("audit_logs").insert({
        workspace_id: order.workspace_id,
        entity_type: "fiscal_invoice",
        entity_id: currentInvoiceId,
        action: "nfse_emission_failed",
        metadata: { error: providerErr.message?.slice(0, 200), provider },
      });

      throw providerErr;
    }

    // Success
    await supabase.from("fiscal_invoices").update({
      status: "issued",
      issued_at: new Date().toISOString(),
      external_id: result.externalId || null,
      invoice_number: result.invoiceNumber || null,
      verification_code: result.verificationCode || null,
      pdf_url: result.pdfUrl || null,
      xml_url: result.xmlUrl || null,
      error_message: null,
    }).eq("id", currentInvoiceId);

    await logEvent(supabase, currentInvoiceId, "issued", {
      provider,
      invoice_number: result.invoiceNumber,
      external_id: result.externalId,
    });

    await supabase.from("audit_logs").insert({
      workspace_id: order.workspace_id,
      entity_type: "fiscal_invoice",
      entity_id: currentInvoiceId,
      action: "nfse_issued",
      metadata: { provider, invoice_number: result.invoiceNumber },
    });

    return new Response(JSON.stringify({ ok: true, status: "issued", invoice_id: currentInvoiceId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("emit-nfse error:", err);
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
