import { useState, useEffect } from "react";
import { trackEvent } from "@/lib/tracking";
import { useSmoothScroll } from "@/hooks/useSmoothScroll";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Check, ArrowRight, Store, Users, CalendarCheck, Mail,
  BarChart3, Shield, ChevronDown, Star,
} from "lucide-react";
import kivoLogo from "@/assets/kivo-logo.svg";
import kivoSymbol from "@/assets/kivo-symbol.svg";
import { AccordionGallery } from "@/components/landing/AccordionGallery";
import CreatorShowcase from "@/components/landing/CreatorShowcase";
import CreatorSlider from "@/components/landing/CreatorSlider";
import ValueProposition from "@/components/landing/ValueProposition";
import type { GalleryItem } from "@/components/landing/types";
import creator1 from "@/assets/testimonial-hanah.png";
import creator2 from "@/assets/testimonial-ana.png";
import creator3 from "@/assets/testimonial-sarah.png";
import creatorWorking from "@/assets/gallery/creator-working.jpg";

const GALLERY_ITEMS: GalleryItem[] = [
  {
    id: "1",
    title: "Rafaela Linhares",
    role: "Creator",
    imageUrl: creator1,
    quote: "Finalmente tenho controle total sobre o meu negócio. Comunidade, produtos e pagamentos, tudo num painel só.",
  },
  {
    id: "2",
    title: "Carlos Melo",
    role: "Creator",
    imageUrl: creator2,
    quote: "Saí da Hotmart em 3 dias e economizei mais de R$4.000 por mês em taxas. Não volto nunca mais.",
  },
  {
    id: "3",
    title: "Sarah Rodrigues",
    role: "Creator",
    imageUrl: creator3,
    quote: "Meu checkout converteu 38% mais no primeiro mês. O suporte resolve tudo em minutos.",
  },
];

/* ── A/B Test ── */
function getABVariant(): "A" | "B" {
  const stored = localStorage.getItem("kivo_ab_headline");
  if (stored === "A" || stored === "B") return stored;
  const v = Math.random() < 0.5 ? "A" : "B";
  localStorage.setItem("kivo_ab_headline", v);
  return v as "A" | "B";
}

const HEADLINES = {
  A: { title: "Monetize sua audiência sem depender de 5 ferramentas.", sub: "Loja, checkout, comunidade, cursos e email — num ecossistema só. Comece grátis." },
  B: { title: "Pague até 60% menos em taxas que Hotmart e Kiwify.", sub: "O ecossistema que devolve mais receita para quem cria. Comece grátis, sem cartão." },
};


/* ── FAQ ── */
const FAQ_ITEMS = [
  { q: "Preciso de cartão de crédito para começar?", a: "Não. O plano Free funciona sem cartão e sem pegadinha. Você só faz upgrade quando quiser." },
  { q: "Como funciona o checkout?", a: "Integrado com Pagar.me — aceita PIX, cartão e boleto. O dinheiro cai na sua conta em até 2 dias úteis." },
  { q: "Consigo migrar de outra plataforma?", a: "Sim. A maioria dos creators migra em menos de 30 minutos. Se precisar, a equipe ajuda na transição." },
  { q: "O suporte é em português?", a: "100%. Chat e email em português, com tempo médio de resposta abaixo de 10 minutos." },
  { q: "Quais formas de pagamento aceitas?", a: "PIX, cartão de crédito (até 12x) e boleto bancário. Tudo nativo no checkout, sem integração extra." },
  { q: "A Kivo é segura para operar?", a: "Infraestrutura AWS, criptografia de ponta a ponta e conformidade total com a LGPD." },
];

