import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CheckCircle, Loader2 } from "lucide-react";
import { z } from "zod";

interface LeadFormBlockProps {
  config: {
    headline?: string;
    description?: string;
    showName?: boolean;
    showPhone?: boolean;
    buttonText?: string;
    successMessage?: string;
    tags?: string[];
    productId?: string; // For lead magnets
  };
  workspaceId: string;
  storefrontId?: string;
}

const emailSchema = z.string().email("Email inválido");

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate email
    try {
      emailSchema.parse(email);
    } catch {
      toast.error("Por favor, insira um email válido");
      return;
    }

    setIsSubmitting(true);

    try {
      // Check if lead already exists
      const { data: existingLead } = await supabase
        .from("leads")
        .select("id, tags")
        .eq("workspace_id", workspaceId)
        .eq("email", email.toLowerCase())
        .maybeSingle();

      if (existingLead) {
        // Update existing lead - merge tags
        const existingTags = existingLead.tags || [];
        const mergedTags = [...new Set([...existingTags, ...tags])];
        
        await supabase
          .from("leads")
          .update({
            name: name || undefined,
            phone: phone || undefined,
            tags: mergedTags,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingLead.id);
      } else {
        // Insert new lead
        const { data: newLead, error: insertError } = await supabase.from("leads").insert({
          workspace_id: workspaceId,
          email: email.toLowerCase(),
          name: name || null,
          phone: phone || null,
          source: "LEAD_FORM",
          source_detail: storefrontId || null,
          status: "NEW",
          tags: tags.length > 0 ? tags : null,
          product_id: productId || null,
          opt_in_at: new Date().toISOString(),
        }).select("id").single();

        if (insertError) throw insertError;

        // Send welcome email via Edge Function
        if (newLead?.id) {
          supabase.functions.invoke("send-lead-email", {
            body: {
              name: name || null,
              email: email.toLowerCase(),
              workspaceId,
              leadId: newLead.id,
            },
          }).catch((err) => console.error("Error sending lead email:", err));
        }
      }

      // Register analytics event
      await supabase.from("analytics_events").insert({
        workspace_id: workspaceId,
        storefront_id: storefrontId || null,
        event_type: "LEAD_CAPTURED",
        metadata: {
          email: email.toLowerCase(),
          source: "LEAD_FORM",
          tags,
        },
      });

      setIsSuccess(true);
      toast.success(successMessage);
      
      // Reset form after delay
      setTimeout(() => {
        setEmail("");
        setName("");
        setPhone("");
        setIsSuccess(false);
      }, 5000);
    } catch (error) {
      console.error("Error capturing lead:", error);
      toast.error("Erro ao processar inscrição. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="bg-card rounded-xl p-8 text-center">
        <CheckCircle className="h-12 w-12 mx-auto text-primary mb-4" />
        <h3 className="text-xl font-semibold mb-2">Obrigado!</h3>
        <p className="text-muted-foreground">{successMessage}</p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl p-8">
      <div className="text-center mb-6">
        <h3 className="text-xl font-semibold mb-2">{headline}</h3>
        {description && (
          <p className="text-muted-foreground">{description}</p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto">
        {showName && (
          <div>
            <Label htmlFor="lead-name">Nome</Label>
            <Input
              id="lead-name"
              type="text"
              placeholder="Seu nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting}
            />
          </div>
        )}

        <div>
          <Label htmlFor="lead-email">Email *</Label>
          <Input
            id="lead-email"
            type="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isSubmitting}
          />
        </div>

        {showPhone && (
          <div>
            <Label htmlFor="lead-phone">WhatsApp</Label>
            <Input
              id="lead-phone"
              type="tel"
              placeholder="(00) 00000-0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={isSubmitting}
            />
          </div>
        )}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
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
          Ao se inscrever, você concorda em receber nossos emails.
        </p>
      </form>
    </div>
  );
}
