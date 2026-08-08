import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Check, X, Zap, Crown, Sparkles, ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthProvider";
import { usePlanLimits, PLAN_LABELS } from "@/hooks/usePlanLimits";

const PLANS = [
  {
    id: "free",
    code: "free",
    name: "Gratuito",
    monthlyPrice: 0,
    annualPrice: 0,
    icon: Zap,
    description: "Para quem está começando a vender online",
    trialDays: 0,
    features: [
      { text: "1 produto publicado", included: true },
      { text: "Checkout integrado", included: true },
      { text: "Link-in-bio (vitrine)", included: true },
      { text: "Pagamento PIX, cartão e boleto", included: true },
      { text: "Com marca Kivo", included: true },
      { text: "Área de membros", included: false },
      { text: "Email marketing", included: false },
      { text: "Programa de afiliados", included: false },
      { text: "Comunidade (Circles)", included: false },
    ],
  },
  {
    id: "creator",
    code: "creator",
    name: "Creator",
    monthlyPrice: 4990,
    annualPrice: 3990,
    icon: Crown,
    popular: true,
    description: "Para criadores que querem escalar suas vendas",
    trialDays: 14,
    features: [
      { text: "Até 10 produtos", included: true },
      { text: "Checkout integrado", included: true },
      { text: "Link-in-bio (vitrine)", included: true },
      { text: "Pagamento PIX, cartão e boleto", included: true },
      { text: "Sem marca Kivo", included: true },
      { text: "1 curso com área de membros", included: true },
      { text: "Até 500 contatos de email", included: true },
      { text: "Até 5 afiliados", included: true },
      { text: "Cupons de desconto", included: true },
      { text: "1 comunidade (Circles)", included: true },
    ],
  },
  {
    id: "creator-pro",
    code: "creator-pro",
    name: "Creator Pro",
    monthlyPrice: 12990,
    annualPrice: 9990,
    icon: Sparkles,
    description: "Para negócios digitais que precisam de tudo",
    trialDays: 14,
    features: [
      { text: "Produtos ilimitados", included: true },
      { text: "Checkout integrado", included: true },
      { text: "Link-in-bio (vitrine)", included: true },
      { text: "Pagamento PIX, cartão e boleto", included: true },
      { text: "Sem marca Kivo", included: true },
      { text: "Cursos ilimitados", included: true },
      { text: "Contatos ilimitados", included: true },
      { text: "Afiliados ilimitados", included: true },
      { text: "Automações avançadas", included: true },
      { text: "Domínio customizado", included: true },
      { text: "Comunidades ilimitadas", included: true },
      { text: "Suporte prioritário", included: true },
    ],
  },
];

const fmt = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

export default function Pricing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { plan: currentPlan } = usePlanLimits();
  const [annual, setAnnual] = useState(false);

  const handleSelect = (planCode: string) => {
    if (!user) {
      navigate(`/signup?plan=${planCode}`);
      return;
    }
    if (planCode === "free") return;
    navigate(`/billing/upgrade-flow?plan=${planCode}&source_ui=pricing_page`);
  };

  const currentCode = currentPlan === "CREATOR" ? "creator" : currentPlan === "CREATOR_PRO" ? "creator-pro" : "free";

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-12 md:py-20">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground">
            Planos para cada fase do seu negócio
          </h1>
          <p className="text-muted-foreground mt-3 max-w-xl mx-auto">
            Comece grátis, escale quando quiser. Todos os planos pagos incluem 14 dias de teste grátis.
          </p>

          {/* Billing toggle */}
          <div className="flex items-center justify-center gap-3 mt-6">
            <span className={cn("text-sm", !annual ? "font-semibold text-foreground" : "text-muted-foreground")}>Mensal</span>
            <Switch checked={annual} onCheckedChange={setAnnual} />
            <span className={cn("text-sm", annual ? "font-semibold text-foreground" : "text-muted-foreground")}>
              Anual
              <Badge variant="secondary" className="ml-2 text-[10px]">-20%</Badge>
            </span>
          </div>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map((plan) => {
            const price = annual ? plan.annualPrice : plan.monthlyPrice;
            const isCurrent = plan.code === currentCode;
            const isUpgrade = !isCurrent && plan.code !== "free";

            return (
              <Card
                key={plan.id}
                className={cn(
                  "relative bg-card border rounded-xl shadow-sm transition-shadow hover:shadow-md",
                  plan.popular && "border-primary ring-2 ring-primary/20",
                )}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground px-3 text-xs">
                      Mais popular
                    </Badge>
                  </div>
                )}

                <CardContent className="p-6 flex flex-col h-full">
                  {/* Icon + Name */}
                  <div className="flex items-center gap-2 mb-2">
                    <plan.icon className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-bold text-foreground">{plan.name}</h3>
                  </div>

                  <p className="text-sm text-muted-foreground mb-4">{plan.description}</p>

                  {/* Price */}
                  <div className="mb-4">
                    {price === 0 ? (
                      <p className="text-3xl font-bold text-foreground">Grátis</p>
                    ) : (
                      <>
                        <div className="flex items-baseline gap-1">
                          <span className="text-3xl font-bold text-foreground">{fmt(price)}</span>
                          <span className="text-sm text-muted-foreground">/mês</span>
                        </div>
                        {annual && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Cobrado {fmt(price * 12)} por ano
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  {/* Trial badge */}
                  {plan.trialDays > 0 && (
                    <div className="mb-4">
                      <Badge variant="outline" className="text-xs text-primary border-primary/30">
                        {plan.trialDays} dias grátis
                      </Badge>
                    </div>
                  )}

                  {/* CTA */}
                  <Button
                    className={cn("w-full mb-6", plan.popular && "bg-primary hover:bg-primary/90")}
                    variant={plan.popular ? "default" : "outline"}
                    disabled={isCurrent}
                    onClick={() => handleSelect(plan.code)}
                  >
                    {isCurrent
                      ? "Plano atual"
                      : plan.code === "free"
                      ? "Começar grátis"
                      : plan.trialDays > 0
                      ? `Testar ${plan.trialDays} dias grátis`
                      : "Assinar agora"}
                  </Button>

                  {/* Features */}
                  <div className="space-y-2.5 flex-1">
                    {plan.features.map((f) => (
                      <div key={f.text} className="flex items-start gap-2">
                        {f.included ? (
                          <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        ) : (
                          <X className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-0.5" />
                        )}
                        <span className={cn("text-sm", f.included ? "text-foreground" : "text-muted-foreground/60 line-through")}>
                          {f.text}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Trust footer */}
        <div className="text-center mt-10 space-y-2">
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span>Pagamento seguro processado por Asaas — autorizado pelo Banco Central</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Cancele a qualquer momento. Sem taxa de cancelamento. Sem fidelidade.
          </p>
        </div>
      </div>
    </div>
  );
}
