import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tag, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import LinkedProductSelector from "./LinkedProductSelector";

interface Props {
  community: any;
}

type PricingModel = "free" | "subscription" | "freemium" | "tiers" | "one_time";
type BillingPeriod = "monthly" | "quarterly" | "yearly";

const MODELS: { value: PricingModel; label: string; desc: string }[] = [
  { value: "free", label: "Grátis", desc: "Qualquer pessoa entra sem pagar." },
  { value: "subscription", label: "Assinatura", desc: "Cobra mensalidade, trimestral ou anual." },
  { value: "freemium", label: "Freemium", desc: "Entrada grátis com upgrade premium via produto." },
  { value: "tiers", label: "Níveis", desc: "Acesso por níveis vinculados a produtos da loja." },
  { value: "one_time", label: "Pagamento único", desc: "Cobra uma vez só para acesso vitalício." },
];

function derivePricingModel(community: any): PricingModel {
  const accessType = community.access_type;
  const billingPeriod = community.billing_period;
  const linkedProduct = community.linked_product_id;

  if (accessType === "OPEN") return "free";
  if (accessType === "PAID_SUBSCRIPTION") {
    return billingPeriod === "one_time" ? "one_time" : "subscription";
  }
  if (accessType === "FREE_WITH_PRODUCT" && linkedProduct) return "freemium";
  return "free";
}

const modelPreview: Record<PricingModel, string> = {
  free: "Visitantes entram direto, sem checkout.",
  subscription: "Visitante vê a landing → escolhe plano → paga recorrente → acessa.",
  freemium: "Visitante entra de graça. Para desbloquear conteúdo premium, compra o produto vinculado.",
  tiers: "Visitante escolhe um nível (produto). Cada nível libera benefícios diferentes.",
  one_time: "Visitante paga uma vez e recebe acesso permanente.",
};

