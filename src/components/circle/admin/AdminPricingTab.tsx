import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Globe, CreditCard, Gift, Layers, Banknote, Plus, Trash2, GripVertical,
  HelpCircle, Loader2, Package, Search, ExternalLink, X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

interface Props {
  community: any;
}

type PricingModel = "free" | "subscription" | "freemium" | "tiers" | "one_time";

interface TierDraft {
  key: string;
  name: string;
  is_free: boolean;
  price_cents: number;
  billing_period: string;
  linked_product_id: string;
  benefits: { label: string }[];
}

const MODELS: { value: PricingModel; label: string; desc: string; icon: any }[] = [
  { value: "free", label: "Grátis", desc: "Qualquer pessoa entra sem pagar.", icon: Globe },
  { value: "subscription", label: "Assinatura", desc: "Cobra recorrente para acessar.", icon: CreditCard },
  { value: "freemium", label: "Freemium", desc: "Entrada grátis + upgrade premium.", icon: Gift },
  { value: "tiers", label: "Níveis", desc: "Múltiplos planos com benefícios.", icon: Layers },
  { value: "one_time", label: "Pagamento único", desc: "Paga uma vez, acesso vitalício.", icon: Banknote },
];

const modelPreview: Record<PricingModel, string> = {
  free: "Visitantes entram direto, sem checkout.",
  subscription: "Visitante vê a landing → escolhe plano → paga recorrente → acessa.",
  freemium: "Visitante entra de graça. Para premium, compra o produto vinculado ao tier.",
  tiers: "Visitante escolhe um nível. Cada nível libera benefícios diferentes.",
  one_time: "Visitante paga uma vez e recebe acesso permanente.",
};

function derivePricingModel(community: any, dbTiers?: any[]): PricingModel {
  // If we have active tiers from DB, derive from them
  if (dbTiers && dbTiers.length > 0) {
    const freeCount = dbTiers.filter((t: any) => t.is_free).length;
    const paidCount = dbTiers.filter((t: any) => !t.is_free).length;
    const hasOneTime = dbTiers.some((t: any) => t.billing_period === 'one_time');

    if (paidCount === 0 && freeCount >= 1) return "free";
    if (paidCount === 1 && freeCount === 0 && hasOneTime) return "one_time";
    if (paidCount === 1 && freeCount === 0) return "subscription";
    if (freeCount >= 1 && paidCount >= 1 && paidCount <= 2) return "freemium";
    if (paidCount >= 2) return "tiers";
  }

  // Fallback: derive from legacy columns
  const at = community.access_type;
  const bp = community.billing_period;
  const lp = community.linked_product_id;
  if (at === "OPEN") return "free";
  if (at === "PAID_SUBSCRIPTION") return bp === "one_time" ? "one_time" : "subscription";
  if (at === "FREE_WITH_PRODUCT" && lp) return "freemium";
  return "free";
}

function defaultTiersForModel(model: PricingModel): TierDraft[] {
  const k = () => crypto.randomUUID();
  switch (model) {
    case "free":
      return [{ key: k(), name: "Standard", is_free: true, price_cents: 0, billing_period: "", linked_product_id: "", benefits: [{ label: "Acesso à comunidade" }, { label: "Feed e eventos" }] }];
    case "subscription":
      return [{ key: k(), name: "Membro", is_free: false, price_cents: 2990, billing_period: "monthly", linked_product_id: "", benefits: [{ label: "Acesso completo" }] }];
    case "one_time":
      return [{ key: k(), name: "Acesso vitalício", is_free: false, price_cents: 9900, billing_period: "one_time", linked_product_id: "", benefits: [{ label: "Acesso permanente" }] }];
    case "freemium":
      return [
        { key: k(), name: "Free", is_free: true, price_cents: 0, billing_period: "", linked_product_id: "", benefits: [{ label: "Acesso básico" }] },
        { key: k(), name: "Premium", is_free: false, price_cents: 4990, billing_period: "monthly", linked_product_id: "", benefits: [{ label: "Conteúdo exclusivo" }, { label: "Cursos premium" }] },
      ];
    case "tiers":
      return [
        { key: k(), name: "Básico", is_free: false, price_cents: 2990, billing_period: "monthly", linked_product_id: "", benefits: [{ label: "Acesso ao feed" }] },
        { key: k(), name: "Pro", is_free: false, price_cents: 7990, billing_period: "monthly", linked_product_id: "", benefits: [{ label: "Tudo do Básico" }, { label: "Cursos exclusivos" }] },
      ];
  }
}

