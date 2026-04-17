// =============================================================
// CollectEmailsFlowLegacy
//
// Renderizado quando a flag `lm_v2_state` está OFF.
// Mostra estado read-only do produto + aviso explícito para
// evitar perda silenciosa de edição. Usado como rollback
// emergencial do editor v2 sem precisar redeploy.
// =============================================================
import { useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CollectEmailsFlowLegacy({
  initialProduct,
}: {
  initialProduct: any;
  setSaving?: (v: boolean) => void;
}) {
  const navigate = useNavigate();
  const name = initialProduct?.name || "Sem título";
  const desc = initialProduct?.short_description || "";
  const cta = initialProduct?.listing_button_text || "Inscrever-se";
  const thumb = initialProduct?.thumbnail_url || "";

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div
        role="alert"
        className="flex items-start gap-3 rounded-2xl border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800/60 p-4"
      >
        <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
        <div className="space-y-1 text-sm">
          <p className="font-semibold text-amber-900 dark:text-amber-100">
            Editor v2 desativado
          </p>
          <p className="text-amber-800/90 dark:text-amber-200/80">
            A nova experiência do editor de Lead Magnet está temporariamente desligada
            (flag <code className="font-mono text-xs">lm_v2_state</code>). Suas alterações
            anteriores estão preservadas — entre em contato com o suporte para editar este
            produto ou aguarde a reativação.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-border/40 bg-card p-6 space-y-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Visualização (somente leitura)
        </p>
        {thumb ? (
          <img
            src={thumb}
            alt={name}
            className="w-full aspect-video object-cover rounded-xl bg-muted"
          />
        ) : (
          <div className="w-full aspect-video rounded-xl bg-muted/40 flex items-center justify-center text-muted-foreground text-xs">
            Sem capa
          </div>
        )}
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">{name}</h2>
          {desc && <p className="text-sm text-muted-foreground">{desc}</p>}
        </div>
        <Button disabled className="w-full" variant="secondary">
          {cta}
        </Button>
      </div>

      <div className="flex justify-center">
        <Button variant="outline" onClick={() => navigate("/store?tab=loja")}>
          Voltar para Minha Loja
        </Button>
      </div>
    </div>
  );
}
