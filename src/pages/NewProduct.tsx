import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  ArrowLeft,
  Package,
  GraduationCap,
  Calendar,
  Truck,
  Megaphone,
  Image,
  Type,
  LayoutTemplate,
  ChevronDown,
  ChevronUp,
  Save,
  Rocket,
  Check,
  Lock,
  Users,
  Mail,
  ShoppingCart,
  Link2,
  Upload,
} from "lucide-react";
import { usePlanLimits } from "@/hooks/usePlanLimits";
import { UpgradeModal } from "@/components/UpgradeModal";
import { trackEvent } from "@/lib/tracking";
import type { Database } from "@/integrations/supabase/types";

type ProductType = Database["public"]["Enums"]["product_type"];

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProductForm {
  // Tipo
  type: ProductType | "";
  // Thumbnail (Etapa 1)
  cardStyle: "button" | "callout" | "preview";
  name: string;
  shortDescription: string;
  ctaText: string;
  thumbnailUrl: string;
  // Página / Checkout (Etapa 2)
  description: string;
  price: number;
  compareAtPrice: number | null;
  isFree: boolean;
  deliveryType: "url" | "file";
  deliveryUrl: string;
  // Opções (Etapa 3)
  orderBumpEnabled: boolean;
  orderBumpHeadline: string;
  affiliateEnabled: boolean;
  affiliateCommission: number;
  upsellEnabled: boolean;
  upsellPrice: number;
}

const INITIAL_FORM: ProductForm = {
  type: "",
  cardStyle: "preview",
  name: "",
  shortDescription: "",
  ctaText: "Ver produto",
  thumbnailUrl: "",
  description: "",
  price: 0,
  compareAtPrice: null,
  isFree: false,
  deliveryType: "url",
  deliveryUrl: "",
  orderBumpEnabled: false,
  orderBumpHeadline: "",
  affiliateEnabled: false,
  affiliateCommission: 20,
  upsellEnabled: false,
  upsellPrice: 0,
};

const STEPS = [
  { key: "thumbnail",  label: "Thumbnail",        number: 1 },
  { key: "pagina",     label: "Página / Checkout", number: 2 },
  { key: "opcoes",     label: "Opções",            number: 3 },
] as const;
type StepKey = typeof STEPS[number]["key"];

const PRODUCT_TYPES: { type: ProductType; icon: React.ElementType; title: string; subtitle: string }[] = [
  { type: "LEAD_MAGNET", icon: Megaphone,     title: "Coletar Emails / Aplicações", subtitle: "Capture leads com um lead magnet" },
  { type: "DIGITAL",     icon: Package,       title: "Produto Digital",             subtitle: "PDFs, Guias, Templates, eBooks" },
  { type: "COURSE",      icon: GraduationCap, title: "Curso Online",                subtitle: "Crie e venda cursos com área de membros" },
  { type: "SERVICE",     icon: Calendar,      title: "Serviço",                     subtitle: "Consultorias, coaching, mentorias" },
  { type: "PHYSICAL",    icon: Truck,         title: "Produto Físico",              subtitle: "Produtos com entrega física" },
];