function ProductPicker({ workspaceId, value, onChange }: { workspaceId: string; value: string; onChange: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["workspace-products", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, type, status, prices(amount)")
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data ?? []).map((p: any) => ({
        id: p.id as string,
        name: p.name as string,
        type: (p.type ?? "") as string,
        price: (p.prices?.[0]?.amount ?? 0) as number,
      }));
    },
    enabled: !!workspaceId,
  });

  const filtered = search.trim()
    ? products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    : products;

  const selected = products.find((p) => p.id === value);
  const fmt = (v: number) => v <= 0 ? "Grátis" : `R$${(v / 100).toFixed(0)}`;

  if (isLoading) return <div className="h-9 bg-muted rounded-lg animate-pulse" />;

  if (products.length === 0) {
    return (
      <div className="text-center py-3 space-y-1">
        <Package className="h-5 w-5 text-muted-foreground mx-auto" />
        <p className="text-xs text-muted-foreground">Nenhum produto na loja.</p>
        <a href="/store" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
          Criar produto <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-2 w-full px-3 py-2 rounded-lg border text-left text-sm transition-all",
          value ? "border-primary/40 bg-primary/5" : "border-border bg-background hover:bg-muted/50"
        )}
      >
        <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="flex-1 truncate text-foreground">
          {selected ? selected.name : "Selecionar produto…"}
        </span>
        {value && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onChange(""); }} className="text-muted-foreground hover:text-foreground">
            <X className="h-3 w-3" />
          </button>
        )}
      </button>

      {open && (
        <div className="rounded-lg border border-border bg-background shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar…"
              className="flex-1 text-sm outline-none bg-transparent"
              autoFocus
            />
          </div>
          <div className="max-h-40 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">Nenhum resultado.</p>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { onChange(p.id); setOpen(false); setSearch(""); }}
                  className={cn(
                    "flex items-center gap-2 w-full px-3 py-2 text-left text-sm hover:bg-muted/60",
                    p.id === value && "bg-primary/5"
                  )}
                >
                  <span className="flex-1 truncate">{p.name}</span>
                  <span className="text-xs text-muted-foreground">{fmt(p.price)}</span>
                  {p.id === value && <span className="text-primary text-xs">✓</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminPricingTab({ community }: Props) {
  const queryClient = useQueryClient();
  const initialModel = derivePricingModel(community);

  const [model, setModel] = useState<PricingModel>(initialModel);
  const [tiers, setTiers] = useState<TierDraft[]>(defaultTiersForModel(initialModel));

  // Load existing tiers from DB
  const { data: dbTiers } = useQuery({
    queryKey: ["community-tiers-active", community.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_tiers")
        .select("*, community_tier_benefits(id, label, sort_order)")
        .eq("community_id", community.id)
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (dbTiers && dbTiers.length > 0) {
      // Derive correct model from DB tiers
      const derivedModel = derivePricingModel(community, dbTiers);
      setModel(derivedModel);

      setTiers(
        dbTiers.map((t: any) => ({
          key: t.id,
          name: t.name,
          is_free: t.is_free,
          price_cents: t.price_cents,
          billing_period: t.billing_period || "",
          linked_product_id: t.linked_product_id || "",
          benefits: (t.community_tier_benefits || [])
            .sort((a: any, b: any) => a.sort_order - b.sort_order)
            .map((b: any) => ({ label: b.label })),
        }))
      );
    }
  }, [dbTiers]);

  const handleModelChange = (m: PricingModel) => {
    setModel(m);
    setTiers(defaultTiersForModel(m));
  };

  const updateTier = (idx: number, patch: Partial<TierDraft>) => {
    setTiers((prev) => prev.map((t, i) => i === idx ? { ...t, ...patch } : t));
  };

  const addTier = () => {
    const maxPaid = model === "freemium" ? 2 : model === "tiers" ? 3 : 1;
    const paidCount = tiers.filter((t) => !t.is_free).length;
    if (paidCount >= maxPaid) {
      toast.error(`Máximo de ${maxPaid} tier${maxPaid > 1 ? "s" : ""} pago${maxPaid > 1 ? "s" : ""} para este modelo.`);
      return;
    }
    setTiers((prev) => [...prev, {
      key: crypto.randomUUID(),
      name: "",
      is_free: false,
      price_cents: 0,
      billing_period: "monthly",
      linked_product_id: "",
      benefits: [],
    }]);
  };

  const removeTier = (idx: number) => {
    if (tiers.length <= 1) return;
    setTiers((prev) => prev.filter((_, i) => i !== idx));
  };

  const addBenefit = (tierIdx: number) => {
    setTiers((prev) => prev.map((t, i) =>
      i === tierIdx ? { ...t, benefits: [...t.benefits, { label: "" }] } : t
    ));
  };

  const updateBenefit = (tierIdx: number, benIdx: number, label: string) => {
    setTiers((prev) => prev.map((t, i) =>
      i === tierIdx ? { ...t, benefits: t.benefits.map((b, j) => j === benIdx ? { label } : b) } : t
    ));
  };

  const removeBenefit = (tierIdx: number, benIdx: number) => {
    setTiers((prev) => prev.map((t, i) =>
      i === tierIdx ? { ...t, benefits: t.benefits.filter((_, j) => j !== benIdx) } : t
    ));
  };

  const canAddTier = () => {
    if (model === "free" || model === "subscription" || model === "one_time") return false;
    const maxTotal = model === "freemium" ? 3 : 4;
    return tiers.length < maxTotal;
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = tiers.map((t) => ({
        name: t.name.trim() || "Sem nome",
        is_free: t.is_free,
        price_cents: t.is_free ? 0 : t.price_cents,
        billing_period: t.is_free ? null : (t.billing_period || null),
        linked_product_id: t.linked_product_id || null,
        benefits: t.benefits.filter((b) => b.label.trim()).map((b, i) => ({ label: b.label.trim(), sort_order: i })),
      }));

      const { data, error } = await supabase.rpc("set_community_pricing_model_v2", {
        p_community_id: community.id,
        p_model: model,
        p_tiers: payload,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community"] });
      queryClient.invalidateQueries({ queryKey: ["community-tiers-active"] });
      toast.success("Configuração de preço salva!");
    },
    onError: (err: any) => {
      toast.error(err?.message || "Erro ao salvar");
    },
  });

  const hasInvalidMinPrice = tiers.some((t) => !t.is_free && t.price_cents > 0 && t.price_cents < 500);

  const pricingReady = (() => {
    if (hasInvalidMinPrice) return false;
    if (model === "free") return tiers.length === 1 && tiers[0].is_free;
    if (model === "subscription") return tiers.length === 1 && !tiers[0].is_free && tiers[0].price_cents >= 500;
    if (model === "one_time") return tiers.length === 1 && !tiers[0].is_free && tiers[0].price_cents >= 500;
    if (model === "freemium") return tiers.some((t) => t.is_free) && tiers.some((t) => !t.is_free && t.price_cents >= 500);
    if (model === "tiers") return tiers.filter((t) => !t.is_free).length >= 2 && tiers.filter((t) => !t.is_free).every((t) => t.price_cents >= 500);
    return false;
  })();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">Modelo de preço</h2>
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || !pricingReady}
          size="sm"
        >
          {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
          Salvar
        </Button>
      </div>

      {/* Model selector */}
      <div className="grid grid-cols-5 gap-2">
        {MODELS.map((m) => {
          const Icon = m.icon;
          return (
            <button
              key={m.value}
              onClick={() => handleModelChange(m.value)}
              className={cn(
                "flex flex-col items-start p-3 rounded-xl border-2 text-left transition-all",
                model === m.value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground/30 bg-background"
              )}
            >
              <Icon className={cn("h-4 w-4 mb-1.5", model === m.value ? "text-primary" : "text-muted-foreground")} />
              <span className="text-sm font-semibold text-foreground">{m.label}</span>
              <span className="text-[11px] text-muted-foreground leading-tight mt-0.5">{m.desc}</span>
            </button>
          );
        })}
      </div>

      {/* Preview */}
      <div className="rounded-xl border border-border bg-muted/50 p-3">
        <p className="text-sm text-foreground">{modelPreview[model]}</p>
        <p className={cn("text-xs mt-1", pricingReady ? "text-emerald-600" : "text-amber-600")}>
          {pricingReady ? "✓ Pronto para publicar." : "Complete a configuração dos tiers abaixo."}
        </p>
      </div>

      {/* Tier editor */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold">Tiers</Label>
          {canAddTier() && (
            <Button variant="outline" size="sm" onClick={addTier} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Adicionar tier
            </Button>
          )}
        </div>

        <div className="space-y-3">
          {tiers.map((tier, idx) => (
            <div
              key={tier.key}
              className={cn(
                "rounded-xl border-2 p-4 space-y-3 transition-all",
                tier.is_free ? "border-border bg-muted/30" : "border-primary/20 bg-background"
              )}
            >
              {/* Tier header */}
              <div className="flex items-center gap-3">
                <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                <Input
                  value={tier.name}
                  onChange={(e) => updateTier(idx, { name: e.target.value })}
                  placeholder="Nome do tier (ex: Premium)"
                  className="flex-1 font-medium"
                />
                <div className="flex items-center gap-2 shrink-0">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">Grátis</span>
                          <Switch
                            checked={tier.is_free}
                            onCheckedChange={(v) => updateTier(idx, {
                              is_free: v,
                              price_cents: v ? 0 : tier.price_cents,
                              billing_period: v ? "" : (tier.billing_period || "monthly"),
                            })}
                            disabled={model === "free" || model === "subscription" || model === "one_time"}
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent><p className="text-xs">Tier gratuito (sem cobrança)</p></TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  {tiers.length > 1 && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeTier(idx)}>
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Price + billing */}
              {!tier.is_free && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center border border-border rounded-lg overflow-hidden flex-1">
                    <span className="px-3 py-2 text-sm text-muted-foreground bg-muted border-r border-border">R$</span>
                    <input
                      type="number"
                      value={tier.price_cents > 0 ? (tier.price_cents / 100).toString() : ""}
                      onChange={(e) => updateTier(idx, { price_cents: Math.round(parseFloat(e.target.value || "0") * 100) })}
                      placeholder="0"
                      className={cn("flex-1 px-3 py-2 text-sm outline-none bg-background min-w-0", !tier.is_free && tier.price_cents > 0 && tier.price_cents < 500 && "text-destructive")}
                    />
                  </div>
                  {!tier.is_free && tier.price_cents > 0 && tier.price_cents < 500 && (
                    <p className="text-xs text-destructive">O valor mínimo é R$ 5,00</p>
                  )}
                  </div>
                  {model !== "one_time" && (
                    <Select
                      value={tier.billing_period || "monthly"}
                      onValueChange={(v) => updateTier(idx, { billing_period: v })}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Mensal</SelectItem>
                        <SelectItem value="yearly">Anual</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  {model === "one_time" && (
                    <span className="text-sm text-muted-foreground shrink-0">pagamento único</span>
                  )}
                </div>
              )}

              {/* Benefits */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Benefícios</span>
                  <button
                    type="button"
                    onClick={() => addBenefit(idx)}
                    className="text-xs text-primary hover:underline flex items-center gap-0.5"
                  >
                    <Plus className="h-3 w-3" /> Adicionar
                  </button>
                </div>
                {tier.benefits.map((b, bIdx) => (
                  <div key={bIdx} className="flex items-center gap-2">
                    <span className="text-xs text-primary">✓</span>
                    <input
                      value={b.label}
                      onChange={(e) => updateBenefit(idx, bIdx, e.target.value)}
                      placeholder="Ex: Acesso a cursos exclusivos"
                      className="flex-1 text-sm py-1 px-2 rounded border border-border bg-background outline-none focus:border-primary/50"
                    />
                    <button type="button" onClick={() => removeBenefit(idx, bIdx)} className="text-muted-foreground hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {tier.benefits.length === 0 && (
                  <p className="text-xs text-muted-foreground italic pl-4">Nenhum benefício adicionado.</p>
                )}
              </div>

              {/* Linked product */}
              {!tier.is_free && (
                <div className="space-y-1.5 pt-1 border-t border-border">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Produto vinculado</span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p className="text-xs">Compradores deste produto ganham este tier automaticamente.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <span className="text-[10px] text-muted-foreground ml-auto">opcional</span>
                  </div>
                  <ProductPicker
                    workspaceId={community.workspace_id}
                    value={tier.linked_product_id}
                    onChange={(id) => updateTier(idx, { linked_product_id: id })}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
