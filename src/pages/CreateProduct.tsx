import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Save } from "lucide-react";
import { toast } from "sonner";
import { ProductTypeStep } from "@/components/products/ProductTypeStep";
import { ProductDetailsStep } from "@/components/products/ProductDetailsStep";
import { ProductPricingStep } from "@/components/products/ProductPricingStep";
import { ProductDeliveryStep } from "@/components/products/ProductDeliveryStep";
import { ProductExtrasStep } from "@/components/products/ProductExtrasStep";
import { usePlanLimits } from "@/hooks/usePlanLimits";
import { UpgradeModal } from "@/components/UpgradeModal";
import { trackEvent } from "@/lib/tracking";
import type { Database } from "@/integrations/supabase/types";

type ProductType = Database["public"]["Enums"]["product_type"];

export interface ProductFormData {
  type: ProductType | "";
  name: string;
  shortDescription: string;
  description: string;
  thumbnailUrl: string;
  galleryUrls: string[];
  price: number;
  compareAtPrice: number | null;
  pixDiscount: number | null;
  maxInstallments: number;
  isFree: boolean;
  deliveryUrl: string;
  deliveryFiles: { name: string; url: string; size: number }[];
  orderBumpEnabled: boolean;
  orderBumpProductId: string;
  orderBumpHeadline: string;
  upsellEnabled: boolean;
  upsellProductId: string;
  upsellPrice: number;
  affiliateEnabled: boolean;
  affiliateCommission: number;
  // Membership fields
  billingInterval: "monthly" | "quarterly" | "yearly";
  trialDays: number;
}

const INITIAL_FORM: ProductFormData = {
  type: "",
  name: "",
  shortDescription: "",
  description: "",
  thumbnailUrl: "",
  galleryUrls: [],
  price: 0,
  compareAtPrice: null,
  pixDiscount: null,
  maxInstallments: 1,
  isFree: false,
  deliveryUrl: "",
  deliveryFiles: [],
  orderBumpEnabled: false,
  orderBumpProductId: "",
  orderBumpHeadline: "",
  upsellEnabled: false,
  upsellProductId: "",
  upsellPrice: 0,
  affiliateEnabled: false,
  affiliateCommission: 20,
  billingInterval: "monthly",
  trialDays: 0,
};

