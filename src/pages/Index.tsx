import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Check,
  CreditCard,
  LayoutDashboard,
  Users,
  Mail,
  BarChart3,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthProvider";
import { PUBLIC_PLANS, formatPlanPrice } from "@/data/publicPlans";

const BENEFITS = [
  {
    icon: CreditCard,
    title: "Checkout que converte",
    description: "PIX, cartão em até 12x e boleto com order bump e upsell nativos.",
  },
  {
    icon: LayoutDashboard,
    title: "Área de membros pronta",
    description: "Cursos, módulos, aulas e certificados sem precisar de plugin.",
  },
  {
    icon: Users,
    title: "Comunidade (Circles)",
    description: "Feed, eventos, ranking e mensagens diretas para engajar sua audiência.",
  },
  {
    icon: Mail,
    title: "E-mail e recuperação",
    description: "Captura de leads, automações e recuperação de carrinho abandonado.",
  },
  {
    icon: BarChart3,
    title: "Dados de verdade",
    description: "MRR, churn, LTV e atribuição de receita por origem em um só painel.",
  },
  {
    icon: ShieldCheck,
    title: "Pagamentos seguros",
    description: "Processamento via Asaas, split automático e repasses transparentes.",
  },
];

const FAQ = [
  {
    q: "Preciso pagar para começar?",
    a: "Não. O plano gratuito permite publicar seu primeiro produto e receber pagamentos. Você só migra de plano quando quiser mais recursos.",
  },
  {
    q: "Como recebo o dinheiro das vendas?",
    a: "Os pagamentos são processados pela Asaas. O valor fica disponível na sua carteira Kivo e você solicita o saque para sua conta bancária.",
  },
  {
    q: "Posso vender assinaturas recorrentes?",
    a: "Sim. Você pode cobrar acesso único, assinatura mensal ou anual, inclusive para comunidades e áreas de membros.",
  },
  {
    q: "Consigo usar meu próprio domínio?",
    a: "Sim, no plano Creator Pro você conecta seu domínio próprio e remove qualquer marca da Kivo.",
  },
  {
    q: "Existe fidelidade ou multa de cancelamento?",
    a: "Nenhuma. Você cancela quando quiser, direto no painel, sem taxa e sem burocracia.",
  },
];

