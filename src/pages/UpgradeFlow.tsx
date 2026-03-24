import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  Store,
  Copy,
  RefreshCw,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { usePlanCheckout, type SourceUI, type PixData } from "@/hooks/usePlanCheckout";
import { useExperiment } from "@/hooks/useExperiment";
import { trackEvent } from "@/lib/tracking";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

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

/* ─── Formatters ─── */
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

function formatCardNumber(value: string): string {
  return value.replace(/\D/g, "").slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 ");
}

function formatExpiry(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length > 2) return digits.slice(0, 2) + "/" + digits.slice(2);
  return digits;
}

/* ─── Step indicator ─── */
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

/* ─── PIX Modal ─── */
function PixModal({
  open,
  onOpenChange,
  pixData,
  onConfirmed,
  onRegeneratePix,
  regenerating,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pixData: PixData | null;
  onConfirmed: () => void;
  onRegeneratePix: () => void;
  regenerating: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [polling, setPolling] = useState(true);

  const handleCopy = () => {
    if (pixData?.copy_paste) {
      navigator.clipboard.writeText(pixData.copy_paste);
      setCopied(true);
      toast({ title: "Código PIX copiado!" });
      setTimeout(() => setCopied(false), 3000);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-primary" />
            Pague com PIX
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {pixData?.qr_code_image ? (
            <div className="flex justify-center">
              <img
                src={`data:image/png;base64,${pixData.qr_code_image}`}
                alt="QR Code PIX"
                className="w-56 h-56 rounded-lg border border-border"
              />
            </div>
          ) : (
            <div className="flex justify-center items-center h-56">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {pixData?.copy_paste && (
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Código PIX (copia e cola)</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={pixData.copy_paste}
                  className="text-xs font-mono"
                />
                <Button variant="outline" size="icon" onClick={handleCopy} className="shrink-0">
                  {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )}

          {pixData?.expiration_date && (
            <p className="text-xs text-muted-foreground text-center">
              Expira em: {new Date(pixData.expiration_date).toLocaleString("pt-BR")}
            </p>
          )}

          <div className="flex items-center justify-center gap-2 py-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Aguardando pagamento...</span>
          </div>

          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={onRegeneratePix}
            disabled={regenerating}
          >
            {regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Gerar novo PIX
          </Button>
        </div>
      </DialogContent>
    </Dialog>
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
  const sourceUI = (searchParams.get("source_ui") || searchParams.get("source") || "upgrade_flow") as SourceUI;
  const feature = searchParams.get("feature") || "";

  const [step, setStep] = useState(0);
  const [selectedPlan, setSelectedPlan] = useState(preselected);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "pix" | null>(null);
  const [cpf, setCpf] = useState("");
  const [confirmStatus, setConfirmStatus] = useState<"polling" | "confirmed" | "timeout">("polling");
  const [currentPlanCode, setCurrentPlanCode] = useState<string>("free");

  // Card fields
  const [cardNumber, setCardNumber] = useState("");
  const [cardHolder, setCardHolder] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [cardError, setCardError] = useState("");

  // PIX state
  const [pixModalOpen, setPixModalOpen] = useState(false);
  const [pixData, setPixData] = useState<PixData | null>(null);
  const [pixPaymentId, setPixPaymentId] = useState<string | null>(null);
  const [regeneratingPix, setRegeneratingPix] = useState(false);

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

  // PIX polling for payment confirmation
  useEffect(() => {
    if (!pixModalOpen || !currentWorkspace) return;
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 90; // 3 minutes

    const poll = async () => {
      if (cancelled) return;
      attempts++;
      const { data } = await supabase
        .from("workspace_subscriptions")
        .select("status, plan_code")
        .eq("workspace_id", currentWorkspace.id)
        .in("status", ["active", "trialing"])
        .maybeSingle();

      if (data) {
        setPixModalOpen(false);
        setStep(2);
        setConfirmStatus("confirmed");
        trackEvent("upgrade_checkout_succeeded", { plan_code: data.plan_code, source_ui: sourceUI, method: "pix" });
        return;
      }
      if (attempts >= maxAttempts) {
        setPixModalOpen(false);
        setStep(2);
        setConfirmStatus("timeout");
        return;
      }
      if (!cancelled) setTimeout(poll, 2000);
    };
    poll();
    return () => { cancelled = true; };
  }, [pixModalOpen, currentWorkspace]);

  /* ─── Step 1: Choose plan ─── */
  const handleSelectPlan = (code: string) => {
    setSelectedPlan(code);
    trackEvent("upgrade_plan_selected", { plan_code: code, source_ui: sourceUI });
  };

  const handleContinueToPayment = () => {
    if (!selectedPlan || selectedPlan === "free") return;
    setStep(1);
  };

  /* ─── Step 2: Submit payment ─── */
  const isCardValid = () => {
    const num = cardNumber.replace(/\s/g, "");
    const parts = cardExpiry.split("/");
    return (
      num.length >= 13 &&
      cardHolder.trim().length >= 3 &&
      parts.length === 2 &&
      parts[0].length === 2 &&
      parts[1].length === 2 &&
      cardCvv.length >= 3
    );
  };

  const handleSubmitPayment = async () => {
    if (!paymentMethod || !selectedPlan) return;
    const cleanCpf = cpf.replace(/\D/g, "");
    setCardError("");

    // Mid-cycle upgrade
    if (currentPlanCode !== "free") {
      const success = await upgradeMidCycle({ planCode: selectedPlan, sourceUI });
      if (success) {
        setStep(2);
        setConfirmStatus("confirmed");
      }
      return;
    }

    if (paymentMethod === "card") {
      if (!isCardValid()) {
        setCardError("Preencha todos os campos do cartão corretamente.");
        return;
      }
      const parts = cardExpiry.split("/");
      const result = await startPlanCheckout({
        planCode: selectedPlan,
        sourceUI,
        cpf: cleanCpf || undefined,
        paymentMethod: "card",
        creditCard: {
          holderName: cardHolder.trim(),
          number: cardNumber.replace(/\s/g, ""),
          expiryMonth: parts[0],
          expiryYear: `20${parts[1]}`,
          ccv: cardCvv,
        },
      });

      if (result?.status === "active") {
        setStep(2);
        setConfirmStatus("confirmed");
      }
    } else {
      // PIX
      const result = await startPlanCheckout({
        planCode: selectedPlan,
        sourceUI,
        cpf: cleanCpf || undefined,
        paymentMethod: "pix",
      });

      if (result) {
        setPixData(result.pix || null);
        setPixPaymentId(result.payment_id || null);
        setPixModalOpen(true);
      }
    }
  };

  const handleRegeneratePix = async () => {
    setRegeneratingPix(true);
    const cleanCpf = cpf.replace(/\D/g, "");
    const result = await startPlanCheckout({
      planCode: selectedPlan,
      sourceUI,
      cpf: cleanCpf || undefined,
      paymentMethod: "pix",
    });
    if (result) {
      setPixData(result.pix || null);
      setPixPaymentId(result.payment_id || null);
    }
    setRegeneratingPix(false);
  };

  /* ─── Step 3: Confirmation polling (for redirect-based flows) ─── */
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

  // Handle return from billing pages
  useEffect(() => {
    const stepParam = searchParams.get("step");
    if (stepParam === "confirm") {
      setStep(2);
      setConfirmStatus("polling");
    } else if (stepParam === "cancel") {
      setStep(1);
      trackEvent("upgrade_checkout_failed", { source_ui: sourceUI, reason: "user_cancelled" });
    }
  }, [searchParams]);

  const handleWelcomeCTA = () => {
    trackEvent("upgrade_create_store_clicked", { source_ui: sourceUI });
    navigate("/store/editor");
  };

  const selectedPlanObj = plans.find((p) => p.code === selectedPlan);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8 md:py-16">
        {/* Back button */}
        {step < 2 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => (step === 0 ? navigate(-1) : setStep(0))}
            className="mb-6"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {step === 0 ? "Voltar" : "Voltar para planos"}
          </Button>
        )}

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
                  currentPlanCode === "creator-pro" ||
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

        {/* ═══════ STEP 2: Payment (inline) ═══════ */}
        {step === 1 && (
          <div className="space-y-6 max-w-lg mx-auto">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-foreground">Pagamento</h1>
              <p className="text-muted-foreground mt-2">
                Plano <strong>{selectedPlanObj?.name}</strong> — R${selectedPlanObj?.monthly}/mês
              </p>
            </div>

            {/* Payment method selector */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                className={cn(
                  "flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all",
                  paymentMethod === "card"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                )}
                onClick={() => { setPaymentMethod("card"); trackEvent("upgrade_payment_method_selected", { method: "card", plan_code: selectedPlan, source_ui: sourceUI }); }}
              >
                <CreditCard className={cn("h-6 w-6", paymentMethod === "card" ? "text-primary" : "text-muted-foreground")} />
                <span className={cn("text-sm font-medium", paymentMethod === "card" ? "text-foreground" : "text-muted-foreground")}>
                  Cartão de Crédito
                </span>
              </button>
              <button
                type="button"
                className={cn(
                  "flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all",
                  paymentMethod === "pix"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                )}
                onClick={() => { setPaymentMethod("pix"); trackEvent("upgrade_payment_method_selected", { method: "pix", plan_code: selectedPlan, source_ui: sourceUI }); }}
              >
                <QrCode className={cn("h-6 w-6", paymentMethod === "pix" ? "text-primary" : "text-muted-foreground")} />
                <span className={cn("text-sm font-medium", paymentMethod === "pix" ? "text-foreground" : "text-muted-foreground")}>
                  PIX
                </span>
              </button>
            </div>

            {/* Card form (inline) */}
            {paymentMethod === "card" && (
              <Card className="border-border">
                <CardContent className="p-4 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="card-number" className="text-sm">Número do cartão</Label>
                    <Input
                      id="card-number"
                      placeholder="0000 0000 0000 0000"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                      maxLength={19}
                      autoComplete="cc-number"
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="card-holder" className="text-sm">Nome no cartão</Label>
                    <Input
                      id="card-holder"
                      placeholder="Como está no cartão"
                      value={cardHolder}
                      onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
                      autoComplete="cc-name"
                      disabled={loading}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="card-expiry" className="text-sm">Validade</Label>
                      <Input
                        id="card-expiry"
                        placeholder="MM/AA"
                        value={cardExpiry}
                        onChange={(e) => setCardExpiry(formatExpiry(e.target.value))}
                        maxLength={5}
                        autoComplete="cc-exp"
                        disabled={loading}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="card-cvv" className="text-sm">CVV</Label>
                      <Input
                        id="card-cvv"
                        placeholder="000"
                        value={cardCvv}
                        onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                        maxLength={4}
                        autoComplete="cc-csc"
                        disabled={loading}
                        type="password"
                      />
                    </div>
                  </div>
                  {cardError && (
                    <p className="text-sm text-destructive">{cardError}</p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* PIX info */}
            {paymentMethod === "pix" && (
              <Card className="border-border">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <QrCode className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p>Ao confirmar, um <strong className="text-foreground">QR Code PIX</strong> será gerado.</p>
                      <p>Escaneie com o app do seu banco ou copie o código para pagar.</p>
                      <p>A ativação ocorre automaticamente após o pagamento.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* CPF field */}
            {currentPlanCode === "free" && (
              <div className="space-y-2">
                <Label htmlFor="cpf" className="text-sm font-medium text-foreground">CPF ou CNPJ</Label>
                <Input
                  id="cpf"
                  placeholder="000.000.000-00"
                  value={cpf}
                  onChange={(e) => setCpf(formatCpf(e.target.value))}
                  disabled={loading}
                  maxLength={18}
                />
              </div>
            )}

            {/* Submit button */}
            <Button
              size="lg"
              className="w-full gap-2"
              disabled={
                !paymentMethod ||
                loading ||
                (currentPlanCode === "free" && cpf.replace(/\D/g, "").length < 11) ||
                (paymentMethod === "card" && !isCardValid())
              }
              onClick={handleSubmitPayment}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Processando...
                </>
              ) : paymentMethod === "pix" ? (
                <>
                  Gerar PIX <QrCode className="h-4 w-4" />
                </>
              ) : (
                <>
                  Assinar agora <Shield className="h-4 w-4" />
                </>
              )}
            </Button>

            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Shield className="h-3 w-3" />
              <span>Pagamento seguro via Asaas. Cancele a qualquer momento.</span>
            </div>
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
                <QrCode className="h-16 w-16 text-muted-foreground mx-auto" />
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

        {/* PIX Modal */}
        <PixModal
          open={pixModalOpen}
          onOpenChange={setPixModalOpen}
          pixData={pixData}
          onConfirmed={() => {
            setPixModalOpen(false);
            setStep(2);
            setConfirmStatus("confirmed");
          }}
          onRegeneratePix={handleRegeneratePix}
          regenerating={regeneratingPix}
        />
      </div>
    </div>
  );
}
