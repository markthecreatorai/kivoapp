import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Lightbulb, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useWorkspace } from "@/contexts/WorkspaceProvider";

interface Props {
  productType: string;
  productName?: string;
  productDescription?: string;
}

export function AIPriceSuggestion({ productType, productName, productDescription }: Props) {
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<{ min: number; max: number; justification: string } | null>(null);
  const { currentWorkspace } = useWorkspace();

  const getSuggestion = async () => {
    if (!currentWorkspace?.id) {
      toast.error("Selecione um workspace antes de gerar com IA");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-generate", {
        body: {
          type: "price",
          workspace_id: currentWorkspace.id,
          context: {
            productType,
            niche: productName || "",
            description: productDescription || productName || "",
          },
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSuggestion(data);
    } catch (err: any) {
      toast.error(err.message || "Erro ao buscar sugestão");
    } finally {
      setLoading(false);
    }
  };

  if (suggestion) {
    return (
      <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <Lightbulb className="h-4 w-4" />
            Sugestão de Preço
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSuggestion(null)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
        <p className="text-sm text-foreground font-semibold">
          Creators no seu nicho vendem produtos similares entre R${suggestion.min} e R${suggestion.max}
        </p>
        <p className="text-xs text-muted-foreground">{suggestion.justification}</p>
      </div>
    );
  }

  return (
    <Button
      variant="link"
      size="sm"
      className="gap-1 p-0 h-auto text-xs text-muted-foreground hover:text-primary"
      onClick={getSuggestion}
      disabled={loading}
    >
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Lightbulb className="h-3 w-3" />}
      {loading ? "Analisando..." : "💡 Sugestão de preço com IA"}
    </Button>
  );
}