const CARD_STYLES: { key: ProductForm["cardStyle"]; label: string; description: string }[] = [
  { key: "preview", label: "Preview",  description: "Card com imagem em destaque" },
  { key: "callout", label: "Callout",  description: "Card com destaque em texto" },
  { key: "button",  label: "Botão",    description: "Link simples em formato de botão" },
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

// ─── Mini card preview ────────────────────────────────────────────────────────

function CardPreview({ form }: { form: ProductForm }) {
  if (form.cardStyle === "button") {
    return (
      <div className="w-full py-3 px-5 rounded-lg border-2 border-primary text-center text-sm font-medium text-foreground truncate">
        {form.ctaText || "Ver produto"}
      </div>
    );
  }
  if (form.cardStyle === "callout") {
    return (
      <div className="w-full rounded-xl border border-border/60 bg-card p-5">
        <p className="font-bold text-foreground text-base leading-snug">{form.name || "Título do produto"}</p>
        {form.shortDescription && (
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{form.shortDescription}</p>
        )}
        <div className="mt-4 py-2 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium text-center">
          {form.ctaText || "Ver produto"}
        </div>
      </div>
    );
  }
  // preview (default)
  return (
    <div className="w-full rounded-xl border border-border/60 bg-card overflow-hidden">
      <div className="h-36 bg-muted flex items-center justify-center overflow-hidden">
        {form.thumbnailUrl ? (
          <img src={form.thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <Image className="h-10 w-10 text-muted-foreground/30" />
        )}
      </div>
      <div className="p-4">
        <p className="font-semibold text-foreground text-sm leading-snug">{form.name || "Título do produto"}</p>
        {form.shortDescription && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{form.shortDescription}</p>
        )}
        <div className="mt-3 py-2 px-4 bg-primary text-primary-foreground rounded-lg text-xs font-medium text-center">
          {form.ctaText || "Ver produto"}
        </div>
      </div>
    </div>
  );
}

// ─── Collapsible option section ───────────────────────────────────────────────

function OptionSection({
  title,
  description,
  icon: Icon,
  locked,
  lockedLabel,
  children,
  enabled,
  onToggle,
}: {
  title: string;
  description: string;
  icon: React.ElementType;
  locked?: boolean;
  lockedLabel?: string;
  children?: React.ReactNode;
  enabled: boolean;
  onToggle: (v: boolean) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("rounded-xl border bg-card transition-all", open && enabled && !locked ? "border-border" : "border-border/50")}>
      <div
        className="flex items-center gap-3 p-4 cursor-pointer select-none"
        onClick={() => { if (!locked && enabled) setOpen((o) => !o); }}
      >
        <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0", enabled && !locked ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground">{title}</p>
            {locked && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1 text-muted-foreground border-border/50">
                <Lock className="h-2.5 w-2.5" /> {lockedLabel || "Plano Pro"}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!locked && (
            <Switch
              checked={enabled}
              onCheckedChange={(v) => { onToggle(v); if (v) setOpen(true); else setOpen(false); }}
              onClick={(e) => e.stopPropagation()}
            />
          )}
          {enabled && !locked && children && (
            <button
              onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>

      {open && enabled && !locked && children && (
        <div className="px-4 pb-4 border-t border-border/30 pt-3">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function NewProduct() {
  const navigate = useNavigate();
  const { id: editId } = useParams<{ id?: string }>();
  const { currentWorkspace } = useWorkspace();
  const [step, setStep] = useState<StepKey>("thumbnail");
  const [form, setForm] = useState<ProductForm>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeFeature, setUpgradeFeature] = useState("");
  const planInfo = usePlanLimits();

  const updateForm = (updates: Partial<ProductForm>) =>
    setForm((prev) => ({ ...prev, ...updates }));

  const currentStepIndex = STEPS.findIndex((s) => s.key === step);

  const goTo = (key: StepKey) => {
    // Only allow navigating to steps after type is selected
    if (!form.type) { toast.error("Escolha o tipo de produto primeiro."); return; }
    if (key === "pagina" || key === "opcoes") {
      if (!form.name.trim()) { toast.error("Informe o título do produto."); return; }
    }
    setStep(key);
  };

  const handleNext = () => {
    if (step === "thumbnail") {
      if (!form.type) { toast.error("Escolha o tipo de produto."); return; }
      if (!form.name.trim()) { toast.error("Informe o título do produto."); return; }
      setStep("pagina");
    } else if (step === "pagina") {
      if (!form.isFree && form.price <= 0 && form.type !== "LEAD_MAGNET") {
        toast.error("Defina um preço ou marque como gratuito.");
        return;
      }
      setStep("opcoes");
    }
  };

  const handleBack = () => {
    if (step === "pagina") setStep("thumbnail");
    else if (step === "opcoes") setStep("pagina");
    else navigate("/store?tab=loja");
  };

  const saveProduct = async (status: "DRAFT" | "PUBLISHED") => {
    if (!currentWorkspace) { toast.error("Nenhum workspace ativo."); return; }
    if (!form.type) { toast.error("Escolha o tipo de produto."); setStep("thumbnail"); return; }
    if (!form.name.trim()) { toast.error("Informe o título do produto."); setStep("thumbnail"); return; }

    if (!planInfo.canCreateProduct) {
      setUpgradeFeature("criar mais produtos");
      setUpgradeOpen(true);
      return;
    }
    if (form.type === "COURSE" && !planInfo.canCreateCourse) {
      setUpgradeFeature("criar cursos");
      setUpgradeOpen(true);
      return;
    }

    setSaving(true);
    try {
      const slug = slugify(form.name) + "-" + Date.now().toString(36);

      const { data: product, error: productError } = await supabase
        .from("products")
        .insert({
          workspace_id: currentWorkspace.id,
          type: form.type as ProductType,
          status,
          name: form.name,
          slug,
          description: form.description || null,
          short_description: form.shortDescription || null,
          thumbnail_url: form.thumbnailUrl || null,
        })
        .select()
        .single();

      if (productError) throw productError;

      if (product) {
        // Price
        await supabase.from("prices").insert({
          product_id: product.id,
          amount: form.isFree ? 0 : form.price,
          compare_at_amount: form.compareAtPrice,
          type: "ONE_TIME",
        });

        // Affiliate
        if (form.affiliateEnabled && form.affiliateCommission > 0) {
          await supabase.from("commission_rules").upsert({
            product_id: product.id,
            percent: Math.min(Math.max(form.affiliateCommission, 1), 80),
            is_active: true,
          }, { onConflict: "product_id" });
        }
      }

      trackEvent("product_created", { type: form.type, status }, currentWorkspace.id);
      toast.success(status === "PUBLISHED" ? "Produto publicado!" : "Rascunho salvo!");
      navigate("/store?tab=loja");
    } catch (err: any) {
      toast.error("Erro ao salvar: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* ── Top bar ── */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b border-border/50">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-14 flex items-center gap-4">
          <button
            onClick={() => navigate("/store?tab=loja")}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Minha Loja
          </button>

          <span className="text-muted-foreground/30">/</span>
          <span className="text-sm font-medium text-foreground">
            {editId ? "Editar produto" : "Novo produto"}
          </span>

          <div className="flex-1" />

          {/* Step indicators */}
          <div className="hidden sm:flex items-center gap-1">
            {STEPS.map((s, i) => {
              const isDone = STEPS.findIndex((x) => x.key === step) > i;
              const isCurrent = s.key === step;
              return (
                <div key={s.key} className="flex items-center gap-1">
                  {i > 0 && <div className={cn("h-px w-5 transition-colors", isDone ? "bg-primary" : "bg-border")} />}
                  <button
                    onClick={() => goTo(s.key)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all",
                      isCurrent ? "bg-primary text-primary-foreground" :
                      isDone ? "text-primary hover:bg-primary/10" :
                      "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {isDone ? <Check className="h-3 w-3" /> : <span>{s.number}</span>}
                    {s.label}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">
        <div className="flex gap-10">

          {/* ── Left: form ── */}
          <div className="flex-1 min-w-0 space-y-8">

            {/* ══ ETAPA 1: THUMBNAIL ══ */}
            {step === "thumbnail" && (
              <div className="space-y-8">
                <div>
                  <h1 className="text-xl font-bold text-foreground">Thumbnail</h1>
                  <p className="text-sm text-muted-foreground mt-1">Defina como este item aparece na sua loja.</p>
                </div>

                {/* Tipo de produto */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold">Tipo de produto</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {PRODUCT_TYPES.map(({ type, icon: Icon, title, subtitle }) => (
                      <button
                        key={type}
                        onClick={() => updateForm({ type })}
                        className={cn(
                          "flex items-start gap-3 p-3.5 rounded-xl border-2 text-left transition-all hover:border-primary/50 hover:shadow-sm",
                          form.type === type
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "border-border bg-card"
                        )}
                      >
                        <div className={cn(
                          "h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0",
                          form.type === type ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                        )}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground leading-snug">{title}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Estilo do card */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold">Estilo visual do card</Label>
                  <div className="flex gap-2">
                    {CARD_STYLES.map(({ key, label, description }) => (
                      <button
                        key={key}
                        onClick={() => updateForm({ cardStyle: key })}
                        className={cn(
                          "flex-1 p-3 rounded-xl border-2 text-center transition-all",
                          form.cardStyle === key
                            ? "border-primary bg-primary/5"
                            : "border-border bg-card hover:border-border/80"
                        )}
                      >
                        <p className={cn("text-xs font-semibold", form.cardStyle === key ? "text-primary" : "text-foreground")}>{label}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{description}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Thumbnail URL */}
                {form.cardStyle !== "button" && (
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">
                      <span className="flex items-center gap-1.5"><Image className="h-3.5 w-3.5" /> Imagem de capa</span>
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Cole a URL da imagem..."
                        value={form.thumbnailUrl}
                        onChange={(e) => updateForm({ thumbnailUrl: e.target.value })}
                        className="flex-1"
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">Proporção recomendada: 16:9 ou quadrado (1:1)</p>
                  </div>
                )}

                {/* Textos */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">
                      <span className="flex items-center gap-1.5"><Type className="h-3.5 w-3.5" /> Título *</span>
                    </Label>
                    <Input
                      placeholder="Ex: Guia Completo de Marketing Digital"
                      value={form.name}
                      onChange={(e) => updateForm({ name: e.target.value })}
                      maxLength={80}
                    />
                    <p className="text-[11px] text-muted-foreground text-right">{form.name.length}/80</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Subtítulo <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                    <Input
                      placeholder="Uma linha que reforça o valor da oferta"
                      value={form.shortDescription}
                      onChange={(e) => updateForm({ shortDescription: e.target.value })}
                      maxLength={120}
                    />
                    <p className="text-[11px] text-muted-foreground text-right">{form.shortDescription.length}/120</p>
                  </div>

                  {form.cardStyle !== "button" && (
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">Texto do botão</Label>
                      <Input
                        placeholder="Ver produto"
                        value={form.ctaText}
                        onChange={(e) => updateForm({ ctaText: e.target.value })}
                        maxLength={40}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ══ ETAPA 2: PÁGINA / CHECKOUT ══ */}
            {step === "pagina" && (
              <div className="space-y-8">
                <div>
                  <h1 className="text-xl font-bold text-foreground">Página / Checkout</h1>
                  <p className="text-sm text-muted-foreground mt-1">Configure a experiência de compra ou captura.</p>
                </div>

                {/* Descrição */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Descrição da oferta</Label>
                  <Textarea
                    placeholder="Descreva o que o cliente vai receber, os benefícios e diferenciais..."
                    value={form.description}
                    onChange={(e) => updateForm({ description: e.target.value })}
                    rows={5}
                    className="resize-none"
                  />
                </div>

                {/* Preço */}
                {form.type !== "LEAD_MAGNET" && (
                  <div className="space-y-4 p-5 rounded-xl border border-border/60 bg-card">
                    <p className="text-sm font-semibold text-foreground">Preço</p>

                    <div className="flex items-center gap-3">
                      <Switch
                        checked={form.isFree}
                        onCheckedChange={(v) => updateForm({ isFree: v })}
                        id="is-free"
                      />
                      <Label htmlFor="is-free" className="text-sm cursor-pointer">Produto gratuito</Label>
                    </div>

                    {!form.isFree && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">Preço (R$) *</Label>
                          <Input
                            type="number"
                            min={0}
                            step={0.01}
                            placeholder="0,00"
                            value={form.price || ""}
                            onChange={(e) => updateForm({ price: Number(e.target.value) })}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">Preço original (R$)</Label>
                          <Input
                            type="number"
                            min={0}
                            step={0.01}
                            placeholder="Desconto opcional"
                            value={form.compareAtPrice ?? ""}
                            onChange={(e) => updateForm({ compareAtPrice: e.target.value ? Number(e.target.value) : null })}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Entrega */}
                {(form.type === "DIGITAL" || form.type === "PHYSICAL" || form.type === "COURSE") && (
                  <div className="space-y-4 p-5 rounded-xl border border-border/60 bg-card">
                    <p className="text-sm font-semibold text-foreground">Entrega</p>

                    <div className="flex gap-2">
                      {([
                        { key: "url",  label: "Redirect para URL", icon: Link2 },
                        { key: "file", label: "Upload de arquivo",  icon: Upload },
                      ] as const).map(({ key, label, icon: Icon }) => (
                        <button
                          key={key}
                          onClick={() => updateForm({ deliveryType: key })}
                          className={cn(
                            "flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border-2 text-sm transition-all",
                            form.deliveryType === key
                              ? "border-primary bg-primary/5 text-primary font-medium"
                              : "border-border text-muted-foreground hover:border-border/80"
                          )}
                        >
                          <Icon className="h-4 w-4" />
                          {label}
                        </button>
                      ))}
                    </div>

                    {form.deliveryType === "url" && (
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">URL de entrega</Label>
                        <Input
                          placeholder="https://..."
                          value={form.deliveryUrl}
                          onChange={(e) => updateForm({ deliveryUrl: e.target.value })}
                        />
                      </div>
                    )}

                    {form.deliveryType === "file" && (
                      <div className="flex flex-col items-center justify-center py-8 rounded-lg border-2 border-dashed border-border/60 text-center gap-2">
                        <Upload className="h-6 w-6 text-muted-foreground/40" />
                        <p className="text-sm text-muted-foreground">Upload de arquivo disponível após criação</p>
                        <p className="text-xs text-muted-foreground/60">PDF, ZIP, MP4 e outros formatos</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ══ ETAPA 3: OPÇÕES ══ */}
            {step === "opcoes" && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-xl font-bold text-foreground">Opções</h1>
                  <p className="text-sm text-muted-foreground mt-1">Configure recursos extras para maximizar suas vendas.</p>
                </div>

                <div className="space-y-3">
                  {/* Order Bump */}
                  <OptionSection
                    title="Order Bump"
                    description="Ofereça um produto adicional durante o checkout"
                    icon={ShoppingCart}
                    enabled={form.orderBumpEnabled}
                    onToggle={(v) => updateForm({ orderBumpEnabled: v })}
                  >
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Headline do bump</Label>
                      <Input
                        placeholder="Ex: Adicione também o Masterclass por apenas R$47"
                        value={form.orderBumpHeadline}
                        onChange={(e) => updateForm({ orderBumpHeadline: e.target.value })}
                      />
                    </div>
                  </OptionSection>

                  {/* Afiliados */}
                  <OptionSection
                    title="Programa de Afiliados"
                    description="Permita que outras pessoas promovam e ganhem comissão"
                    icon={Users}
                    enabled={form.affiliateEnabled}
                    onToggle={(v) => updateForm({ affiliateEnabled: v })}
                  >
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Comissão por venda (%)</Label>
                      <Input
                        type="number"
                        min={1}
                        max={80}
                        value={form.affiliateCommission}
                        onChange={(e) => updateForm({ affiliateCommission: Number(e.target.value) })}
                        className="w-32"
                      />
                    </div>
                  </OptionSection>

                  {/* Upsell */}
                  <OptionSection
                    title="Upsell pós-compra"
                    description="Ofereça um upgrade ou complemento após a compra"
                    icon={Rocket}
                    enabled={form.upsellEnabled}
                    onToggle={(v) => updateForm({ upsellEnabled: v })}
                  >
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Preço especial do upsell (R$)</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        placeholder="0,00"
                        value={form.upsellPrice || ""}
                        onChange={(e) => updateForm({ upsellPrice: Number(e.target.value) })}
                        className="w-40"
                      />
                    </div>
                  </OptionSection>

                  {/* Email de confirmação — locked */}
                  <OptionSection
                    title="Email de Confirmação"
                    description="Envie um email personalizado após a compra"
                    icon={Mail}
                    locked={true}
                    lockedLabel="Em breve"
                    enabled={false}
                    onToggle={() => {}}
                  />

                  {/* Email Flows — locked */}
                  <OptionSection
                    title="Email Flows"
                    description="Crie sequências de email automatizadas para compradores"
                    icon={Mail}
                    locked={!planInfo.canCreateProduct}
                    lockedLabel="Plano Pro"
                    enabled={false}
                    onToggle={() => {}}
                  />
                </div>

                {/* Reviews placeholder */}
                <div className="p-5 rounded-xl border border-dashed border-border/50 text-center">
                  <p className="text-sm font-medium text-foreground">Depoimentos / Reviews</p>
                  <p className="text-xs text-muted-foreground mt-1">Adicione provas sociais à página do produto após a publicação.</p>
                </div>
              </div>
            )}

            {/* ── Navigation buttons ── */}
            <div className="flex items-center justify-between pt-4 border-t border-border/40">
              <Button variant="outline" onClick={handleBack} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                {step === "thumbnail" ? "Cancelar" : "Voltar"}
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => saveProduct("DRAFT")}
                  disabled={saving || !form.name.trim()}
                  className="gap-2"
                >
                  <Save className="h-4 w-4" />
                  Salvar rascunho
                </Button>

                {step !== "opcoes" ? (
                  <Button onClick={handleNext} className="gap-2 kivo-gradient text-primary-foreground">
                    Próximo
                    <ArrowLeft className="h-4 w-4 rotate-180" />
                  </Button>
                ) : (
                  <Button
                    onClick={() => saveProduct("PUBLISHED")}
                    disabled={saving}
                    className="gap-2 kivo-gradient text-primary-foreground"
                  >
                    <Rocket className="h-4 w-4" />
                    Publicar produto
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* ── Right: live preview ── */}
          <div className="hidden lg:block w-[280px] flex-shrink-0">
            <div className="sticky top-20">
              <p className="text-xs font-medium text-muted-foreground mb-3 text-center">
                Preview em tempo real
              </p>

              {step === "thumbnail" && (
                <div className="space-y-4">
                  <CardPreview form={form} />
                  <div className="p-3 rounded-lg bg-muted/30 text-center">
                    <p className="text-[11px] text-muted-foreground">
                      É assim que o item aparece na sua loja
                    </p>
                  </div>
                </div>
              )}

              {step === "pagina" && (
                <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
                  {form.thumbnailUrl && (
                    <div className="h-32 bg-muted overflow-hidden">
                      <img src={form.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="p-4 space-y-3">
                    <p className="font-bold text-foreground text-sm leading-snug">{form.name || "Título do produto"}</p>
                    {form.shortDescription && (
                      <p className="text-xs text-muted-foreground">{form.shortDescription}</p>
                    )}
                    {form.description && (
                      <p className="text-xs text-muted-foreground/80 line-clamp-4">{form.description}</p>
                    )}
                    {!form.isFree && form.price > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-foreground">
                          R$ {form.price.toFixed(2).replace(".", ",")}
                        </span>
                        {form.compareAtPrice && (
                          <span className="text-xs text-muted-foreground line-through">
                            R$ {form.compareAtPrice.toFixed(2).replace(".", ",")}
                          </span>
                        )}
                      </div>
                    )}
                    {form.isFree && <span className="text-sm font-bold text-primary">Gratuito</span>}
                    <div className="py-2.5 px-4 bg-primary text-primary-foreground rounded-lg text-xs font-medium text-center">
                      {form.ctaText || "Quero agora"}
                    </div>
                  </div>
                </div>
              )}

              {step === "opcoes" && (
                <div className="space-y-3">
                  <CardPreview form={form} />
                  <div className="p-3 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Check className="h-3 w-3 text-primary" />
                      <p className="text-[11px] font-medium text-foreground">Configurações ativas:</p>
                    </div>
                    <ul className="space-y-0.5">
                      {form.orderBumpEnabled && <li className="text-[10px] text-muted-foreground">• Order bump ativado</li>}
                      {form.affiliateEnabled && <li className="text-[10px] text-muted-foreground">• Afiliados: {form.affiliateCommission}% de comissão</li>}
                      {form.upsellEnabled && <li className="text-[10px] text-muted-foreground">• Upsell pós-compra</li>}
                      {!form.orderBumpEnabled && !form.affiliateEnabled && !form.upsellEnabled && (
                        <li className="text-[10px] text-muted-foreground/50">Nenhuma opção extra ativada</li>
                      )}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <UpgradeModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        currentPlan={planInfo.plan}
        feature={upgradeFeature}
      />
    </div>
  );
}