export default function Index() {
  const { user } = useAuth();
  const [annual, setAnnual] = useState(false);

  useEffect(() => {
    document.title = "Kivo — venda produtos digitais, cursos e comunidades";
    const desc = document.querySelector('meta[name="description"]');
    if (desc) {
      desc.setAttribute(
        "content",
        "A Kivo reúne checkout, área de membros, comunidade e analytics em uma só plataforma. Comece grátis e venda seu produto digital hoje.",
      );
    }
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link to="/" className="text-lg font-bold tracking-tight text-foreground">
            Kivo
          </Link>
          <nav className="hidden items-center gap-6 md:flex">
            <a href="#beneficios" className="text-sm text-muted-foreground hover:text-foreground">
              Recursos
            </a>
            <Link to="/planos" className="text-sm text-muted-foreground hover:text-foreground">
              Planos
            </Link>
            <a href="#faq" className="text-sm text-muted-foreground hover:text-foreground">
              Dúvidas
            </a>
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <Button asChild size="sm">
                <Link to="/dashboard">Ir para o painel</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/login">Entrar</Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/signup">Criar conta grátis</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary/10 via-background to-background" />
          <div className="relative mx-auto max-w-4xl px-4 py-20 text-center md:py-28">
            <Badge variant="secondary" className="mb-6">
              Plataforma brasileira para criadores
            </Badge>
            <h1 className="text-4xl font-bold leading-tight tracking-tight text-foreground md:text-6xl">
              Venda seus produtos digitais sem juntar dez ferramentas
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
              Checkout, área de membros, comunidade, e-mails e relatórios financeiros no mesmo lugar.
              Publique hoje e receba por PIX, cartão ou boleto.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link to={user ? "/dashboard" : "/signup"}>
                  {user ? "Ir para o painel" : "Começar grátis"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/planos">Ver planos</Link>
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Sem cartão de crédito no plano gratuito. Cancele quando quiser.
            </p>
          </div>
        </section>

        {/* Benefits */}
        <section id="beneficios" className="border-t border-border py-20">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-center text-3xl font-bold text-foreground">
              Tudo que seu negócio digital precisa
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">
              Da primeira venda à operação com time, afiliados e comunidade ativa.
            </p>
            <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
              {BENEFITS.map((b) => (
                <Card key={b.title} className="border-border bg-card">
                  <CardContent className="p-6">
                    <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <b.icon className="h-5 w-5 text-primary" />
                    </div>
                    <h3 className="font-semibold text-foreground">{b.title}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">{b.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Plans */}
        <section id="planos" className="border-t border-border bg-muted/30 py-20">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-center text-3xl font-bold text-foreground">Planos simples e transparentes</h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">
              Comece grátis. Planos pagos com 14 dias de teste.
            </p>

            <div className="mt-6 flex items-center justify-center gap-2">
              <Button
                variant={annual ? "ghost" : "secondary"}
                size="sm"
                onClick={() => setAnnual(false)}
              >
                Mensal
              </Button>
              <Button
                variant={annual ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setAnnual(true)}
              >
                Anual <Badge variant="outline" className="ml-2 text-[10px]">-20%</Badge>
              </Button>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
              {PUBLIC_PLANS.map((plan) => {
                const price = annual ? plan.annualPrice : plan.monthlyPrice;
                return (
                  <Card
                    key={plan.code}
                    className={cn(
                      "relative border-border bg-card",
                      plan.popular && "border-primary ring-2 ring-primary/20",
                    )}
                  >
                    {plan.popular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <Badge className="px-3 text-xs">Mais popular</Badge>
                      </div>
                    )}
                    <CardContent className="flex h-full flex-col p-6">
                      <h3 className="text-lg font-bold text-foreground">{plan.name}</h3>
                      <p className="mb-4 mt-1 text-sm text-muted-foreground">{plan.description}</p>
                      <div className="mb-6">
                        {price === 0 ? (
                          <p className="text-3xl font-bold text-foreground">Grátis</p>
                        ) : (
                          <div className="flex items-baseline gap-1">
                            <span className="text-3xl font-bold text-foreground">{formatPlanPrice(price)}</span>
                            <span className="text-sm text-muted-foreground">/mês</span>
                          </div>
                        )}
                      </div>
                      <Button
                        asChild
                        className="mb-6 w-full"
                        variant={plan.popular ? "default" : "outline"}
                      >
                        <Link to={user ? "/pricing" : `/signup?plan=${plan.code}`}>
                          {plan.code === "free" ? "Começar grátis" : "Testar 14 dias grátis"}
                        </Link>
                      </Button>
                      <ul className="flex-1 space-y-2.5">
                        {plan.features
                          .filter((f) => f.included)
                          .slice(0, 6)
                          .map((f) => (
                            <li key={f.text} className="flex items-start gap-2 text-sm text-foreground">
                              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                              {f.text}
                            </li>
                          ))}
                      </ul>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="mt-8 text-center">
              <Button asChild variant="link">
                <Link to="/planos">Comparar todos os recursos</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="border-t border-border py-20">
          <div className="mx-auto max-w-3xl px-4">
            <h2 className="text-center text-3xl font-bold text-foreground">Perguntas frequentes</h2>
            <Accordion type="single" collapsible className="mt-10">
              {FAQ.map((item, i) => (
                <AccordionItem key={item.q} value={`item-${i}`}>
                  <AccordionTrigger className="text-left">{item.q}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">{item.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-border bg-primary/5 py-20">
          <div className="mx-auto max-w-3xl px-4 text-center">
            <h2 className="text-3xl font-bold text-foreground md:text-4xl">
              Pronto para lançar seu produto?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              Crie sua conta em menos de dois minutos e comece a vender ainda hoje.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              {user ? (
                <Button asChild size="lg">
                  <Link to="/dashboard">Ir para o painel</Link>
                </Button>
              ) : (
                <>
                  <Button asChild size="lg">
                    <Link to="/signup">Criar conta grátis</Link>
                  </Button>
                  <Button asChild size="lg" variant="outline">
                    <Link to="/login">Já tenho conta</Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm text-muted-foreground md:flex-row">
          <span>© {new Date().getFullYear()} Kivo. Feito no Brasil.</span>
          <nav className="flex items-center gap-6">
            <Link to="/planos" className="hover:text-foreground">Planos</Link>
            <Link to="/terms" className="hover:text-foreground">Termos</Link>
            <Link to="/privacy" className="hover:text-foreground">Privacidade</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
