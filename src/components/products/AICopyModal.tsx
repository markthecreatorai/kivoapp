import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Loader2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useWorkspace } from "@/contexts/WorkspaceProvider";

interface AICopyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  field: "name" | "shortDescription" | "description";
  productName?: string;
  onSelect: (text: string) => void;
}

const FIELD_LABELS: Record<string, string> = {
  name: "Nome do Produto",
  shortDescription: "Descrição Curta",
  description: "Descrição Completa",
};

export function AICopyModal({ open, onOpenChange, field, productName, onSelect }: AICopyModalProps) {
  const [niche, setNiche] = useState("");
  const [audience, setAudience] = useState("");
  const [benefits, setBenefits] = useState("");
  const [loading, setLoading] = useState(false);
  const [variations, setVariations] = useState<string[]>([]);
  const { currentWorkspace } = useWorkspace();

  const generate = async () => {
    if (!currentWorkspace?.id) {
      toast.error("Selecione um workspace antes de gerar com IA");
      return;
    }
    setLoading(true);
    setVariations([]);
    try {
      const { data, error } = await supabase.functions.invoke("ai-generate", {
        body: {
          type: "copy",
          workspace_id: currentWorkspace.id,
          context: { field, niche, audience, benefits, productName },
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setVariations(data.variations || []);
    } catch (err: any) {
      toast.error(err.message || "Erro ao gerar copy");
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (text: string) => {
    onSelect(text);
    onOpenChange(false);
    setVariations([]);
    toast.success("Copy aplicada!");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Gerar {FIELD_LABELS[field]} com IA
          </DialogTitle>
        </DialogHeader>

        {variations.length === 0 ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nicho / Área</Label>
              <Input
                placeholder="Ex: Marketing Digital, Fitness, Finanças..."
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Público-alvo</Label>
              <Input
                placeholder="Ex: Empreendedores iniciantes, mães que trabalham em casa..."
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Benefícios principais (2-3 pontos)</Label>
              <Textarea
                placeholder={"Ex:\n• Aprenda a vender online do zero\n• Método testado por 500+ alunos\n• Suporte por 1 ano"}
                rows={3}
                value={benefits}
                onChange={(e) => setBenefits(e.target.value)}
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                onClick={generate}
                disabled={loading || !niche.trim()}
                className="gap-2"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {loading ? "Gerando..." : "Gerar Variações"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Escolha uma das variações geradas:
            </p>
            {variations.map((v, i) => (
              <button
                key={i}
                onClick={() => handleSelect(v)}
                className="w-full text-left p-4 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors group"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-foreground whitespace-pre-wrap">{v}</p>
                  <Check className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
                </div>
              </button>
            ))}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={generate} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
                Gerar novamente
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setVariations([]);
                }}
              >
                Voltar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
