import { useState, useEffect } from "react";
import { trackEvent } from "@/lib/tracking";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Check, ArrowRight, Store, Users, CalendarCheck, Mail,
  BarChart3, Shield, Zap, Crown, Sparkles, ChevronDown, ChevronUp,
  Calculator,
} from "lucide-react";
import kivoLogo from "@/assets/kivo-logo.svg";

/* ── A/B Test ── */
function getABVariant(): "A" | "B" {
  const stored = localStorage.getItem("kivo_ab_headline");
  if (stored === "A" || stored === "B") return stored;
  const v = Math.random() < 0.5 ? "A" : "B";
  localStorage.setItem("kivo_ab_headline", v);
  return v as "A" | "B";
}

const HEADLINES = {
  A: { title: "Tudo que você precisa para vender digital. Em um só lugar.", sub: "Storefront, checkout, comunidade, cursos, email e afiliados — sem pagar por 5 ferramentas separadas." },
  B: { title: "Pague até 60% menos em taxas que Hotmart e Kiwify.", sub: "A plataforma all-in-one que devolve mais receita para o creator. Comece grátis, sem cartão." },
};

/* ── Savings Calculator ── */
function SavingsCalculator() {
  const [price, setPrice] = useState(97);
  const [sales, setSales] = useState(50);
  const navigate = useNavigate();

  const hotmartRate = 0.099 + 0.039; // ~13.9% total
  const kiwifyRate = 0.089 + 0.039;
  const kivoRate = 0.049;

  const gmv = price * sales;
  const hotmartFees = gmv * hotmartRate;
  const kiwifyFees = gmv * kiwifyRate;
  const kivoFees = gmv * kivoRate;
  const savingsHotmart = hotmartFees - kivoFees;
  const savingsKiwify = kiwifyFees - kivoFees;

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <section id="calculator" className="py-20 bg-muted/30">
      <div className="max-w-4xl mx-auto px-4">
        <div className="text-center mb-10">
          <Badge variant="secondary" className="mb-4"><Calculator className="w-3 h-3 mr-1" /> Calculadora</Badge>
          <h2 className="text-3xl font-bold text-foreground">Quanto você economiza com Kivo?</h2>
          <p className="text-muted-foreground mt-2">Compare suas taxas atuais com as nossas</p>
        </div>
        <Card className="card-radius overflow-hidden">
          <CardContent className="p-6 md:p-10">
            <div className="grid md:grid-cols-2 gap-8">
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label>Preço do produto (R$)</Label>
                  <Input type="number" value={price} onChange={e => setPrice(+e.target.value)} className="input-radius" min={1} />
                </div>
                <div className="space-y-2">
                  <Label>Vendas por mês</Label>
                  <Input type="number" value={sales} onChange={e => setSales(+e.target.value)} className="input-radius" min={1} />
                </div>
                <p className="text-sm text-muted-foreground">GMV mensal: <span className="font-semibold text-foreground">{fmt(gmv)}</span></p>
              </div>
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-destructive/10 space-y-1">
                  <p className="text-sm font-medium text-foreground">Hotmart (~13,9%)</p>
                  <p className="text-lg font-bold text-destructive">{fmt(hotmartFees)}/mês em taxas</p>
                </div>
                <div className="p-4 rounded-lg bg-muted space-y-1">
                  <p className="text-sm font-medium text-foreground">Kiwify (~12,8%)</p>
                  <p className="text-lg font-bold text-muted-foreground">{fmt(kiwifyFees)}/mês em taxas</p>
                </div>
                <div className="p-4 rounded-lg bg-accent space-y-1">
                  <p className="text-sm font-medium text-foreground">Kivo (4,9%)</p>
                  <p className="text-lg font-bold text-primary">{fmt(kivoFees)}/mês em taxas</p>
                </div>
                <Separator />
                <p className="text-center text-lg font-bold text-primary">
                  Economia de até {fmt(Math.max(savingsHotmart, savingsKiwify))}/mês
                </p>
                <Button className="w-full pill-radius gap-2" onClick={() => navigate("/signup?utm_source=calculator&utm_medium=landing")}>
                  Quero pagar menos taxas <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

/* ── FAQ ── */
const FAQ_ITEMS = [
  { q: "Preciso de cartão de crédito para começar?", a: "Não. O plano Free é grátis de verdade, sem necessidade de cartão." },
  { q: "Como funciona o checkout?", a: "Integrado com Pagar.me — aceita PIX, cartão e boleto. Você recebe na sua conta em poucos dias." },
  { q: "Posso migrar de outra plataforma?", a: "Sim. Você pode importar seus produtos e configurar tudo em menos de 30 minutos." },
  { q: "Tem suporte em português?", a: "Claro! Suporte por chat e email, 100% em português." },
];

function FAQSection() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section className="py-20 max-w-3xl mx-auto px-4">
      <h2 className="text-3xl font-bold text-foreground text-center mb-10">Perguntas frequentes</h2>
      <div className="space-y-3">
        {FAQ_ITEMS.map((item, i) => (
          <button key={i} onClick={() => setOpen(open === i ? null : i)} className="w-full text-left p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
            <div className="flex justify-between items-center">
              <span className="font-medium text-foreground">{item.q}</span>
              {open === i ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </div>
            {open === i && <p className="mt-3 text-sm text-muted-foreground">{item.a}</p>}
          </button>
        ))}
      </div>
    </section>
  );
}

