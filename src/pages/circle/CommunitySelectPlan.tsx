import { useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthProvider";
import { useJoinCommunity } from "@/hooks/useJoinCommunity";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Loader2, Check, ArrowLeft, Crown, Sparkles, Star,
  AlertCircle, ShieldCheck, CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface TierBenefit {
  label: string;
}

interface PublicTier {
  id: string;
  name: string;
  is_free: boolean;
  price_cents: number;
  billing_period: string | null;
  linked_product_id: string | null;
  sort_order: number;
  benefits: TierBenefit[];
}

function formatPrice(priceCents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(priceCents / 100);
}

function billingLabel(period: string | null): string {
  if (period === "yearly") return "/ano";
  if (period === "one_time") return " único";
  return "/mês";
}

function getTierCta(tier: PublicTier): string {
  if (tier.is_free) return "Entrar grátis";
  if (tier.billing_period === "one_time") return "Comprar acesso";
  return "Assinar plano";
}

/* ── Skeleton card while loading ── */
function TierCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 flex flex-col gap-4">
      <Skeleton className="h-5 w-24" />
      <Skeleton className="h-10 w-32" />
      <div className="space-y-2 flex-1">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-5/6" />
      </div>
      <Skeleton className="h-11 w-full rounded-lg" />
    </div>
  );
}

