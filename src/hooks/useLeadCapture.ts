// =============================================================
// useLeadCapture — Hook reutilizável para captura de leads
// Pode ser usado em qualquer formulário da plataforma.
// =============================================================

import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";

// ── Schemas de validação ─────────────────────────────────────
const leadSchema = z.object({
  email: z.string().trim().email("E-mail inválido").max(255),
  name: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(20).optional(),
});

export type LeadInput = z.infer<typeof leadSchema>;

export interface UseLeadCaptureOptions {
  workspaceId: string;
  storefrontId?: string;
  tags?: string[];
  productId?: string;
  successMessage?: string;
  /** Enviar e-mail de boas-vindas? (padrão: true) */
  sendEmail?: boolean;
  /** Tempo em ms para resetar o formulário após sucesso (padrão: 5000) */
  resetDelay?: number;
}

export interface UseLeadCaptureReturn {
  submit: (input: LeadInput) => Promise<void>;
  isSubmitting: boolean;
  isSuccess: boolean;
  reset: () => void;
}

// ── Helpers (lógica isolada, sem UI) ─────────────────────────

async function upsertLead(
  email: string,
  workspaceId: string,
  opts: {
    name?: string;
    phone?: string;
    tags: string[];
    storefrontId?: string;
    productId?: string;
  },
): Promise<{ leadId: string; isNew: boolean }> {
  const { data: existing } = await supabase
    .from("leads")
    .select("id, tags")
    .eq("workspace_id", workspaceId)
    .eq("email", email)
    .maybeSingle();

  if (existing) {
    const mergedTags = [...new Set([...(existing.tags || []), ...opts.tags])];
    await supabase
      .from("leads")
      .update({
        name: opts.name || undefined,
        phone: opts.phone || undefined,
        tags: mergedTags,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    return { leadId: existing.id, isNew: false };
  }

  const { data, error } = await supabase
    .from("leads")
    .insert({
      workspace_id: workspaceId,
      email,
      name: opts.name || null,
      phone: opts.phone || null,
      source: "LEAD_FORM",
      source_detail: opts.storefrontId || null,
      status: "NEW",
      tags: opts.tags.length > 0 ? opts.tags : null,
      product_id: opts.productId || null,
      opt_in_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) throw error;
  return { leadId: data.id, isNew: true };
}

async function sendWelcomeEmail(
  leadId: string,
  email: string,
  name: string | undefined,
  workspaceId: string,
): Promise<void> {
  const { data, error } = await supabase.functions.invoke("send-lead-email", {
    body: { name: name || null, email, workspaceId, leadId },
  });
  if (error) console.warn("[useLeadCapture] E-mail error:", error.message);
  else if (data && !data.success) console.warn("[useLeadCapture] E-mail não enviado:", data.message);
}

async function trackAnalytics(
  workspaceId: string,
  email: string,
  tags: string[],
  storefrontId?: string,
): Promise<void> {
  await supabase.from("analytics_events").insert({
    workspace_id: workspaceId,
    storefront_id: storefrontId || null,
    event_type: "LEAD_CAPTURED",
    metadata: { email, source: "LEAD_FORM", tags },
  });
}

// ── Hook ─────────────────────────────────────────────────────

export function useLeadCapture(options: UseLeadCaptureOptions): UseLeadCaptureReturn {
  const {
    workspaceId,
    storefrontId,
    tags = [],
    productId,
    successMessage = "Inscrição realizada com sucesso!",
    sendEmail = true,
    resetDelay = 5000,
  } = options;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const submittingRef = useRef(false); // previne duplo-clique

  const reset = useCallback(() => {
    setIsSuccess(false);
  }, []);

  const submit = useCallback(
    async (input: LeadInput) => {
      // Guard contra envios duplicados
      if (submittingRef.current) return;

      // Validação frontend
      const parsed = leadSchema.safeParse(input);
      if (!parsed.success) {
        const firstError = parsed.error.errors[0]?.message || "Dados inválidos";
        toast.error(firstError);
        return;
      }

      const { email: rawEmail, name, phone } = parsed.data;
      const email = rawEmail.toLowerCase();

      submittingRef.current = true;
      setIsSubmitting(true);

      try {
        // 1. Salvar lead
        const { leadId, isNew } = await upsertLead(email, workspaceId, {
          name,
          phone,
          tags,
          storefrontId,
          productId,
        });

        // 2. Enviar e-mail (fire-and-forget, apenas novos leads)
        if (isNew && sendEmail) {
          sendWelcomeEmail(leadId, email, name, workspaceId).catch(() => {});
        }

        // 3. Analytics (fire-and-forget)
        trackAnalytics(workspaceId, email, tags, storefrontId).catch(() => {});

        // 4. Sucesso
        setIsSuccess(true);
        toast.success(successMessage);

        // 5. Auto-reset
        if (resetDelay > 0) {
          setTimeout(reset, resetDelay);
        }
      } catch (error) {
        console.error("[useLeadCapture] Erro:", error);
        toast.error("Erro ao processar inscrição. Tente novamente.");
      } finally {
        setIsSubmitting(false);
        submittingRef.current = false;
      }
    },
    [workspaceId, storefrontId, tags, productId, sendEmail, successMessage, resetDelay, reset],
  );

  return { submit, isSubmitting, isSuccess, reset };
}
