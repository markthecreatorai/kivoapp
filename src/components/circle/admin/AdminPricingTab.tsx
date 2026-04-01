import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tag } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  community: any;
}

type PricingModel = "free" | "subscription" | "freemium" | "tiers" | "one_time";
type BillingPeriod = "monthly" | "quarterly" | "yearly";

const MODELS: { value: PricingModel; label: string; desc: string }[] = [
  { value: "free", label: "Free", desc: "Free to join" },
  { value: "subscription", label: "Subscription", desc: "Charge monthly, quarterly, or yearly" },
  { value: "freemium", label: "Freemium", desc: "Free to join with paid upgrade tiers" },
  { value: "tiers", label: "Tiers", desc: "2-3 paid tiers" },
  { value: "one_time", label: "1-time", desc: "1-time payment" },
];

/**
 * Derive frontend pricing model from real DB columns.
 */
function derivePricingModel(community: any): PricingModel {
  const accessType = community.access_type;
  const billingPeriod = community.billing_period;
  const linkedProduct = community.linked_product_id;

  if (accessType === "OPEN") return "free";
  if (accessType === "PAID_SUBSCRIPTION") {
    return billingPeriod === "one_time" ? "one_time" : "subscription";
  }
  if (accessType === "FREE_WITH_PRODUCT" && linkedProduct) {
    // We can't distinguish freemium vs tiers from DB alone; default to freemium
    return "freemium";
  }
  return "free";
}

export default function AdminPricingTab({ community }: Props) {
  const queryClient = useQueryClient();

  const [model, setModel] = useState<PricingModel>(derivePricingModel(community));
  const [priceCents, setPriceCents] = useState(
    community.price_cents > 0 ? String(community.price_cents / 100) : ""
  );
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>(
    (community.billing_period as BillingPeriod) || "monthly"
  );

  // For freemium/tiers: linked_product_id
  const [linkedProductId, setLinkedProductId] = useState<string>(
    community.linked_product_id || ""
  );

  // Price modal state
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
        p_linked_product_id: (model === "freemium" || model === "tiers") && linkedProductId
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
      const msg = err?.message || "Erro ao salvar";
      toast.error(msg);
    },
  });

  const cents = Math.round(parseFloat(priceCents || "0") * 100);
  const hasPrice = model !== "free" && cents > 0;

  const pricingReady =
    model === "free" ||
    ((model === "subscription" || model === "one_time") && cents > 0) ||
    ((model === "freemium" || model === "tiers") && !!linkedProductId);

  const modelPreview: Record<PricingModel, string> = {
    free: "Jornada: visitante entra direto sem checkout.",
    subscription: "Jornada: landing → plano → checkout recorrente.",
    freemium: "Jornada: entrada grátis + upgrades pagos.",
    tiers: "Jornada: escolha entre 2-3 planos pagos.",
    one_time: "Jornada: pagamento único para acesso.",
  };

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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">Model</h2>
        <Button
          onClick={() => saveAll.mutate()}
          disabled={saveAll.isPending || !pricingReady}
          className="bg-muted hover:bg-muted/80 text-muted-foreground font-semibold tracking-wide text-sm"
          size="sm"
        >
          SAVE
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
            <div className={cn(
              "w-4 h-4 rounded-full border-2 mb-2 flex items-center justify-center",
              model === m.value ? "border-primary" : "border-muted-foreground/30"
            )}>
              {model === m.value && <div className="w-2 h-2 rounded-full bg-primary" />}
            </div>
            <span className="text-sm font-semibold text-foreground">{m.label}</span>
            <span className="text-[11px] text-muted-foreground leading-tight mt-0.5">{m.desc}</span>
          </button>
        ))}
      </div>

      {/* Preview */}
      <div className="rounded-xl border border-border bg-muted/50 p-3 space-y-1">
        <p className="text-xs text-muted-foreground">Prévia da jornada</p>
        <p className="text-sm text-foreground">{modelPreview[model]}</p>
        <p className={`text-xs ${pricingReady ? "text-emerald-600" : "text-amber-600"}`}>
          {pricingReady ? "Configuração pronta para publicar." : "Complete preços/regras para publicar esse modelo."}
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
          <span className="text-xs text-muted-foreground group-hover:text-foreground">Editar →</span>
        </button>
      )}

      {/* Linked product for freemium/tiers (placeholder) */}
      {(model === "freemium" || model === "tiers") && (
        <div className="rounded-xl border border-border bg-muted/50 p-4 space-y-2">
          <p className="text-sm font-medium text-foreground">Produto vinculado</p>
          <p className="text-xs text-muted-foreground">
            Selecione o produto que dá acesso aos tiers pagos.
          </p>
          <input
            type="text"
            value={linkedProductId}
            onChange={(e) => setLinkedProductId(e.target.value)}
            placeholder="ID do produto (UUID)"
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background outline-none"
          />
        </div>
      )}

      {/* ── Set Price Modal ── */}
      {priceModalOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setPriceModalOpen(false); }}
        >
          <div
            className="bg-background rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-foreground">Definir preço</h3>

            <div className="space-y-3">
              {/* Price input */}
              <div className="flex items-center border border-border rounded-xl overflow-hidden">
                <span className="px-4 py-3 text-sm text-muted-foreground bg-muted border-r border-border">R$</span>
                <input
                  type="number"
                  value={tempPrice}
                  onChange={(e) => setTempPrice(e.target.value)}
                  placeholder="0"
                  className="flex-1 px-4 py-3 text-sm outline-none bg-background"
                />
                {model === "one_time" ? (
                  <span className="px-4 py-3 text-sm text-muted-foreground bg-muted border-l border-border">único</span>
                ) : (
                  <span className="px-4 py-3 text-sm text-muted-foreground bg-muted border-l border-border">
                    /{tempBilling === "monthly" ? "mês" : tempBilling === "quarterly" ? "tri" : "ano"}
                  </span>
                )}
              </div>

              {/* Billing period (subscription only) */}
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
                          tempBilling === opt.value ? "border-primary" : "border-muted-foreground/30"
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

            {/* Actions */}
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
