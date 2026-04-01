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
type BillingOptions = "monthly_only" | "monthly_and_annual" | "annual_only";

const MODELS: { value: PricingModel; label: string; desc: string }[] = [
  { value: "free", label: "Free", desc: "Free to join" },
  { value: "subscription", label: "Subscription", desc: "Charge monthly, annual, or both" },
  { value: "freemium", label: "Freemium", desc: "Free to join with 1-2 paid upgrade tiers" },
  { value: "tiers", label: "Tiers", desc: "2-3 paid tiers" },
  { value: "one_time", label: "1-time", desc: "1-time payment" },
];

export default function AdminPricingTab({ community }: Props) {
  const queryClient = useQueryClient();

  const [model, setModel] = useState<PricingModel>(
    (community.pricing_model as PricingModel) || "free"
  );
  const [priceMonthly, setPriceMonthly] = useState(
    community.price_monthly_cents ? (community.price_monthly_cents / 100).toFixed(0) : ""
  );
  const [priceYearly, setPriceYearly] = useState(
    community.price_yearly_cents ? (community.price_yearly_cents / 100).toFixed(0) : ""
  );
  const [billingOptions, setBillingOptions] = useState<BillingOptions>(
    (community.billing_options as BillingOptions) || "monthly_and_annual"
  );
  const [freeTrial, setFreeTrial] = useState(community.free_trial_days > 0);
  const [priceModalOpen, setPriceModalOpen] = useState(false);

  // Temp state inside modal (only applied on SET)
  const [tempMonthly, setTempMonthly] = useState(priceMonthly);
  const [tempYearly, setTempYearly] = useState(priceYearly);
  const [tempBilling, setTempBilling] = useState<BillingOptions>(billingOptions);

  const saveAll = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("communities").update({
        pricing_model: model,
        price_monthly_cents: Math.round(parseFloat(priceMonthly || "0") * 100),
        price_yearly_cents: Math.round(parseFloat(priceYearly || "0") * 100),
        billing_options: billingOptions,
        free_trial_days: freeTrial ? 7 : 0,
      } as any).eq("id", community.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community"] });
      toast.success("Configuração de preço salva!");
    },
    onError: () => toast.error("Erro ao salvar"),
  });

  const hasPrice = model !== "free" && (parseFloat(priceMonthly) > 0 || parseFloat(priceYearly) > 0);

  const pricingReady =
    model === "free" ||
    (model === "subscription" && parseFloat(priceMonthly) > 0) ||
    ((model === "tiers" || model === "freemium" || model === "one_time") && hasPrice);

  const modelPreview = {
    free: "Jornada: visitante entra direto sem checkout.",
    subscription: "Jornada: landing -> plano -> checkout recorrente.",
    freemium: "Jornada: entrada grátis + upgrades pagos.",
    tiers: "Jornada: escolha entre 2-3 planos pagos.",
    one_time: "Jornada: pagamento único para acesso.",
  }[model];

  const formatPrice = () => {
    if (!hasPrice) return null;
    const parts = [];
    if (billingOptions !== "annual_only" && priceMonthly)
      parts.push(`$${parseFloat(priceMonthly).toFixed(0)}/month`);
    if (billingOptions !== "monthly_only" && priceYearly)
      parts.push(`$${parseFloat(priceYearly).toFixed(0)}/year`);
    return parts.join(" or ");
  };

  const openPriceModal = () => {
    setTempMonthly(priceMonthly);
    setTempYearly(priceYearly);
    setTempBilling(billingOptions);
    setPriceModalOpen(true);
  };

  const handleSetPrice = () => {
    setPriceMonthly(tempMonthly);
    setPriceYearly(tempYearly);
    setBillingOptions(tempBilling);
    setPriceModalOpen(false);
    // Auto-save after setting price
    setTimeout(() => saveAll.mutate(), 50);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Model</h2>
        <Button
          onClick={() => saveAll.mutate()}
          disabled={saveAll.isPending}
          className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold tracking-wide text-sm"
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
                ? "border-blue-500 bg-blue-50/50"
                : "border-gray-200 hover:border-gray-300 bg-white"
            )}
          >
            <div className={cn(
              "w-4 h-4 rounded-full border-2 mb-2 flex items-center justify-center",
              model === m.value ? "border-blue-500" : "border-gray-300"
            )}>
              {model === m.value && <div className="w-2 h-2 rounded-full bg-blue-500" />}
            </div>
            <span className="text-sm font-semibold text-gray-900">{m.label}</span>
            <span className="text-[11px] text-gray-400 leading-tight mt-0.5">{m.desc}</span>
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-1">
        <p className="text-xs text-gray-500">Prévia da jornada</p>
        <p className="text-sm text-gray-800">{modelPreview}</p>
        <p className={`text-xs ${pricingReady ? "text-emerald-600" : "text-amber-600"}`}>
          {pricingReady ? "Configuração pronta para publicar." : "Complete preços/regras para publicar esse modelo."}
        </p>
      </div>

      {/* Set price button (shows when not free) */}
      {model !== "free" && (
        <button
          onClick={openPriceModal}
          className="flex items-center gap-3 w-full p-4 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-200 text-left transition-all group"
        >
          <Tag className="h-5 w-5 text-gray-500 group-hover:text-gray-700" />
          <div className="flex-1">
            <span className="text-sm font-medium text-gray-900">Set price</span>
            {hasPrice && (
              <p className="text-xs text-gray-500 mt-0.5">{formatPrice()}</p>
            )}
          </div>
          <span className="text-xs text-gray-400 group-hover:text-gray-600">Edit →</span>
        </button>
      )}

      {/* Free trial toggle */}
      {model !== "free" && (
        <div className="flex items-center gap-3">
          <Switch
            checked={freeTrial}
            onCheckedChange={setFreeTrial}
          />
          <span className="text-sm text-gray-700">7-day free trial</span>
        </div>
      )}

      {/* ── Set Price Modal (own overlay, not shadcn Dialog) ── */}
      {priceModalOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setPriceModalOpen(false); }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-gray-900">Set price</h3>

            <div className="space-y-3">
              {/* Monthly price */}
              {tempBilling !== "annual_only" && (
                <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden">
                  <span className="px-4 py-3 text-sm text-gray-500 bg-gray-50 border-r border-gray-200">$</span>
                  <input
                    type="number"
                    value={tempMonthly}
                    onChange={(e) => setTempMonthly(e.target.value)}
                    placeholder="0"
                    className="flex-1 px-4 py-3 text-sm outline-none"
                  />
                  <span className="px-4 py-3 text-sm text-gray-400 bg-gray-50 border-l border-gray-200">
                    /month
                  </span>
                </div>
              )}

              {/* Yearly price */}
              {tempBilling !== "monthly_only" && (
                <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden">
                  <span className="px-4 py-3 text-sm text-gray-500 bg-gray-50 border-r border-gray-200">$</span>
                  <input
                    type="number"
                    value={tempYearly}
                    onChange={(e) => setTempYearly(e.target.value)}
                    placeholder="0"
                    className="flex-1 px-4 py-3 text-sm outline-none"
                  />
                  <span className="px-4 py-3 text-sm text-gray-400 bg-gray-50 border-l border-gray-200">
                    /year
                  </span>
                </div>
              )}

              {/* Tip */}
              <p className="text-xs text-gray-400">
                Tip: Customers expect a 20% discount when paying annually.
                Prices are in USD, but payouts will be in your local currency.
              </p>

              {/* Billing options */}
              <div className="space-y-2.5">
                {(
                  [
                    { value: "monthly_only", label: "Monthly only" },
                    { value: "monthly_and_annual", label: "Monthly and annual" },
                    { value: "annual_only", label: "Annual only" },
                  ] as { value: BillingOptions; label: string }[]
                ).map((opt) => (
                  <label
                    key={opt.value}
                    className="flex items-center gap-3 cursor-pointer"
                    onClick={() => setTempBilling(opt.value)}
                  >
                    <div
                      className={cn(
                        "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors shrink-0",
                        tempBilling === opt.value ? "border-blue-500" : "border-gray-300"
                      )}
                    >
                      {tempBilling === opt.value && (
                        <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                      )}
                    </div>
                    <span className="text-sm text-gray-700">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setPriceModalOpen(false)}
                className="text-sm font-semibold text-gray-500 hover:text-gray-700 tracking-wide px-4 py-2"
              >
                CANCEL
              </button>
              <button
                onClick={handleSetPrice}
                className="text-sm font-semibold text-gray-600 bg-gray-200 hover:bg-gray-300 tracking-wide px-5 py-2 rounded-lg transition-colors"
              >
                SET
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