function FAQSection() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section id="faq" className="py-20">
      <div className="max-w-3xl mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-foreground text-center mb-2">Tire suas dúvidas</h2>
        <p className="text-center text-muted-foreground mb-10">Respostas rápidas para você decidir com confiança.</p>
        <div className="space-y-3">
          {FAQ_ITEMS.map((item, i) => {
            const isOpen = open === i;
            return (
              <button
                key={i}
                onClick={() => setOpen(isOpen ? null : i)}
                className="w-full text-left px-6 py-4 rounded-xl bg-card border border-border/50 hover:border-border transition-all duration-200 group"
              >
                <div className="flex justify-between items-center gap-4">
                  <span className="font-medium text-foreground text-sm md:text-base">{item.q}</span>
                  <ChevronDown className={`w-5 h-5 text-destructive shrink-0 transition-transform duration-300 ease-out ${isOpen ? "rotate-180" : ""}`} />
                </div>
                <div
                  className="grid transition-all duration-300 ease-out"
                  style={{ gridTemplateRows: isOpen ? "1fr" : "0fr", opacity: isOpen ? 1 : 0 }}
                >
                  <div className="overflow-hidden">
                    <p className="pt-3 text-sm text-muted-foreground leading-relaxed">{item.a}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
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
  useSmoothScroll();
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
    trackEvent("page_view", { ab_variant: variant, utm_source, utm_medium, utm_campaign });
  }, [searchParams, variant]);

  const ctaClick = (label: string) => {
    const utmData = JSON.parse(sessionStorage.getItem("kivo_utm") || "{}");
    sessionStorage.setItem("kivo_utm", JSON.stringify({ ...utmData, cta_clicked: label, cta_at: new Date().toISOString() }));
    trackEvent("cta_click", { label, ab_variant: variant });
  };

  return (
    <div className="min-h-screen bg-[#F8F1F1]">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-[#F8F1F1]/80 backdrop-blur border-b border-border/40">
        <div className="max-w-7xl mx-auto px-4 md:px-8 flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <img src={kivoSymbol} alt="" className="h-8 w-8" />
            <span className="text-xl font-bold text-foreground">Kivo</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-foreground/70 font-medium">
            <a href="#mission" className="hover:text-foreground transition-colors">Por quê</a>
            <a href="#features" className="hover:text-foreground transition-colors">Soluções</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Preços</a>
            <a href="#faq" className="hover:text-foreground transition-colors">Dúvidas</a>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="text-foreground/70 font-medium" onClick={() => navigate("/login")}>Entrar</Button>
            <Button size="sm" className="pill-radius bg-destructive hover:bg-destructive/90 text-destructive-foreground font-semibold px-6" onClick={() => { ctaClick("nav_cta"); navigate("/signup?utm_source=landing&utm_medium=nav"); }}>
              Criar Conta
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left — copy */}
            <div className="space-y-6">
              <Badge variant="outline" className="rounded-full border-border/60 text-foreground/80 bg-background px-4 py-1.5 text-sm font-medium gap-1.5">
                <Star className="w-3.5 h-3.5 text-primary fill-primary" />
                O ecossistema do creator
              </Badge>
              <h1 className="text-4xl md:text-5xl lg:text-[3.4rem] font-bold text-foreground leading-[1.1] tracking-tight">
                Monetize sua audiência{" "}
                <br className="hidden md:block" />
                sem depender de{" "}
                <br className="hidden md:block" />
                5 ferramentas.
              </h1>
              <p className="text-base md:text-lg text-foreground/60 max-w-lg leading-relaxed">
                Loja, checkout, comunidade, cursos e email — num ecossistema só. Comece grátis, escale sem limites.
              </p>
              <div className="pt-2">
                <Button
                  size="lg"
                  className="pill-radius bg-destructive hover:bg-destructive/90 text-destructive-foreground text-base font-semibold px-10 py-6 gap-2 shadow-lg shadow-destructive/20"
                  onClick={() => { ctaClick("hero_primary"); navigate("/signup?utm_source=landing&utm_medium=hero&utm_campaign=ab_" + variant); }}
                >
                  Criar minha conta grátis
                </Button>
              </div>
            </div>

            {/* Right — accordion gallery */}
            <div className="w-full">
              <AccordionGallery items={GALLERY_ITEMS} height="520px" />
            </div>
          </div>
        </div>
      </section>

      {/* Full-bleed image banner — mission */}
      <section id="mission" className="relative w-full h-[480px] md:h-[560px] lg:h-[640px] overflow-hidden">
        <img
          src={creatorWorking}
          alt="Creator trabalhando"
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
          width={1920}
          height={960}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-8 md:p-16 lg:p-20 max-w-4xl">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white leading-[1.1] mb-4">
            Seu negócio digital{" "}
            <br className="hidden md:block" />
            merece infraestrutura de verdade
          </h2>
          <p className="text-white/70 text-base md:text-lg max-w-lg leading-relaxed">
            Chega de improvisar com ferramentas soltas. Centralize tudo e foque no que importa: criar.
          </p>
        </div>
      </section>

      {/* Value Proposition */}
      <ValueProposition />

      {/* Creator Slider */}
      <CreatorSlider />

      {/* Features */}
      <section id="features" className="py-20 bg-muted/30 pt-0">
        <div className="max-w-6xl mx-auto px-4 pt-[48px]">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground">Cada peça do seu negócio, conectada</h2>
            <p className="text-muted-foreground mt-3 max-w-xl mx-auto">Ferramentas que funcionam juntas desde o primeiro clique.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: Store, title: "Storefront + Checkout", desc: "Vitrine profissional e checkout otimizado. PIX, cartão e boleto numa única experiência." },
              { icon: Users, title: "Comunidade Integrada", desc: "Engaje sua audiência com feed, gamificação, eventos ao vivo e cursos internos." },
              { icon: CalendarCheck, title: "Agenda & Mentorias", desc: "Booking nativo para consultorias. Seus clientes agendam e pagam direto." },
              { icon: Mail, title: "Email & Automações", desc: "Sequências inteligentes, recuperação de carrinho e campanhas segmentadas." },
              { icon: BarChart3, title: "Métricas em Tempo Real", desc: "Funil completo, coorte de clientes e dashboard executivo num só lugar." },
              { icon: Shield, title: "Fiscal Automático", desc: "NFS-e emitida automaticamente. Fechamento mensal sem planilha." },
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


      {/* Creator Showcase */}
      <CreatorShowcase />

      {/* Pricing Mini */}
      <section id="pricing" className="py-20 bg-[#F8F1F1]">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground">Planos transparentes, sem surpresa</h2>
            <p className="text-muted-foreground mt-3 max-w-xl mx-auto">Comece grátis. Faça upgrade quando seu negócio pedir.</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {PLANS_MINI.map((plan, i) => (
              <Card key={i} className={`card-radius border ${plan.popular ? "border-destructive ring-2 ring-destructive/20" : "bg-card"} hover:shadow-md transition-shadow relative`}>
                {plan.popular && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-destructive text-destructive-foreground text-xs px-3">Mais popular</Badge>
                )}
                <CardContent className="p-6 text-center space-y-4">
                  <h3 className="font-semibold text-foreground text-lg">{plan.name}</h3>
                  <p className="text-3xl font-bold text-foreground">{plan.price}</p>
                  <p className="text-sm text-muted-foreground">{plan.desc}</p>
                  <ul className="text-sm text-muted-foreground space-y-2 text-left">
                    {plan.features.map((f, j) => (
                      <li key={j} className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Calculator placeholder */}
      <section id="calculator" className="py-20">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-3">Compare suas taxas</h2>
          <p className="text-muted-foreground mb-6">Veja quanto você economiza operando com a Kivo vs. outras plataformas.</p>
          <p className="text-sm text-muted-foreground italic">Calculadora interativa em breve.</p>
        </div>
      </section>

      {/* FAQ */}
      <FAQSection />

      {/* Final CTA */}
      <section className="py-20 pt-[40px] pb-[100px]">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-3">Pronto para escalar seu negócio?</h2>
          <p className="text-muted-foreground mb-8">Crie sua conta em 30 segundos. Sem cartão, sem contrato.</p>
          <Button size="lg" className="pill-radius bg-destructive hover:bg-destructive/90 text-destructive-foreground gap-2 text-base px-8"
            onClick={() => { ctaClick("footer_cta"); navigate("/signup?utm_source=landing&utm_medium=footer"); }}>
            Começar agora — é grátis
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="pt-16 pb-8 bg-background">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-14">
            {/* Brand */}
            <div className="col-span-2 md:col-span-1 space-y-4">
              <div className="flex items-center gap-2">
                <img src={kivoSymbol} alt="" className="h-8 w-8" />
                <span className="text-xl font-bold text-foreground">Kivo</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-[220px]">
                O ecossistema completo para creators monetizarem sua audiência.
              </p>
            </div>

            {/* Navegue */}
            <div className="space-y-4">
              <h4 className="font-semibold text-foreground text-sm">Navegue</h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><a href="#features" className="hover:text-foreground transition-colors">Como Funciona</a></li>
                <li><a href="#calculator" className="hover:text-foreground transition-colors">Calculadora</a></li>
                <li><a href="#pricing" className="hover:text-foreground transition-colors">Preços</a></li>
                <li><a href="#faq" className="hover:text-foreground transition-colors">Dúvidas</a></li>
              </ul>
            </div>

            {/* Suporte */}
            <div className="space-y-4">
              <h4 className="font-semibold text-foreground text-sm">Suporte</h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><a href="/terms" className="hover:text-foreground transition-colors">Termos de Uso</a></li>
                <li><a href="/privacy" className="hover:text-foreground transition-colors">Políticas de Privacidade</a></li>
                <li><a href="#faq" className="hover:text-foreground transition-colors">FAQ</a></li>
              </ul>
            </div>

            {/* Social */}
            <div className="space-y-4">
              <h4 className="font-semibold text-foreground text-sm">Siga nossas redes sociais</h4>
              <div className="flex items-center gap-3">
                {[
                  { label: "Instagram", url: "https://instagram.com/kivohub", path: "M7.75 2h8.5A5.75 5.75 0 0 1 22 7.75v8.5A5.75 5.75 0 0 1 16.25 22h-8.5A5.75 5.75 0 0 1 2 16.25v-8.5A5.75 5.75 0 0 1 7.75 2Zm0 1.5A4.25 4.25 0 0 0 3.5 7.75v8.5A4.25 4.25 0 0 0 7.75 20.5h8.5A4.25 4.25 0 0 0 20.5 16.25v-8.5A4.25 4.25 0 0 0 16.25 3.5ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 1.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm5.25-2a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5Z" },
                ].filter(s => s.url !== "#").map((s) => (
                  <a key={s.label} href={s.url} target="_blank" rel="noopener noreferrer" aria-label={s.label} className="w-9 h-9 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground transition-colors">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d={s.path} /></svg>
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="border-t border-border pt-6">
            <p className="text-center text-sm text-muted-foreground">
              © Kivo Hub. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
