import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Zap, Crown, Sparkles, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useExperiment } from "@/hooks/useExperiment";
import { trackEvent } from "@/lib/tracking";

const PLANS_BASE = [
  {
    id: "free",
    name: "Free",
    price: "R$0",
    period: "/mês",
    description: "Para começar a vender",
    icon: Zap,
    features: [
      "3 produtos",
      "100 leads",
      "Storefront básica",
      "Checkout integrado",
      "Com marca Kivo",
    ],
    excluded: ["Afiliados", "Email marketing", "Domínio custom"],
  },
  {
    id: "creator",
    name: "Creator",
    price: "R$67", // default, overridden by experiment
    period: "/mês",
    description: "Para quem quer crescer",
    icon: Crown,
    popular: true,
    features: [
      "Produtos ilimitados",
      "5.000 leads",
      "Email marketing",
      "Programa de afiliados",
      "Domínio customizado",
      "Sem marca Kivo",
      "Analytics avançado",
    ],
    excluded: [],
  },
  {
    id: "business",
    name: "Business",
    price: "R$197",
    period: "/mês",
    description: "Para profissionais e equipes",
    icon: Sparkles,
    features: [
      "Tudo do Creator",
      "White-label completo",
      "NFS-e automática",
      "Múltiplas circles",
      "API pública",
      "Suporte prioritário",
    ],
    excluded: [],
  },
];

export default function Pricing() {
  const navigate = useNavigate();
  const { variant: pricingVariant } = useExperiment("pricing_creator");

  const plans = PLANS_BASE.map(plan => {
    if (plan.id === "creator") {
      return { ...plan, price: pricingVariant === "B" ? "R$79" : "R$67" };
    }
    return plan;
  });

  const handleChoosePlan = (planId: string) => {
    trackEvent("upgrade_started", {
      plan: planId,
      experiment_key: "pricing_creator",
      variant: pricingVariant,
    });
    navigate("/settings?tab=billing");
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-12 md:py-20">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-8">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>

        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3">
            Planos & Preços
          </h1>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            Escolha o plano ideal para o seu momento. Faça upgrade ou downgrade a qualquer momento.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const Icon = plan.icon;
            return (
              <Card
                key={plan.id}
                className={`relative transition-all hover:shadow-lg ${
                  plan.popular ? "ring-2 ring-primary shadow-lg scale-[1.02]" : ""
                }`}
              >
                {plan.popular && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-4">
                    Popular
                  </Badge>
                )}
                <CardHeader className="text-center pb-2">
                  <div className="flex justify-center mb-3">
                    <div className="p-3 rounded-full bg-primary/10">
                      <Icon className="h-6 w-6 text-primary" />
                    </div>
                  </div>
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <div className="flex items-baseline justify-center gap-1 mt-2">
                    <span className="text-3xl font-bold text-foreground">{plan.price}</span>
                    <span className="text-muted-foreground">{plan.period}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{plan.description}</p>
                </CardHeader>

                <CardContent className="space-y-4 pt-4">
                  <ul className="space-y-2.5">
                    {plan.features.map((f, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        <Check className="h-4 w-4 text-primary shrink-0" />
                        {f}
                      </li>
                    ))}
                    {plan.excluded.map((f, i) => (
                      <li key={`ex-${i}`} className="flex items-center gap-2 text-sm text-muted-foreground line-through">
                        <span className="h-4 w-4 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  <Button
                    className="w-full mt-4"
                    variant={plan.popular ? "default" : "outline"}
                    onClick={() => handleChoosePlan(plan.id)}
                  >
                    {plan.id === "free" ? "Começar Grátis" : "Escolher Plano"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-8">
          Todos os planos incluem checkout integrado, PIX e cartão de crédito via Pagar.me.
        </p>
      </div>
    </div>
  );
}
