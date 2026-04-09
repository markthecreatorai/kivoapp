// =============================================================
// LeadFormBlock — Formulário de captura de leads (UI pura)
// Toda lógica de negócio está no hook useLeadCapture.
// =============================================================

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle, Loader2, Mail } from "lucide-react";
import { useLeadCapture } from "@/hooks/useLeadCapture";

// ── Types ────────────────────────────────────────────────────
interface LeadFormBlockProps {
  config: {
    headline?: string;
    description?: string;
    showName?: boolean;
    showPhone?: boolean;
    buttonText?: string;
    successMessage?: string;
    tags?: string[];
    productId?: string;
  };
  workspaceId: string;
  storefrontId?: string;
}

// ── Component ────────────────────────────────────────────────
export function LeadFormBlock({
  config,
  workspaceId,
  storefrontId,
}: LeadFormBlockProps) {
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

  // Form state (UI only)
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  // Business logic via hook
  const { submit, isSubmitting, isSuccess } = useLeadCapture({
    workspaceId,
    storefrontId,
    tags,
    productId,
    successMessage,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submit({
      email,
      name: name || undefined,
      phone: phone || undefined,
    });
    // Limpar campos ao submeter com sucesso
    if (!isSubmitting) {
      setEmail("");
      setName("");
      setPhone("");
    }
  };

  // ── Estado de sucesso ──────────────────────────────────
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

  // ── Formulário ─────────────────────────────────────────
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
              maxLength={100}
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
            maxLength={255}
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
              maxLength={20}
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
