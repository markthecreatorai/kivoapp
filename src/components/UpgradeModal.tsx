import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Crown, Zap, ArrowRight, Check, Loader2 } from "lucide-react";
import { PLAN_LABELS, PLAN_UPGRADE_MAP, type PlanType } from "@/hooks/usePlanLimits";
import { useExperiment } from "@/hooks/useExperiment";
import { usePlanCheckout } from "@/hooks/usePlanCheckout";

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPlan: PlanType;
  feature: string;
}

const PLAN_FEATURES: Record<PlanType, string[]> = {
  FREE: ["1 produto", "Checkout integrado", "Link-in-bio"],
  CREATOR: [
    "Até 10 produtos",
    "1 curso com área de membros",
    "Até 500 contatos de email",
    "Até 5 afiliados",
    "Email marketing",
    "Cupons de desconto",
  ],
  CREATOR_PRO: [
    "Produtos ilimitados",
    "Cursos ilimitados",
    "Contatos ilimitados",
    "Afiliados ilimitados",
    "Automações avançadas",
    "Domínio customizado",
    "Suporte prioritário",
  ],
};

const PLAN_TO_CODE: Record<PlanType, string> = {
  FREE: "free",
  CREATOR: "creator",
  CREATOR_PRO: "creator-pro",
};

export function UpgradeModal({ open, onOpenChange, currentPlan, feature }: UpgradeModalProps) {
  const upgradeTo = PLAN_UPGRADE_MAP[currentPlan];
  const { variant: pricingVariant } = useExperiment("pricing_creator");
  const { variant: ctaVariant } = useExperiment("upgrade_cta");
  const { startPlanCheckout, upgradeMidCycle, loading } = usePlanCheckout();

  if (!upgradeTo) return null;

  const getPlanPrice = (plan: PlanType): string => {
    if (plan === "CREATOR") return pricingVariant === "B" ? "R$79/mês" : "R$67/mês";
    if (plan === "CREATOR_PRO") return "R$149/mês";
    return "R$0";
  };

  const getCtaText = (): string => {
    if (ctaVariant === "B") return "Economize em taxas — Upgrade";
    return "Fazer Upgrade";
  };

  const handleUpgrade = async () => {
    const targetCode = PLAN_TO_CODE[upgradeTo];

    // If upgrading from a paid plan (mid-cycle), use the immediate upgrade
    if (currentPlan !== "FREE") {
      const success = await upgradeMidCycle({
        planCode: targetCode,
        sourceUI: "locked_features_modal",
      });
      if (success) {
        onOpenChange(false);
        // Force reload to refresh plan limits
        window.location.reload();
      }
      return;
    }

    // First subscription (from FREE) -> checkout flow
    startPlanCheckout({
      planCode: targetCode,
      sourceUI: "locked_features_modal",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-full bg-primary/10">
              <Crown className="w-5 h-5 text-primary" />
            </div>
            <Badge variant="secondary" className="text-xs">
              {PLAN_LABELS[currentPlan]} → {PLAN_LABELS[upgradeTo]}
            </Badge>
          </div>
          <DialogTitle className="text-xl">
            Faça upgrade para {feature}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Seu plano {PLAN_LABELS[currentPlan]} atingiu o limite. 
            Desbloqueie mais recursos com o plano {PLAN_LABELS[upgradeTo]}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                Plano {PLAN_LABELS[upgradeTo]}
              </h3>
              <span className="text-sm font-bold text-primary">{getPlanPrice(upgradeTo)}</span>
            </div>
            <ul className="space-y-2">
              {PLAN_FEATURES[upgradeTo].map((feat, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-foreground">
                  <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                  {feat}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1" disabled={loading}>
            Agora não
          </Button>
          <Button className="flex-1 gap-2" onClick={handleUpgrade} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {loading ? "Processando..." : getCtaText()}
            {!loading && <ArrowRight className="w-4 h-4" />}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
