import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Check,
  Crown,
  Sparkles,
  Zap,
  CreditCard,
  QrCode,
  ArrowLeft,
  ArrowRight,
  Loader2,
  CheckCircle2,
  Rocket,
  Store,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { usePlanCheckout, type SourceUI } from "@/hooks/usePlanCheckout";
import { useExperiment } from "@/hooks/useExperiment";
import { trackEvent } from "@/lib/tracking";
import { supabase } from "@/integrations/supabase/client";

/* ─── Plan data ─── */
const PLANS = [
  {
    id: "free",
    code: "free",
    name: "Free",
    monthly: 0,
    icon: Zap,
    features: ["1 produto", "Checkout integrado", "Link-in-bio", "Com marca Kivo"],
    excluded: ["Área de membros", "Afiliados", "Email marketing"],
  },
  {
    id: "creator",
    code: "creator",
    name: "Creator",
    monthly: 67,
    icon: Crown,
    popular: true,
    features: [
      "Até 10 produtos",
      "1 curso com área de membros",
      "Até 500 contatos de email",
      "Até 5 afiliados",
      "Email marketing",
      "Cupons de desconto",
      "Sem marca Kivo",
    ],
    excluded: [],
  },
  {
    id: "creator-pro",
    code: "creator-pro",
    name: "Creator Pro",
    monthly: 149,
    icon: Sparkles,
    features: [
      "Produtos ilimitados",
      "Cursos ilimitados",
      "Contatos ilimitados",
      "Afiliados ilimitados",
      "Automações avançadas",
      "Domínio customizado",
      "Suporte prioritário",
    ],
    excluded: [],
  },
];

/* ─── CPF formatter ─── */
function formatCpf(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  return digits
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

/* ─── Stepper indicator ─── */
function StepIndicator({ current, total }: { current: number; total: number }) {
  const labels = ["Plano", "Pagamento", "Confirmação"];
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div
            className={cn(
              "flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold transition-colors",
              i < current
                ? "bg-primary text-primary-foreground"
                : i === current
                ? "bg-primary text-primary-foreground ring-2 ring-primary/30 ring-offset-2"
                : "bg-muted text-muted-foreground"
            )}
          >
            {i < current ? <Check className="h-4 w-4" /> : i + 1}
          </div>
          <span className={cn("text-sm hidden sm:inline", i === current ? "font-semibold text-foreground" : "text-muted-foreground")}>
            {labels[i]}
          </span>
          {i < total - 1 && <div className={cn("w-8 h-0.5 mx-1", i < current ? "bg-primary" : "bg-muted")} />}
        </div>
      ))}
    </div>
  );
}