export default function AdminPricingTab({ community }: Props) {
  const queryClient = useQueryClient();

  const [model, setModel] = useState<PricingModel>(derivePricingModel(community));
  const [priceCents, setPriceCents] = useState(
    community.price_cents > 0 ? String(community.price_cents / 100) : ""
  );
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>(
    (community.billing_period as BillingPeriod) || "monthly"
  );
  const [linkedProductId, setLinkedProductId] = useState<string>(
    community.linked_product_id || ""
  );

  const [priceModalOpen, setPriceModalOpen] = useState(false);
  const [tempPrice, setTempPrice] = useState(priceCents);
  const [tempBilling, setTempBilling] = useState<BillingPeriod>(billingPeriod);

  const saveAll = useMutation({
    mutationFn: async () => {
      const cents = Math.round(parseFloat(priceCents || "0") * 100);
      const { error } = await supabase.rpc("set_community_pricing_model", {
        p_community_id: community.id,
        p_model: model,
        p_price_cents: model === "subscription" || model === "one_time" ? cents : null,
        p_billing_period: model === "subscription" ? billingPeriod : null,
        p_linked_product_id:
          (model === "freemium" || model === "tiers") && linkedProductId
            ? linkedProductId
            : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community"] });
      toast.success("Configuração de preço salva!");
    },
    onError: (err: any) => {
      toast.error(err?.message || "Erro ao salvar");
    },
  });

  const cents = Math.round(parseFloat(priceCents || "0") * 100);
  const hasPrice = model !== "free" && cents > 0;

  const pricingReady =
    model === "free" ||
    ((model === "subscription" || model === "one_time") && cents > 0) ||
    ((model === "freemium" || model === "tiers") && !!linkedProductId);

  const formatPrice = () => {
    if (!hasPrice) return null;
    const val = parseFloat(priceCents).toFixed(0);
    if (model === "one_time") return `R$${val} (único)`;
    return `R$${val}/${billingPeriod === "monthly" ? "mês" : billingPeriod === "quarterly" ? "trimestre" : "ano"}`;
  };

  const openPriceModal = () => {
    setTempPrice(priceCents);
    setTempBilling(billingPeriod);
    setPriceModalOpen(true);
  };

  const handleSetPrice = () => {
    setPriceCents(tempPrice);
    setBillingPeriod(tempBilling);
    setPriceModalOpen(false);
    setTimeout(() => saveAll.mutate(), 50);
  };

  const needsLinkedProduct = model === "freemium" || model === "tiers";

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">Modelo de preço</h2>
        <Button
          onClick={() => saveAll.mutate()}
          disabled={saveAll.isPending || !pricingReady}
          className="bg-muted hover:bg-muted/80 text-muted-foreground font-semibold tracking-wide text-sm"
          size="sm"
        >
          SALVAR
        </Button>
      </div>

      {/* Model Radio Cards */}
      <div className="grid grid-cols-5 gap-2">
        {MODELS.map((m) => (
          <button
            key={m.value}
            onClick={() => setModel(m.value)}
            className={cn(
              "flex flex-col items-start p-3.5 rounded-xl border-2 text-left transition-all",
              model === m.value
                ? "border-primary bg-primary/5"
                : "border-border hover:border-border/80 bg-background"
            )}
          >
            <div
              className={cn(
                "w-4 h-4 rounded-full border-2 mb-2 flex items-center justify-center",
                model === m.value ? "border-primary" : "border-muted-foreground/30"
              )}
            >
              {model === m.value && <div className="w-2 h-2 rounded-full bg-primary" />}
            </div>
            <span className="text-sm font-semibold text-foreground">{m.label}</span>
            <span className="text-[11px] text-muted-foreground leading-tight mt-0.5">
              {m.desc}
            </span>
          </button>
        ))}
      </div>

      {/* Preview */}
      <div className="rounded-xl border border-border bg-muted/50 p-3 space-y-1">
        <p className="text-xs text-muted-foreground">Como funciona</p>
        <p className="text-sm text-foreground">{modelPreview[model]}</p>
        <p className={`text-xs ${pricingReady ? "text-emerald-600" : "text-amber-600"}`}>
          {pricingReady
            ? "Tudo pronto para publicar."
            : "Complete a configuração abaixo para publicar."}
        </p>
      </div>

      {/* Set price button (subscription / one_time) */}
      {(model === "subscription" || model === "one_time") && (
        <button
          onClick={openPriceModal}
          className="flex items-center gap-3 w-full p-4 bg-muted/50 hover:bg-muted rounded-xl border border-border text-left transition-all group"
        >
          <Tag className="h-5 w-5 text-muted-foreground group-hover:text-foreground" />
          <div className="flex-1">
            <span className="text-sm font-medium text-foreground">Definir preço</span>
            {hasPrice && (
              <p className="text-xs text-muted-foreground mt-0.5">{formatPrice()}</p>
            )}
          </div>
          <span className="text-xs text-muted-foreground group-hover:text-foreground">
            Editar →
          </span>
        </button>
      )}

      {/* Linked product for freemium/tiers */}
      {needsLinkedProduct && (
        <div className="rounded-xl border border-border bg-muted/50 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground">Produto vinculado</p>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="text-xs">
                    Selecione o produto que libera acesso a esta comunidade. Quem tiver esse
                    produto entra automaticamente.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <p className="text-xs text-muted-foreground">
            {model === "freemium"
              ? "O produto escolhido desbloqueia conteúdo premium para membros que já entraram de graça."
              : "Cada produto vinculado representa um nível de acesso com benefícios diferentes."}
          </p>

          <LinkedProductSelector
            workspaceId={community.workspace_id}
            value={linkedProductId}
            onChange={setLinkedProductId}
          />
        </div>
      )}

      {/* ── Set Price Modal ── */}
      {priceModalOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setPriceModalOpen(false);
          }}
        >
          <div
            className="bg-background rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-foreground">Definir preço</h3>

            <div className="space-y-3">
              <div className="flex items-center border border-border rounded-xl overflow-hidden">
                <span className="px-4 py-3 text-sm text-muted-foreground bg-muted border-r border-border">
                  R$
                </span>
                <input
                  type="number"
                  value={tempPrice}
                  onChange={(e) => setTempPrice(e.target.value)}
                  placeholder="0"
                  className="flex-1 px-4 py-3 text-sm outline-none bg-background"
                />
                {model === "one_time" ? (
                  <span className="px-4 py-3 text-sm text-muted-foreground bg-muted border-l border-border">
                    único
                  </span>
                ) : (
                  <span className="px-4 py-3 text-sm text-muted-foreground bg-muted border-l border-border">
                    /
                    {tempBilling === "monthly"
                      ? "mês"
                      : tempBilling === "quarterly"
                        ? "tri"
                        : "ano"}
                  </span>
                )}
              </div>

              {model === "subscription" && (
                <div className="space-y-2.5">
                  {(
                    [
                      { value: "monthly", label: "Mensal" },
                      { value: "quarterly", label: "Trimestral" },
                      { value: "yearly", label: "Anual" },
                    ] as { value: BillingPeriod; label: string }[]
                  ).map((opt) => (
                    <label
                      key={opt.value}
                      className="flex items-center gap-3 cursor-pointer"
                      onClick={() => setTempBilling(opt.value)}
                    >
                      <div
                        className={cn(
                          "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors shrink-0",
                          tempBilling === opt.value
                            ? "border-primary"
                            : "border-muted-foreground/30"
                        )}
                      >
                        {tempBilling === opt.value && (
                          <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                        )}
                      </div>
                      <span className="text-sm text-foreground">{opt.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setPriceModalOpen(false)}
                className="text-sm font-semibold text-muted-foreground hover:text-foreground tracking-wide px-4 py-2"
              >
                CANCELAR
              </button>
              <button
                onClick={handleSetPrice}
                className="text-sm font-semibold text-muted-foreground bg-muted hover:bg-muted/80 tracking-wide px-5 py-2 rounded-lg transition-colors"
              >
                DEFINIR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
