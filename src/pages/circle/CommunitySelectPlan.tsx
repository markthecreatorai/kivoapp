import { useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthProvider";
import { useJoinCommunity } from "@/hooks/useJoinCommunity";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, ArrowLeft, Crown, Sparkles, Star } from "lucide-react";
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

function formatTierPrice(priceCents: number, billingPeriod: string | null): string {
  const value = priceCents / 100;
  const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  if (billingPeriod === "yearly") return `${fmt}/ano`;
  if (billingPeriod === "one_time") return fmt;
  return `${fmt}/mês`;
}

function getTierCta(tier: PublicTier): string {
  if (tier.is_free) return `Entrar no ${tier.name}`;
  if (tier.billing_period === "one_time") return `Comprar ${tier.name}`;
  return `Assinar ${tier.name}`;
}

export default function CommunitySelectPlan() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const inviteCode = searchParams.get("invite") || undefined;
  const navigate = useNavigate();
  const { user } = useAuth();
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const { fetchCommunity, joinAsExistingUser, isLoading: joinLoading } = useJoinCommunity(
    slug || "",
    inviteCode
  );

  const { data: community, isLoading: communityLoading } = useQuery({
    queryKey: ["public-community", slug],
    queryFn: fetchCommunity,
    enabled: !!slug,
  });

  const { data: tiers = [], isLoading: tiersLoading } = useQuery({
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

  // Find linked product slugs for BUY_NOW tiers
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

  // Determine best/highlighted tier (most expensive paid tier)
  const highlightedTierId = tiers.reduce<string | null>((best, t) => {
    if (t.is_free) return best;
    if (!best) return t.id;
    const bestTier = tiers.find((x) => x.id === best);
    return bestTier && t.price_cents > bestTier.price_cents ? t.id : best;
  }, null);

  const handleTierAction = async (tier: PublicTier) => {
    if (!community) return;

    // Free tier → join directly
    if (tier.is_free) {
      if (!user) {
        // Redirect to join page to create account first
        navigate(`/c/${slug}?action=join`);
        return;
      }
      setActionLoading(true);
      try {
        await joinAsExistingUser(user.id, community);
      } finally {
        setActionLoading(false);
      }
      return;
    }

    // Tier with linked product → checkout for that product
    if (tier.linked_product_id) {
      const product = linkedProducts.find((p) => p.id === tier.linked_product_id);
      if (product?.slug) {
        navigate(`/checkout/${product.slug}`);
      } else {
        toast.error("Produto vinculado não encontrado.");
      }
      return;
    }

    // Paid tier without linked product → need to implement subscription checkout
    // For now, show a toast indicating this is a paid subscription
    if (!user) {
      navigate(`/c/${slug}?action=join`);
      return;
    }

    toast.info(`Assinatura do tier "${tier.name}" será processada em breve. Funcionalidade em desenvolvimento.`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!community) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Comunidade não encontrada.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => navigate(`/c/${slug}`)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2.5">
            {community.icon_url ? (
              <img src={community.icon_url} alt="" className="h-8 w-8 rounded-lg object-cover" />
            ) : (
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Star className="h-4 w-4 text-primary" />
              </div>
            )}
            <span className="font-semibold text-foreground">{community.name}</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="text-center mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
            Selecione seu plano
          </h1>
          <p className="text-muted-foreground">
            Escolha o plano ideal para você e comece a aproveitar a comunidade.
          </p>
        </div>

        {/* Tier Cards Grid */}
        <div
          className={cn(
            "grid gap-6 mx-auto",
            tiers.length === 1 && "max-w-sm grid-cols-1",
            tiers.length === 2 && "max-w-2xl grid-cols-1 md:grid-cols-2",
            tiers.length >= 3 && "max-w-4xl grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
          )}
        >
          {tiers.map((tier) => {
            const isHighlighted = tier.id === highlightedTierId;
            return (
              <Card
                key={tier.id}
                className={cn(
                  "relative flex flex-col p-6 transition-all",
                  isHighlighted
                    ? "border-primary shadow-lg ring-2 ring-primary/20"
                    : "border-border hover:border-primary/40 hover:shadow-md"
                )}
              >
                {/* Highlighted badge */}
                {isHighlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground px-3 py-0.5 text-xs font-semibold gap-1">
                      <Sparkles className="h-3 w-3" />
                      Recomendado
                    </Badge>
                  </div>
                )}

                {/* Tier header */}
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    {tier.is_free ? (
                      <Star className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <Crown className="h-5 w-5 text-primary" />
                    )}
                    <h3 className="text-lg font-bold text-foreground">{tier.name}</h3>
                  </div>

                  {/* Price */}
                  <div className="mb-1">
                    {tier.is_free ? (
                      <span className="text-3xl font-bold text-foreground">Grátis</span>
                    ) : (
                      <>
                        <span className="text-3xl font-bold text-foreground">
                          {formatTierPrice(tier.price_cents, tier.billing_period)}
                        </span>
                        {tier.billing_period && tier.billing_period !== "one_time" && (
                          <span className="text-sm text-muted-foreground ml-1">
                            / {tier.billing_period === "yearly" ? "ano" : "mês"}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Benefits */}
                {tier.benefits && tier.benefits.length > 0 && (
                  <ul className="space-y-2.5 mb-6 flex-1">
                    {tier.benefits.map((b, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                        <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        <span>{b.label}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {/* If no benefits, add spacer */}
                {(!tier.benefits || tier.benefits.length === 0) && (
                  <div className="flex-1 mb-6">
                    <p className="text-sm text-muted-foreground">
                      Acesso à comunidade {tier.is_free ? "básico" : "completo"}.
                    </p>
                  </div>
                )}

                {/* CTA Button */}
                <Button
                  className={cn(
                    "w-full",
                    isHighlighted
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : tier.is_free
                        ? ""
                        : ""
                  )}
                  variant={isHighlighted ? "default" : tier.is_free ? "outline" : "default"}
                  size="lg"
                  disabled={actionLoading || joinLoading}
                  onClick={() => handleTierAction(tier)}
                >
                  {(actionLoading || joinLoading) ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  {getTierCta(tier)}
                </Button>
              </Card>
            );
          })}
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-muted-foreground mt-8">
          Você pode alterar ou cancelar seu plano a qualquer momento.
        </p>
      </div>
    </div>
  );
}
