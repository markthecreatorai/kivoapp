import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, X, ShieldCheck, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthProvider";
import { PUBLIC_PLANS, formatPlanPrice } from "@/data/publicPlans";

export default function PublicPricing() {
  const [annual, setAnnual] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    document.title = "Planos e preços da Kivo | Comece grátis";
    const desc = document.querySelector('meta[name="description"]');
    if (desc) {
      desc.setAttribute(
        "content",
        "Compare os planos da Kivo: gratuito, Creator e Creator Pro. Venda produtos digitais, crie área de membros e comunidade. 14 dias grátis.",
      );
    }
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-2 text-lg font-bold text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Kivo
          </Link>
          {user ? (
            <Button asChild size="sm">
              <Link to="/dashboard">Ir para o painel</Link>
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button asChild variant="ghost" size="sm">
                <Link to="/login">Entrar</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/signup">Criar conta grátis</Link>
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-12 md:py-20">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold text-foreground md:text-4xl">
            Planos para cada fase do seu negócio
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Comece grátis e escale quando quiser. Todos os planos pagos incluem 14 dias de teste grátis.
          </p>

          <div className="mt-6 flex items-center justify-center gap-3">
            <span className={cn("text-sm", !annual ? "font-semibold text-foreground" : "text-muted-foreground")}>
              Mensal
            </span>
            <Switch checked={annual} onCheckedChange={setAnnual} aria-label="Alternar cobrança anual" />
            <span className={cn("text-sm", annual ? "font-semibold text-foreground" : "text-muted-foreground")}>
              Anual
              <Badge variant="secondary" className="ml-2 text-[10px]">-20%</Badge>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {PUBLIC_PLANS.map((plan) => {
            const price = annual ? plan.annualPrice : plan.monthlyPrice;
            return (
              <Card
                key={plan.code}
                className={cn(
                  "relative rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md",
                  plan.popular && "border-primary ring-2 ring-primary/20",
                )}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="px-3 text-xs">Mais popular</Badge>
                  </div>
                )}
                <CardContent className="flex h-full flex-col p-6">
                  <h2 className="text-lg font-bold text-foreground">{plan.name}</h2>
                  <p className="mb-4 mt-1 text-sm text-muted-foreground">{plan.description}</p>

                  <div className="mb-4">
                    {price === 0 ? (
                      <p className="text-3xl font-bold text-foreground">Grátis</p>
                    ) : (
                      <>
                        <div className="flex items-baseline gap-1">
                          <span className="text-3xl font-bold text-foreground">{formatPlanPrice(price)}</span>
                          <span className="text-sm text-muted-foreground">/mês</span>
                        </div>
                        {annual && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Cobrado {formatPlanPrice(price * 12)} por ano
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  {plan.trialDays > 0 && (
                    <Badge variant="outline" className="mb-4 w-fit border-primary/30 text-xs text-primary">
                      {plan.trialDays} dias grátis
                    </Badge>
                  )}

                  <Button
                    asChild
                    className="mb-6 w-full"
                    variant={plan.popular ? "default" : "outline"}
                  >
                    <Link to={user ? "/pricing" : `/signup?plan=${plan.code}`}>
                      {plan.code === "free" ? "Começar grátis" : `Testar ${plan.trialDays} dias grátis`}
                    </Link>
                  </Button>

                  <div className="flex-1 space-y-2.5">
                    {plan.features.map((f) => (
                      <div key={f.text} className="flex items-start gap-2">
                        {f.included ? (
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        ) : (
                          <X className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40" />
                        )}
                        <span
                          className={cn(
                            "text-sm",
                            f.included ? "text-foreground" : "text-muted-foreground/60 line-through",
                          )}
                        >
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

        <div className="mt-10 space-y-2 text-center">
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span>Pagamento seguro processado por Asaas — autorizado pelo Banco Central</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Cancele a qualquer momento. Sem taxa de cancelamento. Sem fidelidade.
          </p>
        </div>
      </main>
    </div>
  );
}