/* ─── Main component ─── */
export default function UpgradeFlow() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentWorkspace } = useWorkspace();
  const { startPlanCheckout, upgradeMidCycle, loading } = usePlanCheckout();
  const { variant: pricingVariant } = useExperiment("pricing_creator");

  const preselected = searchParams.get("plan") || "";
  const sourceUI = (searchParams.get("source") || "upgrade_flow") as SourceUI;
  const feature = searchParams.get("feature") || "";

  const [step, setStep] = useState(0);
  const [selectedPlan, setSelectedPlan] = useState(preselected);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "pix" | null>(null);
  const [cpf, setCpf] = useState("");
  const [confirmStatus, setConfirmStatus] = useState<"polling" | "confirmed" | "timeout">("polling");
  const [currentPlanCode, setCurrentPlanCode] = useState<string>("free");

  // Fetch current plan
  useEffect(() => {
    if (!currentWorkspace) return;
    supabase
      .from("workspace_subscriptions")
      .select("plan_code, status")
      .eq("workspace_id", currentWorkspace.id)
      .in("status", ["active", "trialing", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.plan_code) setCurrentPlanCode(data.plan_code);
      });
  }, [currentWorkspace]);

  // Track flow started
  useEffect(() => {
    trackEvent("upgrade_flow_started", { source_ui: sourceUI, feature, preselected_plan: preselected });
  }, []);

  // Adjust creator price per experiment
  const plans = PLANS.map((p) => {
    if (p.id === "creator" && pricingVariant === "B") return { ...p, monthly: 79 };
    return p;
  });

  /* ─── Step 1: Choose plan ─── */
  const handleSelectPlan = (code: string) => {
    setSelectedPlan(code);
    trackEvent("upgrade_plan_selected", { plan_code: code, source_ui: sourceUI });
  };

  const handleContinueToPayment = () => {
    if (!selectedPlan || selectedPlan === "free") return;
    setStep(1);
  };

  /* ─── Step 2: Payment method ─── */
  const handleChoosePaymentMethod = (method: "card" | "pix") => {
    setPaymentMethod(method);
    trackEvent("upgrade_payment_method_selected", { method, plan_code: selectedPlan, source_ui: sourceUI });
  };

  const handleStartCheckout = async () => {
    if (!paymentMethod || !selectedPlan) return;
    const cleanCpf = cpf.replace(/\D/g, "");

    // For mid-cycle upgrade (already paid)
    if (currentPlanCode !== "free") {
      const success = await upgradeMidCycle({ planCode: selectedPlan, sourceUI });
      if (success) {
        setStep(2);
        setConfirmStatus("confirmed");
        trackEvent("upgrade_checkout_succeeded", { plan_code: selectedPlan, source_ui: sourceUI, method: "midcycle" });
      }
      return;
    }

    // New subscription checkout via Asaas
    trackEvent("upgrade_checkout_created", { plan_code: selectedPlan, source_ui: sourceUI, payment_method: paymentMethod });
    await startPlanCheckout({
      planCode: selectedPlan,
      sourceUI,
      cpf: cleanCpf || undefined,
    });
    // startPlanCheckout redirects to Asaas checkout URL, so the flow continues
    // via /billing/success which will now redirect to /billing/upgrade-flow?step=confirm
  };

  /* ─── Step 3: Confirmation (polling) ─── */
  useEffect(() => {
    if (step !== 2 || confirmStatus !== "polling" || !currentWorkspace) return;
    let attempts = 0;
    const maxAttempts = 15;

    const poll = async () => {
      attempts++;
      const { data } = await supabase
        .from("workspace_subscriptions")
        .select("status, plan_code")
        .eq("workspace_id", currentWorkspace.id)
        .in("status", ["active", "trialing"])
        .maybeSingle();

      if (data) {
        setConfirmStatus("confirmed");
        trackEvent("upgrade_checkout_succeeded", { plan_code: data.plan_code, source_ui: sourceUI });
        return;
      }
      if (attempts >= maxAttempts) {
        setConfirmStatus("timeout");
        return;
      }
      setTimeout(poll, 2000);
    };
    poll();
  }, [step, confirmStatus, currentWorkspace]);

  // If arriving from /billing/success redirect
  useEffect(() => {
    const stepParam = searchParams.get("step");
    if (stepParam === "confirm") {
      setStep(2);
      setConfirmStatus("polling");
    }
  }, [searchParams]);

  const handleWelcomeCTA = () => {
    trackEvent("upgrade_create_store_clicked", { source_ui: sourceUI });
    navigate("/store/editor");
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8 md:py-16">
        {/* Back button */}
        {step < 2 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => (step === 0 ? navigate(-1) : setStep(step - 1))}
            className="mb-6"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {step === 0 ? "Voltar" : "Voltar para planos"}
          </Button>
        )}

        {/* Step header */}
        {step < 2 && <StepIndicator current={step} total={3} />}

        {/* ═══════ STEP 1: Choose Plan ═══════ */}
        {step === 0 && (
          <div className="space-y-6">
            <div className="text-center">
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">Escolha seu plano</h1>
              <p className="text-muted-foreground mt-2">
                {feature ? `Faça upgrade para ${feature}` : "Desbloqueie mais recursos e cresça seu negócio"}
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              {plans.map((plan) => {
                const Icon = plan.icon;
                const isCurrent = plan.code === currentPlanCode;
                const isSelected = plan.code === selectedPlan;
                const isDowngrade =
                  (currentPlanCode === "creator-pro") ||
                  (currentPlanCode === "creator" && plan.code === "free");

                return (
                  <Card
                    key={plan.id}
                    className={cn(
                      "relative cursor-pointer transition-all hover:shadow-md",
                      isSelected && "ring-2 ring-primary shadow-lg",
                      isCurrent && "bg-muted/30",
                      isDowngrade && "opacity-50 cursor-not-allowed"
                    )}
                    onClick={() => !isCurrent && !isDowngrade && handleSelectPlan(plan.code)}
                  >
                    {plan.popular && (
                      <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs px-3">
                        Recomendado
                      </Badge>
                    )}
                    <CardContent className="p-5 space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="p-2 rounded-full bg-primary/10">
                          <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <span className="font-semibold text-foreground">{plan.name}</span>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold text-foreground">
                          {plan.monthly === 0 ? "Grátis" : `R$${plan.monthly}`}
                        </span>
                        {plan.monthly > 0 && <span className="text-sm text-muted-foreground">/mês</span>}
                      </div>
                      {isCurrent && <Badge variant="outline" className="text-xs">Plano atual</Badge>}
                      <ul className="space-y-1.5 pt-2">
                        {plan.features.map((f, i) => (
                          <li key={i} className="flex items-center gap-2 text-sm text-foreground">
                            <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                            {f}
                          </li>
                        ))}
                        {plan.excluded.map((f, i) => (
                          <li key={`ex-${i}`} className="flex items-center gap-2 text-sm text-muted-foreground line-through">
                            <span className="h-3.5 w-3.5 shrink-0" />
                            {f}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="flex justify-center">
              <Button
                size="lg"
                disabled={!selectedPlan || selectedPlan === "free" || selectedPlan === currentPlanCode}
                onClick={handleContinueToPayment}
                className="gap-2 px-8"
              >
                Continuar <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ═══════ STEP 2: Payment ═══════ */}
        {step === 1 && (
          <div className="space-y-6 max-w-lg mx-auto">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-foreground">Método de pagamento</h1>
              <p className="text-muted-foreground mt-2">
                Plano selecionado: <strong>{plans.find((p) => p.code === selectedPlan)?.name}</strong> — R$
                {plans.find((p) => p.code === selectedPlan)?.monthly}/mês
              </p>
            </div>

            {/* Payment options */}
            <div className="grid grid-cols-2 gap-4">
              <Card
                className={cn(
                  "cursor-pointer transition-all hover:shadow-md p-6 text-center",
                  paymentMethod === "card" && "ring-2 ring-primary"
                )}
                onClick={() => handleChoosePaymentMethod("card")}
              >
                <CreditCard className="h-8 w-8 text-primary mx-auto mb-3" />
                <p className="font-semibold text-foreground">Cartão de Crédito</p>
                <p className="text-xs text-muted-foreground mt-1">Ativação imediata</p>
              </Card>
              <Card
                className={cn(
                  "cursor-pointer transition-all hover:shadow-md p-6 text-center",
                  paymentMethod === "pix" && "ring-2 ring-primary"
                )}
                onClick={() => handleChoosePaymentMethod("pix")}
              >
                <QrCode className="h-8 w-8 text-primary mx-auto mb-3" />
                <p className="font-semibold text-foreground">PIX</p>
                <p className="text-xs text-muted-foreground mt-1">Aprovação em minutos</p>
              </Card>
            </div>

            {/* CPF field (only for first subscription) */}
            {currentPlanCode === "free" && (
              <div className="space-y-2">
                <Label htmlFor="cpf" className="text-sm font-medium text-foreground">
                  CPF ou CNPJ
                </Label>
                <Input
                  id="cpf"
                  placeholder="000.000.000-00"
                  value={cpf}
                  onChange={(e) => setCpf(formatCpf(e.target.value))}
                  disabled={loading}
                  maxLength={18}
                />
                <p className="text-xs text-muted-foreground">Necessário para processar a assinatura.</p>
              </div>
            )}

            <Button
              size="lg"
              className="w-full gap-2"
              disabled={!paymentMethod || loading || (currentPlanCode === "free" && cpf.replace(/\D/g, "").length < 11)}
              onClick={handleStartCheckout}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Processando...
                </>
              ) : (
                <>
                  Concluir assinatura <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              Pagamento processado de forma segura via Asaas. Cancele a qualquer momento.
            </p>
          </div>
        )}

        {/* ═══════ STEP 3: Welcome ═══════ */}
        {step === 2 && (
          <div className="max-w-md mx-auto text-center space-y-6">
            {confirmStatus === "polling" && (
              <>
                <Loader2 className="h-16 w-16 animate-spin text-primary mx-auto" />
                <h1 className="text-2xl font-bold text-foreground">Confirmando sua assinatura...</h1>
                <p className="text-muted-foreground">
                  Estamos aguardando a confirmação do pagamento. Isso pode levar alguns segundos.
                </p>
              </>
            )}

            {confirmStatus === "confirmed" && (
              <>
                <div className="relative mx-auto w-20 h-20">
                  <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
                  <div className="relative flex items-center justify-center w-20 h-20 bg-primary rounded-full">
                    <CheckCircle2 className="h-10 w-10 text-primary-foreground" />
                  </div>
                </div>
                <h1 className="text-3xl font-bold text-foreground">Bem-vindo(a)! 🎉</h1>
                <p className="text-muted-foreground text-lg">
                  Sua assinatura foi ativada com sucesso. Agora você tem acesso a todos os recursos do seu novo plano.
                </p>
                <div className="space-y-3 pt-4">
                  <Button size="lg" className="w-full gap-2" onClick={handleWelcomeCTA}>
                    <Store className="h-5 w-5" /> Criar sua loja
                  </Button>
                  <Button variant="ghost" className="w-full" onClick={() => navigate("/dashboard")}>
                    Ir para o Dashboard
                  </Button>
                </div>
              </>
            )}

            {confirmStatus === "timeout" && (
              <>
                <Rocket className="h-16 w-16 text-muted-foreground mx-auto" />
                <h1 className="text-2xl font-bold text-foreground">Pagamento em processamento</h1>
                <p className="text-muted-foreground">
                  Seu pagamento está sendo processado. O plano será ativado automaticamente assim que confirmado.
                </p>
                <div className="space-y-3 pt-4">
                  <Button size="lg" className="w-full" onClick={() => navigate("/dashboard")}>
                    Ir para o Dashboard
                  </Button>
                  <Button variant="ghost" className="w-full" onClick={() => setConfirmStatus("polling")}>
                    Tentar verificar novamente
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