/* ── Checkout Modal ── */
function CircleCheckoutModal({
  open,
  onClose,
  tier,
  communityId,
  slug,
  navigate,
}: {
  open: boolean;
  onClose: () => void;
  tier: PublicTier | null;
  communityId: string;
  slug: string;
  navigate: (path: string) => void;
}) {
  const [holderName, setHolderName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [cpf, setCpf] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!tier) return null;

  const formatCardNumber = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(.{4})/g, "$1 ").trim();
  };

  const formatExpiry = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    if (digits.length >= 3) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return digits;
  };

  const formatCpf = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length > 9) return `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6,9)}-${digits.slice(9)}`;
    if (digits.length > 6) return `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6)}`;
    if (digits.length > 3) return `${digits.slice(0,3)}.${digits.slice(3)}`;
    return digits;
  };

  const handleSubmit = async () => {
    const rawNumber = cardNumber.replace(/\s/g, "");
    const [expMonth, expYear] = expiry.split("/");
    const rawCpf = cpf.replace(/\D/g, "");

    if (!holderName || rawNumber.length < 13 || !expMonth || !expYear || cvv.length < 3 || rawCpf.length < 11) {
      toast.error("Preencha todos os campos corretamente.");
      return;
    }

    setSubmitting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) {
        toast.error("Sessão expirada. Faça login novamente.");
        return;
      }

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/circle-subscription`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          action: "create",
          tier_id: tier.id,
          card_data: {
            holder_name: holderName,
            number: rawNumber,
            exp_month: expMonth,
            exp_year: expYear.length === 2 ? expYear : expYear.slice(-2),
            cvv,
            cpf: rawCpf,
            email: session?.session?.user?.email || "",
          },
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        toast.error(result.error || "Erro ao processar pagamento. Tente novamente.");
        return;
      }

      toast.success("Assinatura criada com sucesso! 🎉", {
        description: "Bem-vindo à comunidade!",
      });
      onClose();
      navigate(`/circles/${slug}/feed`);
    } catch (err: any) {
      toast.error("Erro inesperado. Tente novamente.");
      console.error("Checkout error:", err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Finalizar assinatura
          </DialogTitle>
          <DialogDescription>
            {tier.name} — {formatPrice(tier.price_cents)}{billingLabel(tier.billing_period)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="holder-name">Nome no cartão</Label>
            <Input
              id="holder-name"
              placeholder="Como está no cartão"
              value={holderName}
              onChange={(e) => setHolderName(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="card-number">Número do cartão</Label>
            <Input
              id="card-number"
              placeholder="0000 0000 0000 0000"
              value={cardNumber}
              onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
              maxLength={19}
              disabled={submitting}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="expiry">Validade</Label>
              <Input
                id="expiry"
                placeholder="MM/AA"
                value={expiry}
                onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                maxLength={5}
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cvv">CVV</Label>
              <Input
                id="cvv"
                placeholder="000"
                value={cvv}
                onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                maxLength={4}
                disabled={submitting}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cpf">CPF</Label>
            <Input
              id="cpf"
              placeholder="000.000.000-00"
              value={cpf}
              onChange={(e) => setCpf(formatCpf(e.target.value))}
              maxLength={14}
              disabled={submitting}
            />
          </div>

          <Button
            className="w-full h-11 font-semibold"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Processando...
              </>
            ) : (
              <>Assinar {formatPrice(tier.price_cents)}{billingLabel(tier.billing_period)}</>
            )}
          </Button>

          <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1">
            <ShieldCheck className="h-3 w-3" />
            Pagamento seguro e criptografado
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function CommunitySelectPlan() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const inviteCode = searchParams.get("invite") || undefined;
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loadingTierId, setLoadingTierId] = useState<string | null>(null);
  const [checkoutTier, setCheckoutTier] = useState<PublicTier | null>(null);

  const { fetchCommunity, joinAsExistingUser, isLoading: joinLoading } = useJoinCommunity(
    slug || "",
    inviteCode
  );

  const { data: community, isLoading: communityLoading } = useQuery({
    queryKey: ["public-community", slug],
    queryFn: fetchCommunity,
    enabled: !!slug,
  });

  const { data: tiers = [], isLoading: tiersLoading, isError: tiersError } = useQuery({
    queryKey: ["community-public-plans", community?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_community_public_plans" as any, {
        p_community_id: community!.id,
      });
      if (error) throw error;
      return (data || []) as PublicTier[];
    },
    enabled: !!community?.id,
  });

  const { data: existingMember } = useQuery({
    queryKey: ["member-exists-plans", community?.id, user?.id],
    queryFn: async () => {
      if (!user || !community) return null;
      const { data } = await supabase
        .from("community_members")
        .select("id, status")
        .eq("community_id", community.id)
        .eq("user_id", user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user && !!community?.id,
  });

  const { data: memberTiers = [] } = useQuery({
    queryKey: ["member-active-tiers", community?.id, user?.id],
    queryFn: async () => {
      if (!user || !community) return [];
      const { data } = await supabase.rpc("resolve_member_tiers" as any, {
        p_community_id: community.id,
        p_user_id: user.id,
      });
      return (data || []) as Array<{ tier_id: string }>;
    },
    enabled: !!user && !!community?.id && existingMember?.status === "ACTIVE",
  });

  const activeTierIds = new Set(memberTiers.map((t) => t.tier_id));

  const linkedProductIds = tiers
    .filter((t) => t.linked_product_id)
    .map((t) => t.linked_product_id!);

  const { data: linkedProducts = [] } = useQuery({
    queryKey: ["linked-products-for-tiers", linkedProductIds],
    queryFn: async () => {
      if (!linkedProductIds.length) return [];
      const { data } = await supabase
        .from("products")
        .select("id, slug, name")
        .in("id", linkedProductIds);
      return data || [];
    },
    enabled: linkedProductIds.length > 0,
  });

  const loading = communityLoading || tiersLoading;

  const highlightedTierId = tiers.reduce<string | null>((best, t) => {
    if (t.is_free) return best;
    if (!best) return t.id;
    const bestTier = tiers.find((x) => x.id === best);
    return bestTier && t.price_cents > bestTier.price_cents ? t.id : best;
  }, null);

  const handleTierAction = async (tier: PublicTier) => {
    if (!community) return;
    if (activeTierIds.has(tier.id)) return;

    setLoadingTierId(tier.id);
    try {
      if (tier.is_free) {
        if (!user) {
          navigate(`/circles/${slug}?action=join`);
          return;
        }
        await joinAsExistingUser(user.id, community);
        return;
      }

      if (tier.linked_product_id) {
        const product = linkedProducts.find((p) => p.id === tier.linked_product_id);
        if (product?.slug) {
          navigate(`/checkout/${product.slug}`);
        } else {
          toast.error("Produto vinculado não encontrado.");
        }
        return;
      }

      // Paid tier without linked product → open checkout modal
      if (!user) {
        navigate(`/circles/${slug}?action=join`);
        return;
      }

      setCheckoutTier(tier);
    } finally {
      setLoadingTierId(null);
    }
  };

  /* ── Loading skeleton ── */
  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="border-b border-border bg-card">
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-5 w-32" />
          </div>
        </div>
        <div className="max-w-4xl mx-auto px-4 py-10">
          <div className="text-center mb-10 space-y-2">
            <Skeleton className="h-8 w-56 mx-auto" />
            <Skeleton className="h-4 w-72 mx-auto" />
          </div>
          <div className="grid gap-6 max-w-2xl mx-auto grid-cols-1 md:grid-cols-2">
            <TierCardSkeleton />
            <TierCardSkeleton />
          </div>
        </div>
      </div>
    );
  }

  if (!community) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center space-y-3">
          <AlertCircle className="h-12 w-12 text-muted-foreground/40 mx-auto" />
          <h2 className="text-lg font-semibold text-foreground">Comunidade não encontrada</h2>
          <p className="text-sm text-muted-foreground">O link pode estar inválido ou a comunidade foi desativada.</p>
          <Button variant="outline" onClick={() => navigate("/circles/explore")}>Ver comunidades</Button>
        </div>
      </div>
    );
  }

  if (tiersError) {
    return (
      <div className="min-h-screen bg-background">
        <HeaderBar community={community} slug={slug!} navigate={navigate} />
        <div className="max-w-4xl mx-auto px-4 py-20 text-center space-y-3">
          <AlertCircle className="h-10 w-10 text-destructive/60 mx-auto" />
          <h2 className="text-lg font-semibold text-foreground">Erro ao carregar planos</h2>
          <p className="text-sm text-muted-foreground">Não foi possível carregar os planos. Tente novamente.</p>
          <Button variant="outline" onClick={() => window.location.reload()}>Tentar novamente</Button>
        </div>
      </div>
    );
  }

  if (tiers.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <HeaderBar community={community} slug={slug!} navigate={navigate} />
        <div className="max-w-4xl mx-auto px-4 py-20 text-center space-y-3">
          <Star className="h-10 w-10 text-muted-foreground/40 mx-auto" />
          <h2 className="text-lg font-semibold text-foreground">Nenhum plano disponível</h2>
          <p className="text-sm text-muted-foreground">Esta comunidade ainda não configurou planos de acesso.</p>
          <Button variant="outline" onClick={() => navigate(`/circles/${slug}`)}>Voltar</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <HeaderBar community={community} slug={slug!} navigate={navigate} />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="text-center mb-10">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
            Selecione seu plano
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base max-w-md mx-auto">
            Cada plano oferece diferentes benefícios. Escolha o melhor para você.
          </p>
        </div>

        <div
          className={cn(
            "grid gap-5 sm:gap-6 mx-auto",
            tiers.length === 1 && "max-w-md grid-cols-1",
            tiers.length === 2 && "max-w-2xl grid-cols-1 sm:grid-cols-2",
            tiers.length >= 3 && "max-w-4xl grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
          )}
        >
          {tiers.map((tier) => {
            const isHighlighted = tier.id === highlightedTierId;
            const isCurrentTier = activeTierIds.has(tier.id);
            const isThisLoading = loadingTierId === tier.id || (joinLoading && loadingTierId === tier.id);

            return (
              <div
                key={tier.id}
                className={cn(
                  "relative rounded-2xl border bg-card flex flex-col transition-all duration-200",
                  isHighlighted
                    ? "border-primary shadow-[0_4px_24px_-4px_hsl(var(--primary)/0.18)] scale-[1.02] sm:scale-[1.03]"
                    : "border-border hover:border-primary/30 hover:shadow-md",
                  isCurrentTier && "opacity-80"
                )}
              >
                {isHighlighted && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10">
                    <Badge className="bg-primary text-primary-foreground px-3.5 py-1 text-xs font-semibold gap-1.5 shadow-sm">
                      <Sparkles className="h-3 w-3" />
                      Mais popular
                    </Badge>
                  </div>
                )}

                {isCurrentTier && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10">
                    <Badge variant="secondary" className="px-3.5 py-1 text-xs font-semibold gap-1.5 shadow-sm">
                      <ShieldCheck className="h-3 w-3" />
                      Plano atual
                    </Badge>
                  </div>
                )}

                <div className="p-6 sm:p-7 flex flex-col flex-1">
                  <div className="flex items-center gap-2 mb-4">
                    <div className={cn(
                      "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                      tier.is_free ? "bg-muted" : "bg-primary/10"
                    )}>
                      {tier.is_free ? (
                        <Star className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Crown className="h-4 w-4 text-primary" />
                      )}
                    </div>
                    <h3 className="text-base font-bold text-foreground">{tier.name}</h3>
                  </div>

                  <div className="mb-5">
                    {tier.is_free ? (
                      <div>
                        <span className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight">
                          Grátis
                        </span>
                        <p className="text-xs text-muted-foreground mt-1">Para sempre</p>
                      </div>
                    ) : (
                      <div>
                        <span className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight">
                          {formatPrice(tier.price_cents)}
                        </span>
                        <span className="text-sm font-medium text-muted-foreground">
                          {billingLabel(tier.billing_period)}
                        </span>
                        {tier.billing_period === "yearly" && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatPrice(Math.round(tier.price_cents / 12))}/mês equivalente
                          </p>
                        )}
                        {tier.billing_period === "one_time" && (
                          <p className="text-xs text-muted-foreground mt-1">Pagamento único</p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="border-t border-border mb-5" />

                  <div className="flex-1 mb-6">
                    {tier.benefits && tier.benefits.length > 0 ? (
                      <ul className="space-y-3" role="list">
                        {tier.benefits.map((b, i) => (
                          <li key={i} className="flex items-start gap-2.5 text-sm text-foreground">
                            <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-px">
                              <Check className="h-3 w-3 text-primary" />
                            </div>
                            <span>{b.label}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <ul className="space-y-3" role="list">
                        <li className="flex items-start gap-2.5 text-sm text-muted-foreground">
                          <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center shrink-0 mt-px">
                            <Check className="h-3 w-3 text-muted-foreground" />
                          </div>
                          <span>Acesso à comunidade</span>
                        </li>
                        {!tier.is_free && (
                          <li className="flex items-start gap-2.5 text-sm text-muted-foreground">
                            <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center shrink-0 mt-px">
                              <Check className="h-3 w-3 text-muted-foreground" />
                            </div>
                            <span>Conteúdo exclusivo</span>
                          </li>
                        )}
                      </ul>
                    )}
                  </div>

                  <Button
                    className="w-full h-11 text-sm font-semibold"
                    variant={isCurrentTier ? "secondary" : isHighlighted ? "default" : tier.is_free ? "outline" : "default"}
                    size="lg"
                    disabled={isCurrentTier || isThisLoading}
                    onClick={() => handleTierAction(tier)}
                    aria-label={isCurrentTier ? `${tier.name} — plano atual` : getTierCta(tier)}
                  >
                    {isThisLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    {isCurrentTier ? "Plano atual" : getTierCta(tier)}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="text-center mt-10 space-y-1">
          <p className="text-xs text-muted-foreground">
            Você pode alterar ou cancelar seu plano a qualquer momento.
          </p>
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
            <ShieldCheck className="h-3 w-3" />
            Pagamento seguro e criptografado
          </p>
        </div>
      </div>

      {/* Checkout Modal */}
      <CircleCheckoutModal
        open={!!checkoutTier}
        onClose={() => setCheckoutTier(null)}
        tier={checkoutTier}
        communityId={community?.id || ""}
        slug={slug || ""}
        navigate={navigate}
      />
    </div>
  );
}

/* ── Reusable header bar ── */
function HeaderBar({
  community,
  slug,
  navigate,
}: {
  community: any;
  slug: string;
  navigate: (path: string) => void;
}) {
  return (
    <div className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur-sm">
      <div className="max-w-4xl mx-auto px-4 py-3.5 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => navigate(`/circles/${slug}`)}
          aria-label="Voltar para a comunidade"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2.5 min-w-0">
          {community.icon_url ? (
            <img
              src={community.icon_url}
              alt={community.name}
              className="h-7 w-7 rounded-lg object-cover shrink-0"
            />
          ) : (
            <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-primary">{community.name?.[0]}</span>
            </div>
          )}
          <span className="text-sm font-semibold text-foreground truncate">{community.name}</span>
        </div>
      </div>
    </div>
  );
}