const STEP_TITLES = [
  "Tipo de Produto",
  "Detalhes",
  "Preço e Pagamento",
  "Entrega",
  "Extras",
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

export default function CreateProduct() {
  const navigate = useNavigate();
  const { currentWorkspace } = useWorkspace();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<ProductFormData>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeFeature, setUpgradeFeature] = useState("");
  const planInfo = usePlanLimits();

  const updateForm = (updates: Partial<ProductFormData>) => {
    setForm((prev) => ({ ...prev, ...updates }));
  };

  const canAdvance = () => {
    if (step === 0) return form.type !== "";
    if (step === 1) return form.name.trim().length > 0;
    if (step === 2) return form.isFree || form.price > 0;
    return true;
  };

  const saveProduct = async (status: "DRAFT" | "PUBLISHED") => {
    if (!currentWorkspace || !form.type) return;

    // Plan limit check
    if (!planInfo.canCreateProduct) {
      setUpgradeFeature("criar mais produtos");
      setUpgradeOpen(true);
      return;
    }

      const isCourseType = form.type === "COURSE";
      if (isCourseType && !planInfo.canCreateCourse) {
      setUpgradeFeature("criar cursos");
      setUpgradeOpen(true);
      return;
    }

    setSaving(true);

    try {
      const slug = slugify(form.name) || "produto";

      const { data: product, error: productError } = await supabase
        .from("products")
        .insert({
          workspace_id: currentWorkspace.id,
          type: form.type as ProductType,
          status,
          name: form.name,
          slug: slug + "-" + Date.now().toString(36),
          description: form.description || null,
          short_description: form.shortDescription || null,
          thumbnail_url: form.thumbnailUrl || null,
        })
        .select()
        .single();

      if (productError) throw productError;

      // Create price
      if (product) {
        const isMembership = form.type === "COURSE" && form.billingInterval !== undefined && form.price > 0;
        const priceType = isMembership ? "RECURRING" : "ONE_TIME";

        const { error: priceError } = await supabase.from("prices").insert({
          product_id: product.id,
          amount: form.isFree ? 0 : form.price,
          compare_at_amount: form.compareAtPrice,
          pix_discount_percent: form.pixDiscount,
          max_installments: form.maxInstallments,
          type: priceType,
        });
        if (priceError) console.error("Price error:", priceError);

        // Create subscription plan for memberships
        if (isMembership) {
          const { error: planError } = await supabase.from("subscription_plans").insert({
            product_id: product.id,
            billing_interval: form.billingInterval,
            trial_days: form.trialDays,
          });
          if (planError) console.error("Plan error:", planError);
        }

        // Save gallery
        if (form.galleryUrls.length > 0) {
          const mediaInserts = form.galleryUrls.map((url, i) => ({
            product_id: product.id,
            url,
            position: i,
          }));
          await supabase.from("product_media").insert(mediaInserts);
        }

        // Save delivery files
        if (form.deliveryFiles.length > 0) {
          const assetInserts = form.deliveryFiles.map((f) => ({
            product_id: product.id,
            file_name: f.name,
            file_url: f.url,
            file_size_bytes: f.size,
          }));
          await supabase.from("digital_assets").insert(assetInserts);
        }
      }

      // Save commission rule for affiliates
      if (product && form.affiliateEnabled && form.affiliateCommission > 0) {
        await supabase.from("commission_rules").upsert({
          product_id: product.id,
          percent: Math.min(Math.max(form.affiliateCommission, 1), 80),
          is_active: true,
        }, { onConflict: "product_id" });
      }

      toast.success(
        status === "PUBLISHED"
          ? "Produto publicado com sucesso!"
          : "Rascunho salvo!"
      );
      navigate("/products");
    } catch (error: any) {
      console.error("Error saving product:", error);
      toast.error("Erro ao salvar produto: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 0:
        return <ProductTypeStep form={form} updateForm={updateForm} />;
      case 1:
        return <ProductDetailsStep form={form} updateForm={updateForm} />;
      case 2:
        return <ProductPricingStep form={form} updateForm={updateForm} />;
      case 3:
        return <ProductDeliveryStep form={form} updateForm={updateForm} />;
      case 4:
        return <ProductExtrasStep form={form} updateForm={updateForm} />;
      default:
        return null;
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/products")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Novo Produto</h1>
          <p className="text-sm text-muted-foreground">
            Passo {step + 1} de {STEP_TITLES.length} — {STEP_TITLES[step]}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex gap-1.5">
        {STEP_TITLES.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i <= step ? "bg-primary" : "bg-muted"
            }`}
          />
        ))}
      </div>

      {/* Step content */}
      <div className="min-h-[400px]">{renderStep()}</div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4 border-t border-border">
        <Button
          variant="outline"
          onClick={() => (step > 0 ? setStep(step - 1) : navigate("/products"))}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          {step > 0 ? "Voltar" : "Cancelar"}
        </Button>

        <div className="flex gap-2">
          {step === STEP_TITLES.length - 1 ? (
            <>
              <Button
                variant="outline"
                onClick={() => saveProduct("DRAFT")}
                disabled={saving}
              >
                <Save className="h-4 w-4 mr-2" />
                Salvar Rascunho
              </Button>
              <Button
                onClick={() => saveProduct("PUBLISHED")}
                disabled={saving}
                className="kivo-gradient text-primary-foreground"
              >
                Publicar Produto
              </Button>
            </>
          ) : (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={!canAdvance()}
              className="kivo-gradient text-primary-foreground"
            >
              Próximo
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
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