/* ── Pricing Mini ── */
const PLANS_MINI = [
  { name: "Free", price: "R$0", desc: "Para começar", features: ["3 produtos", "Checkout integrado", "Storefront"] },
  { name: "Creator", price: "R$67/mês", desc: "Para crescer", popular: true, features: ["Produtos ilimitados", "Email marketing", "Afiliados", "Domínio custom"] },
  { name: "Business", price: "R$197/mês", desc: "Profissional", features: ["Tudo do Creator", "NFS-e automática", "API pública", "White-label"] },
];

/* ── Main Landing ── */
export default function LandingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const variant = getABVariant();
  const hl = HEADLINES[variant];

  // Track landing view
  useEffect(() => {
    const utm_source = searchParams.get("utm_source") || "direct";
    const utm_medium = searchParams.get("utm_medium") || "";
    const utm_campaign = searchParams.get("utm_campaign") || "";
    // Store UTMs for signup attribution
    sessionStorage.setItem("kivo_utm", JSON.stringify({ utm_source, utm_medium, utm_campaign, ab_variant: variant, landed_at: new Date().toISOString() }));
  }, [searchParams, variant]);

  const ctaClick = (label: string) => {
    const utmData = JSON.parse(sessionStorage.getItem("kivo_utm") || "{}");
    sessionStorage.setItem("kivo_utm", JSON.stringify({ ...utmData, cta_clicked: label, cta_at: new Date().toISOString() }));
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur border-b">
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <img src={kivoLogo} alt="Kivo" className="h-7" />
            <span className="text-xl font-bold text-foreground">Kivo</span>
          </div>
          <div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Recursos</a>
            <a href="#calculator" className="hover:text-foreground transition-colors">Calculadora</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Preços</a>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/login")}>Entrar</Button>
            <Button size="sm" className="pill-radius" onClick={() => { ctaClick("nav_cta"); navigate("/signup?utm_source=landing&utm_medium=nav"); }}>
              Começar grátis
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="py-20 md:py-32">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <Badge variant="secondary" className="mb-6 text-sm">
            <Zap className="w-3 h-3 mr-1" /> Plataforma brasileira para creators
          </Badge>
          <h1 className="text-4xl md:text-6xl font-bold text-foreground leading-tight tracking-tight">
            {hl.title}
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mt-6 max-w-2xl mx-auto">
            {hl.sub}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-10">
            <Button size="lg" className="pill-radius gap-2 text-base px-8" onClick={() => { ctaClick("hero_primary"); navigate("/signup?utm_source=landing&utm_medium=hero&utm_campaign=ab_" + variant); }}>
              Começar grátis <ArrowRight className="w-4 h-4" />
            </Button>
            <Button size="lg" variant="outline" className="pill-radius text-base px-8" onClick={() => navigate("/demo-store")}>
              Ver demo
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-4">Sem cartão de crédito · Setup em 5 minutos</p>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 bg-muted/30">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground">Tudo em uma plataforma</h2>
            <p className="text-muted-foreground mt-3 max-w-xl mx-auto">Pare de pagar por 5 ferramentas separadas. Tenha tudo integrado.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: Store, title: "Storefront + Checkout", desc: "Loja bonita e checkout otimizado para conversão. PIX, cartão e boleto." },
              { icon: Users, title: "Comunidade (Circle)", desc: "Comunidade integrada estilo Skool. Gamificação, eventos e cursos." },
              { icon: CalendarCheck, title: "Agendamentos", desc: "Venda mentorias e consultorias com booking integrado." },
              { icon: Mail, title: "Email Marketing", desc: "Sequências automáticas, carrinho abandonado e campanhas segmentadas." },
              { icon: BarChart3, title: "Analytics Completo", desc: "Funil de conversão, coorte de clientes e dashboard executivo." },
              { icon: Shield, title: "Fiscal Automático", desc: "Emissão automática de NFS-e e fechamento mensal simplificado." },
            ].map((f, i) => (
              <Card key={i} className="card-radius border bg-card hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="p-3 rounded-lg bg-primary/10 w-fit mb-4">
                    <f.icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground mb-2">{f.title}</h3>
                  <p className="text-sm text-muted-foreground">{f.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Calculator */}
      <SavingsCalculator />

      {/* Pricing */}
      <section id="pricing" className="py-20">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground">Preços simples, sem surpresa</h2>
            <p className="text-muted-foreground mt-2">Comece grátis. Faça upgrade quando precisar.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {PLANS_MINI.map((plan, i) => (
              <Card key={i} className={`card-radius transition-all hover:shadow-lg ${plan.popular ? "ring-2 ring-primary" : ""}`}>
                {plan.popular && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-4">Popular</Badge>
                )}
                <CardContent className="p-6 text-center space-y-4 pt-8">
                  <h3 className="text-xl font-bold text-foreground">{plan.name}</h3>
                  <p className="text-3xl font-bold text-primary">{plan.price}</p>
                  <p className="text-sm text-muted-foreground">{plan.desc}</p>
                  <ul className="space-y-2 text-sm text-left">
                    {plan.features.map((f, j) => (
                      <li key={j} className="flex items-center gap-2"><Check className="w-4 h-4 text-primary shrink-0" />{f}</li>
                    ))}
                  </ul>
                  <Button className="w-full pill-radius" variant={plan.popular ? "default" : "outline"}
                    onClick={() => { ctaClick("pricing_" + plan.name); navigate("/signup?utm_source=landing&utm_medium=pricing&utm_campaign=" + plan.name.toLowerCase()); }}>
                    {plan.name === "Free" ? "Começar grátis" : "Escolher plano"}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <FAQSection />

      {/* Final CTA */}
      <section className="py-20 kivo-gradient text-primary-foreground">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Pronto para vender mais e pagar menos?</h2>
          <p className="text-lg opacity-90 mb-8">Junte-se a creators que já economizam com Kivo.</p>
          <Button size="lg" variant="secondary" className="pill-radius gap-2 text-base px-8"
            onClick={() => { ctaClick("footer_cta"); navigate("/signup?utm_source=landing&utm_medium=footer"); }}>
            Começar grátis agora <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t">
        <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} Kivo. Todos os direitos reservados.</p>
          <div className="flex gap-6">
            <a href="/terms" className="hover:text-foreground">Termos</a>
            <a href="/privacy" className="hover:text-foreground">Privacidade</a>
            <a href="/pricing" className="hover:text-foreground">Preços</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
