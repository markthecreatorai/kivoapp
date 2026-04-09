// =============================================================
// LeadFormBlock — Formulário de captura de leads
// Fluxo: validação → salvar lead → enviar e-mail → analytics → sucesso
// =============================================================

import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CheckCircle, Loader2, Mail } from "lucide-react";
import { z } from "zod";

// ── Types ────────────────────────────────────────────────────
interface LeadFormConfig {
  headline?: string;
  description?: string;
  showName?: boolean;
  showPhone?: boolean;
  buttonText?: string;
  successMessage?: string;
  tags?: string[];
  productId?: string;
}

interface LeadFormBlockProps {
  config: LeadFormConfig;
  workspaceId: string;
  storefrontId?: string;
}

// ── Validation ───────────────────────────────────────────────
const emailSchema = z.string().trim().email("E-mail inválido");

// ── Helpers ──────────────────────────────────────────────────

/** Salva ou atualiza o lead no Supabase e retorna o ID */
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

/** Dispara o e-mail de boas-vindas via Edge Function */
async function sendWelcomeEmail(
  leadId: string,
  email: string,
  name: string | undefined,
  workspaceId: string,
): Promise<void> {
  const { data, error } = await supabase.functions.invoke("send-lead-email", {
    body: { name: name || null, email, workspaceId, leadId },
  });

  if (error) {
    console.warn("[LeadForm] Erro ao enviar e-mail:", error.message);
    return;
  }

  if (data && !data.success) {
    console.warn("[LeadForm] E-mail não enviado:", data.message);
  }
}

/** Registra evento de analytics */
async function trackLeadCaptured(
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

// ── Component ────────────────────────────────────────────────
export function LeadFormBlock({
  config,
  workspaceId,
  storefrontId,
}: LeadFormBlockProps) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const {
    headline = "Receba novidades",
    description = "Inscreva-se para receber conteúdos exclusivos",
    showName = true,
    showPhone = false,
    buttonText = "Inscrever-se",
    successMessage = "Inscrição realizada com sucesso!",
    tags = [],
    productId,
  } = config;

  const resetForm = useCallback(() => {
    setEmail("");
    setName("");
    setPhone("");
    setIsSuccess(false);
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      // 1. Validar e-mail
      const parsed = emailSchema.safeParse(email);
      if (!parsed.success) {
        toast.error("Por favor, insira um e-mail válido.");
        return;
      }

      const cleanEmail = parsed.data.toLowerCase();
      const cleanName = name.trim() || undefined;
      const cleanPhone = phone.trim() || undefined;

      setIsSubmitting(true);

      try {
        // 2. Salvar / atualizar lead
        const { leadId, isNew } = await upsertLead(cleanEmail, workspaceId, {
          name: cleanName,
          phone: cleanPhone,
          tags,
          storefrontId,
          productId,
        });

        // 3. Enviar e-mail de boas-vindas (apenas para novos leads)
        if (isNew) {
          // Fire-and-forget para não bloquear UX
          sendWelcomeEmail(leadId, cleanEmail, cleanName, workspaceId).catch(
            (err) => console.error("[LeadForm] Falha no envio do e-mail:", err),
          );
        }

        // 4. Registrar evento de analytics (fire-and-forget)
        trackLeadCaptured(workspaceId, cleanEmail, tags, storefrontId).catch(
          (err) => console.error("[LeadForm] Falha no analytics:", err),
        );

        // 5. Sucesso
        setIsSuccess(true);
        toast.success(successMessage);

        // 6. Reset após 5s
        setTimeout(resetForm, 5000);
      } catch (error) {
        console.error("[LeadForm] Erro ao capturar lead:", error);
        toast.error("Erro ao processar inscrição. Tente novamente.");
      } finally {
        setIsSubmitting(false);
      }
    },
    [email, name, phone, workspaceId, storefrontId, tags, productId, successMessage, resetForm],
  );

  // ── Estado de sucesso ────────────────────────────────────
  if (isSuccess) {
    return (
      <div className="bg-card rounded-xl p-8 text-center animate-in fade-in-0 zoom-in-95 duration-300">
        <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-primary/10 mb-4">
          <CheckCircle className="h-8 w-8 text-primary" />
        </div>
        <h3 className="text-xl font-semibold mb-2">Obrigado!</h3>
        <p className="text-muted-foreground">{successMessage}</p>
      </div>
    );
  }

  // ── Formulário ───────────────────────────────────────────
  return (
    <div className="bg-card rounded-xl p-8">
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-primary/10 mb-3">
          <Mail className="h-5 w-5 text-primary" />
        </div>
        <h3 className="text-xl font-semibold mb-2">{headline}</h3>
        {description && (
          <p className="text-muted-foreground">{description}</p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto">
        {showName && (
          <div className="space-y-1.5">
            <Label htmlFor="lead-name">Nome</Label>
            <Input
              id="lead-name"
              type="text"
              placeholder="Seu nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting}
              autoComplete="given-name"
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="lead-email">E-mail *</Label>
          <Input
            id="lead-email"
            type="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isSubmitting}
            autoComplete="email"
          />
        </div>

        {showPhone && (
          <div className="space-y-1.5">
            <Label htmlFor="lead-phone">WhatsApp</Label>
            <Input
              id="lead-phone"
              type="tel"
              placeholder="(00) 00000-0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={isSubmitting}
              autoComplete="tel"
            />
          </div>
        )}

        <Button
          type="submit"
          className="w-full"
          disabled={isSubmitting}
          size="lg"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Enviando...
            </>
          ) : (
            buttonText
          )}
        </Button>

        <p className="text-xs text-center text-muted-foreground">
          Ao se inscrever, você concorda em receber nossos e-mails.
        </p>
      </form>
    </div>
  );
}
