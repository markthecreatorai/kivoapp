export interface PublicPlan {
  code: string;
  name: string;
  monthlyPrice: number; // centavos
  annualPrice: number; // centavos (equivalente mensal no plano anual)
  description: string;
  trialDays: number;
  popular?: boolean;
  features: { text: string; included: boolean }[];
}

export const PUBLIC_PLANS: PublicPlan[] = [
  {
    code: "free",
    name: "Gratuito",
    monthlyPrice: 0,
    annualPrice: 0,
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
    code: "creator",
    name: "Creator",
    monthlyPrice: 4990,
    annualPrice: 3990,
    description: "Para criadores que já vendem e querem escalar",
    trialDays: 14,
    popular: true,
    features: [
      { text: "Produtos ilimitados", included: true },
      { text: "Checkout integrado", included: true },
      { text: "Link-in-bio (vitrine)", included: true },
      { text: "Área de membros completa", included: true },
      { text: "Email marketing", included: true },
      { text: "Sem marca Kivo", included: true },
      { text: "Programa de afiliados", included: true },
      { text: "1 comunidade (Circles)", included: true },
      { text: "Relatórios avançados", included: false },
    ],
  },
  {
    code: "creator-pro",
    name: "Creator Pro",
    monthlyPrice: 9990,
    annualPrice: 7990,
    description: "Para negócios digitais em operação acelerada",
    trialDays: 14,
    features: [
      { text: "Tudo do plano Creator", included: true },
      { text: "Comunidades ilimitadas", included: true },
      { text: "Relatórios avançados e BI", included: true },
      { text: "Automações e recuperação de carrinho", included: true },
      { text: "Order bump e upsell", included: true },
      { text: "Integrações (WhatsApp, IA)", included: true },
      { text: "Emissão de notas fiscais", included: true },
      { text: "Suporte prioritário", included: true },
      { text: "Domínio próprio", included: true },
    ],
  },
];

export function formatPlanPrice(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}
