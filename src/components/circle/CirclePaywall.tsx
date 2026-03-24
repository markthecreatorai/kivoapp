import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthProvider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MessageSquare, Users, BookOpen, Trophy, Calendar,
  Crown, Check, Star, Shield, Zap, Lock, CreditCard, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface Props {
  community: any;
  isPastDue?: boolean;
}

// Asaas.js tokenization helper
async function tokenizeCard(cardData: {
  number: string; holder_name: string;
  exp_month: string; exp_year: string; cvv: string;
  email: string; cpf?: string;
}): Promise<string | null> {
  // In production, use Asaas.js SDK for PCI-compliant tokenization
  // For sandbox/MVP: send card_data directly (Asaas sandbox accepts raw data)
  // TODO: Replace with Asaas.js tokenization when SDK is loaded
  // <script src="https://www.asaas.com/asaasJs/asaas.js"></script>
  console.warn("[Asaas] Using direct card data — replace with Asaas.js tokenization for production");
  return null; // null means "send card_data directly" (sandbox mode)
}

export default function CirclePaywall({ community, isPastDue = false }: Props) {
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedInterval, setSelectedInterval] = useState<"monthly" | "yearly">("monthly");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showCardForm, setShowCardForm] = useState(false);
  const [cardData, setCardData] = useState({
    number: "", holder_name: "", exp_month: "", exp_year: "", cvv: "",
  });

  const { data: plans, isLoading } = useQuery({
    queryKey: ["circle-plans", community.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("circle_plans" as any)
        .select("*")
        .eq("community_id", community.id)
        .eq("is_active", true)
        .order("price_cents", { ascending: true });
      return (data || []) as any[];
    },
  });

  const monthlyPlan = plans?.find((p: any) => p.interval === "monthly");
  const yearlyPlan = plans?.find((p: any) => p.interval === "yearly");
  const activePlan = selectedInterval === "yearly" && yearlyPlan ? yearlyPlan : monthlyPlan;

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
  };

  const yearlySavings = monthlyPlan && yearlyPlan
    ? Math.round(((monthlyPlan.price_cents * 12 - yearlyPlan.price_cents) / (monthlyPlan.price_cents * 12)) * 100)
    : 0;

  const handleSubscribe = async () => {
    if (!user || !activePlan) return;

    if (!session?.access_token) {
      toast.error("Sessão expirada. Faça login novamente.");
      return;
    }

    const hasTrial = activePlan.trial_days > 0;
    const isFree = activePlan.price_cents === 0;

    // If paid + no trial, need card
    if (!isFree && !hasTrial && !showCardForm) {
      setShowCardForm(true);
      return;
    }

    setIsProcessing(true);
    try {
      // Build card_data for Asaas (sandbox sends raw, prod uses token)
      let card_data: any = undefined;
      if (showCardForm && cardData.number) {
        // Attempt tokenization (returns null in sandbox mode)
        const token = await tokenizeCard({
          ...cardData,
          email: user.email || "",
        });

        if (token) {
          // Production: send only token
          card_data = { creditCardToken: token };
        } else {
          // Sandbox: send card details directly
          card_data = {
            number: cardData.number.replace(/\s/g, ""),
            holder_name: cardData.holder_name,
            exp_month: cardData.exp_month,
            exp_year: cardData.exp_year,
            cvv: cardData.cvv,
            email: user.email || "",
          };
        }
      }

      const { data, error } = await supabase.functions.invoke("circle-subscription", {
        body: { action: "create", plan_id: activePlan.id, card_data },
      });

      if (error) throw error;

      if (data?.status === "active" || data?.status === "trialing") {
        toast.success(
          data.status === "trialing"
            ? `Teste grátis de ${activePlan.trial_days} dias ativado!`
            : "Assinatura ativada! Bem-vindo à comunidade!"
        );
        queryClient.invalidateQueries({ queryKey: ["circle-member"] });
        queryClient.invalidateQueries({ queryKey: ["circle-subscription"] });
        navigate("/circle/feed");
      } else if (data?.requires_card) {
        setShowCardForm(true);
        toast.info("Informe os dados do cartão para continuar.");
      } else {
        toast.info("Assinatura criada. Aguardando confirmação de pagamento.");
      }
    } catch (err: any) {
      console.error("Subscribe error:", err);
      if (err?.message?.includes("Already subscribed")) {
        toast.info("Você já possui uma assinatura ativa.");
        queryClient.invalidateQueries({ queryKey: ["circle-member"] });
        navigate("/circle/feed");
      } else {
        toast.error(err?.message || "Erro ao processar assinatura. Tente novamente.");
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const benefits = [
    { icon: MessageSquare, text: "Acesso total ao feed da comunidade" },
    { icon: BookOpen, text: "Cursos e materiais exclusivos" },
    { icon: Calendar, text: "Eventos e encontros ao vivo" },
    { icon: Users, text: "Networking com outros membros" },
    { icon: Trophy, text: "Sistema de pontos e ranking" },
    { icon: Star, text: "Conteúdo atualizado semanalmente" },
  ];

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!plans?.length) {
    return (
      <div className="max-w-lg mx-auto p-8 text-center space-y-4">
        <Lock className="h-12 w-12 text-muted-foreground mx-auto" />
        <h2 className="text-xl font-bold text-foreground">Comunidade por Assinatura</h2>
        <p className="text-muted-foreground">
          O administrador ainda não configurou os planos de assinatura.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="max-w-lg w-full space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            {community.icon_url ? (
              <img src={community.icon_url} alt="" className="h-16 w-16 rounded-2xl object-cover" />
            ) : (
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Crown className="h-8 w-8 text-primary" />
              </div>
            )}
          </div>
          <h1 className="text-2xl font-bold text-foreground">{community.name}</h1>
          {community.description && (
            <p className="text-muted-foreground text-sm max-w-md mx-auto">{community.description}</p>
          )}
          <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="h-4 w-4" /> {community.member_count} membros
            </span>
            <span className="flex items-center gap-1">
              <MessageSquare className="h-4 w-4" /> {community.post_count} posts
            </span>
          </div>
        </div>

        {/* Interval toggle */}
        {monthlyPlan && yearlyPlan && (
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => setSelectedInterval("monthly")}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                selectedInterval === "monthly"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              Mensal
            </button>
            <button
              onClick={() => setSelectedInterval("yearly")}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors relative",
                selectedInterval === "yearly"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              Anual
              {yearlySavings > 0 && (
                <Badge className="absolute -top-2 -right-2 text-[10px] px-1.5 py-0 bg-accent text-accent-foreground">
                  -{yearlySavings}%
                </Badge>
              )}
            </button>
          </div>
        )}

        {/* Pricing card */}
        {activePlan && (
          <Card className="p-6 border-primary/30 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-primary" />
            <div className="text-center space-y-4">
              <div>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-4xl font-bold text-foreground">
                    {formatPrice(activePlan.price_cents)}
                  </span>
                  <span className="text-muted-foreground">
                    /{activePlan.interval === "yearly" ? "ano" : "mês"}
                  </span>
                </div>
                {activePlan.trial_days > 0 && (
                  <p className="text-sm text-primary font-medium mt-1">
                    <Zap className="h-3.5 w-3.5 inline mr-1" />
                    {activePlan.trial_days} dias grátis para começar
                  </p>
                )}
              </div>

              {/* Past due banner */}
              {isPastDue && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>Sua assinatura está inadimplente. Atualize seu método de pagamento.</span>
                </div>
              )}

              {/* Card form */}
              {showCardForm && (
                <div className="space-y-3 border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <CreditCard className="h-4 w-4" />
                    Dados do cartão
                  </div>
                  <div>
                    <Label className="text-xs">Número do cartão</Label>
                    <Input
                      placeholder="0000 0000 0000 0000"
                      value={cardData.number}
                      onChange={(e) => setCardData(p => ({ ...p, number: e.target.value }))}
                      maxLength={19}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Nome no cartão</Label>
                    <Input
                      placeholder="NOME COMPLETO"
                      value={cardData.holder_name}
                      onChange={(e) => setCardData(p => ({ ...p, holder_name: e.target.value.toUpperCase() }))}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs">Mês</Label>
                      <Input
                        placeholder="MM"
                        value={cardData.exp_month}
                        onChange={(e) => setCardData(p => ({ ...p, exp_month: e.target.value }))}
                        maxLength={2}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Ano</Label>
                      <Input
                        placeholder="AA"
                        value={cardData.exp_year}
                        onChange={(e) => setCardData(p => ({ ...p, exp_year: e.target.value }))}
                        maxLength={4}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">CVV</Label>
                      <Input
                        placeholder="***"
                        type="password"
                        value={cardData.cvv}
                        onChange={(e) => setCardData(p => ({ ...p, cvv: e.target.value }))}
                        maxLength={4}
                      />
                    </div>
                  </div>
                </div>
              )}

              <Button
                size="lg"
                className="w-full text-base"
                onClick={handleSubscribe}
                disabled={isProcessing || !user || (showCardForm && !cardData.number)}
              >
                {isProcessing ? (
                  <span className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground" />
                    Processando...
                  </span>
                ) : showCardForm ? (
                  `Pagar ${formatPrice(activePlan.price_cents)} e entrar`
                ) : activePlan.trial_days > 0 ? (
                  `Começar teste grátis de ${activePlan.trial_days} dias`
                ) : (
                  "Assinar e entrar"
                )}
              </Button>

              {!user && (
                <p className="text-xs text-muted-foreground">
                  <button onClick={() => navigate("/member/login?redirect=/circle")} className="text-primary hover:underline">
                    Faça login
                  </button>
                  {" "}para assinar
                </p>
              )}
            </div>
          </Card>
        )}

        {/* Benefits */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground text-center">O que está incluso</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {benefits.map((b, i) => (
              <div key={i} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-muted/40">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <b.icon className="h-4 w-4 text-primary" />
                </div>
                <span className="text-sm text-foreground">{b.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Trust */}
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Shield className="h-3.5 w-3.5" />
          <span>Pagamento seguro via Asaas · Cancele quando quiser</span>
        </div>
      </div>
    </div>
  );
}
